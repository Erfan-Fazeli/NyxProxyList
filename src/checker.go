package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fatih/color"
	"golang.org/x/net/proxy"
)

type GeoInfo struct {
	Country string
	City    string
}

type URLTestResult struct {
	Address    string `json:"address"`
	Protocol   string `json:"protocol"`
	Country    string `json:"country"`
	City       string `json:"city"`
	Tier       string `json:"tier"`
	Latency    int64  `json:"latency"`
	StatusCode int    `json:"status_code"`
	Passed     bool   `json:"passed"`
	Error      string `json:"error,omitempty"`
}

var (
	geoCache        sync.Map
	directGeoClient = &http.Client{Timeout: 3 * time.Second}
	geoProviderIdx  uint32
	ipsumDB         = make(map[string]int)
	ipsumDBMu       sync.RWMutex
)

const ipsumURL = "https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt"

func detectServerIP() string {
	endpoints := []string{
		"http://checkip.amazonaws.com/",
		"https://api.ipify.org",
		"https://icanhazip.com/",
		"https://ifconfig.me/ip",
		"https://ipinfo.io/ip",
	}
	client := &http.Client{Timeout: 4 * time.Second}
	for _, ep := range endpoints {
		resp, err := client.Get(ep)
		if err == nil {
			b, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err == nil {
				ip := strings.TrimSpace(string(b))
				if parsed := net.ParseIP(ip); parsed != nil && !parsed.IsPrivate() && !parsed.IsLoopback() {
					return ip
				}
			}
		}
	}
	return ""
}

func loadIPsumDatabase() {
	color.HiCyan("  [SECURITY] Syncing IPsum threat intelligence blacklist...")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(ipsumURL)
	if err != nil {
		color.Red("  [SECURITY] Failed to fetch IPsum: %v", err)
		return
	}
	defer resp.Body.Close()

	newDB := make(map[string]int)
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			score, err := strconv.Atoi(parts[1])
			if err == nil {
				newDB[parts[0]] = score
			}
		}
	}
	if err := scanner.Err(); err != nil {
		color.HiYellow("  [SECURITY] Scanner warning: %v", err)
	}

	ipsumDBMu.Lock()
	ipsumDB = newDB
	ipsumDBMu.Unlock()
	color.HiGreen("  [SECURITY] Loaded %d threat intelligence records into RAM", len(newDB))
}

func getThreatScore(ip string) int {
	ipsumDBMu.RLock()
	defer ipsumDBMu.RUnlock()
	if score, ok := ipsumDB[ip]; ok {
		return score
	}
	return 0
}

func getHTTPClient(addr string, timeout time.Duration) (*http.Client, error) {
	u, err := url.Parse("http://" + addr)
	if err != nil {
		return nil, err
	}
	return &http.Client{
		Transport: &http.Transport{
			Proxy:              http.ProxyURL(u),
			DisableKeepAlives:  true,
			DisableCompression: true,
			DialContext: (&net.Dialer{
				Timeout: timeout,
			}).DialContext,
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
			TLSHandshakeTimeout: timeout,
		},
		Timeout: timeout + 2000*time.Millisecond,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}, nil
}

func getSOCKS4Client(addr string, timeout time.Duration) (*http.Client, error) {
	return &http.Client{
		Transport: &http.Transport{
			DisableKeepAlives:     true,
			DisableCompression:    true,
			ResponseHeaderTimeout: timeout,
			DialContext: func(ctx context.Context, network, targetAddr string) (net.Conn, error) {
				d := net.Dialer{Timeout: timeout}
				conn, err := d.DialContext(ctx, "tcp", addr)
				if err != nil {
					return nil, err
				}

				_ = conn.SetDeadline(time.Now().Add(timeout))

				targetHost, targetPortStr, err := net.SplitHostPort(targetAddr)
				if err != nil {
					conn.Close()
					return nil, err
				}

				targetPort, err := strconv.Atoi(targetPortStr)
				if err != nil || targetPort <= 0 || targetPort > 65535 {
					conn.Close()
					return nil, fmt.Errorf("invalid port: %s", targetPortStr)
				}

				var req []byte
				if ipObj := net.ParseIP(targetHost); ipObj != nil {
					if ip4 := ipObj.To4(); ip4 != nil {
						// Standard SOCKS4 with direct IPv4
						req = []byte{
							0x04, 0x01,
							byte(targetPort >> 8), byte(targetPort & 0xff),
							ip4[0], ip4[1], ip4[2], ip4[3],
							0x00,
						}
					}
				}

				if len(req) == 0 {
					// SOCKS4a: Remote proxy performs hostname DNS resolution
					req = []byte{
						0x04, 0x01,
						byte(targetPort >> 8), byte(targetPort & 0xff),
						0x00, 0x00, 0x00, 0x01,
						0x00,
					}
					req = append(req, []byte(targetHost)...)
					req = append(req, 0x00)
				}

				if _, err := conn.Write(req); err != nil {
					conn.Close()
					return nil, err
				}

				resp := make([]byte, 8)
				if _, err := io.ReadFull(conn, resp); err != nil {
					conn.Close()
					return nil, err
				}
				if resp[1] != 0x5a {
					conn.Close()
					return nil, fmt.Errorf("socks4 rejected: 0x%02x", resp[1])
				}

				_ = conn.SetDeadline(time.Time{})
				return conn, nil
			},
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
			TLSHandshakeTimeout: timeout,
		},
		Timeout: timeout + 1500*time.Millisecond,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}, nil
}

func getSOCKS5Client(addr string, timeout time.Duration) (*http.Client, error) {
	dialer, err := proxy.SOCKS5("tcp", addr, nil, &net.Dialer{Timeout: timeout})
	if err != nil {
		return nil, err
	}
	return &http.Client{
		Transport: &http.Transport{
			DisableKeepAlives:  true,
			DisableCompression: true,
			DialContext: func(ctx context.Context, network, a string) (net.Conn, error) {
				if cd, ok := dialer.(proxy.ContextDialer); ok {
					return cd.DialContext(ctx, network, a)
				}
				return dialer.Dial(network, a)
			},
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
			TLSHandshakeTimeout: timeout,
		},
		Timeout: timeout + 2000*time.Millisecond,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}, nil
}

func inspectAnonymityLevel(client *http.Client) string {
	req, err := http.NewRequest("GET", "http://httpbin.org/get", nil)
	if err != nil {
		return "Anonymous"
	}
	req.Close = true
	req.Header.Set("User-Agent", "curl/7.88.1")

	resp, err := client.Do(req)
	if err != nil {
		return "Anonymous"
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil || resp.StatusCode != http.StatusOK {
		return "Anonymous"
	}

	var data struct {
		Headers map[string]string `json:"headers"`
		Origin  string            `json:"origin"`
	}
	if json.Unmarshal(body, &data) == nil {
		originLower := strings.ToLower(data.Origin)
		if myServerIP != "" && strings.Contains(originLower, myServerIP) {
			return "Transparent"
		}
		for k, v := range data.Headers {
			kLower := strings.ToLower(k)
			vLower := strings.ToLower(v)
			if strings.Contains(kLower, "forwarded") || strings.Contains(kLower, "real-ip") || strings.Contains(kLower, "client-ip") {
				if myServerIP != "" && strings.Contains(vLower, myServerIP) {
					return "Transparent"
				}
			}
			if kLower == "via" || kLower == "proxy-connection" || strings.Contains(kLower, "proxy") {
				return "Anonymous"
			}
		}
		return "Elite"
	}

	return "Anonymous"
}

func computeQualityTier(anonymity string, threatScore int, latency int64) string {
	if anonymity == "Transparent" || threatScore >= 3 {
		return "Iron"
	}
	if anonymity == "Elite" && threatScore == 0 && latency < 800 {
		return "Diamond"
	}
	if anonymity == "Elite" && threatScore == 0 {
		return "Gold"
	}
	if anonymity == "Anonymous" && threatScore == 0 {
		return "Silver"
	}
	return "Bronze"
}

func isCloudflareOrCDN(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return true
	}
	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}
	b0, b1 := ip4[0], ip4[1]
	// Cloudflare IPv4 ranges: 104.16.0.0/12, 172.64.0.0/13, 162.159.0.0/16, etc.
	if b0 == 104 && (b1 >= 16 && b1 <= 31) {
		return true
	}
	if b0 == 172 && (b1 >= 64 && b1 <= 71) {
		return true
	}
	if b0 == 162 && b1 == 159 {
		return true
	}
	if b0 == 141 && b1 == 101 {
		return true
	}
	if b0 == 108 && b1 == 162 {
		return true
	}
	if b0 == 198 && b1 == 41 {
		return true
	}
	return false
}

func getSubnet(ipStr string) string {
	parts := strings.Split(ipStr, ".")
	if len(parts) == 4 {
		return parts[0] + "." + parts[1] + "." + parts[2] + ".0/24"
	}
	return ipStr
}

func resolveGeoLocation(ip string) (string, string) {
	if ip == "" {
		return "", ""
	}

	// 1. Check exact IP in RAM cache
	if val, ok := geoCache.Load(ip); ok {
		g := val.(GeoInfo)
		if g.Country != "" && g.Country != "UNKNOWN" && len(g.Country) == 2 {
			return g.Country, g.City
		}
	}

	// 2. Check /24 subnet in RAM cache
	subnet := getSubnet(ip)
	if val, ok := geoCache.Load(subnet); ok {
		g := val.(GeoInfo)
		if g.Country != "" && g.Country != "UNKNOWN" && len(g.Country) == 2 {
			return g.Country, g.City
		}
	}

	var country, city string

	// Provider 1: ip-api.com
	if resp, err := directGeoClient.Get("http://ip-api.com/json/" + ip + "?fields=status,countryCode,city"); err == nil {
		if resp.StatusCode == http.StatusOK {
			var d struct {
				Status      string `json:"status"`
				CountryCode string `json:"countryCode"`
				City        string `json:"city"`
			}
			if json.NewDecoder(resp.Body).Decode(&d) == nil && d.Status == "success" && len(d.CountryCode) == 2 {
				country = strings.ToUpper(d.CountryCode)
				city = d.City
			}
		}
		resp.Body.Close()
	}

	// Provider 2: api.ipquery.io
	if country == "" {
		if resp, err := directGeoClient.Get("https://api.ipquery.io/" + ip); err == nil {
			if resp.StatusCode == http.StatusOK {
				var d struct {
					Location struct {
						CountryCode string `json:"country_code"`
						City        string `json:"city"`
					} `json:"location"`
				}
				if json.NewDecoder(resp.Body).Decode(&d) == nil && len(d.Location.CountryCode) == 2 {
					country = strings.ToUpper(d.Location.CountryCode)
					city = d.Location.City
				}
			}
			resp.Body.Close()
		}
	}

	// Provider 3: ipinfo.io
	if country == "" {
		if resp, err := directGeoClient.Get("https://ipinfo.io/" + ip + "/json"); err == nil {
			if resp.StatusCode == http.StatusOK {
				var d struct {
					Country string `json:"country"`
					City    string `json:"city"`
				}
				if json.NewDecoder(resp.Body).Decode(&d) == nil && len(d.Country) == 2 {
					country = strings.ToUpper(d.Country)
					city = d.City
				}
			}
			resp.Body.Close()
		}
	}

	// Provider 4: ipwhois.app
	if country == "" {
		if resp, err := directGeoClient.Get("https://ipwhois.app/json/" + ip); err == nil {
			if resp.StatusCode == http.StatusOK {
				var d struct {
					CountryCode string `json:"country_code"`
					City        string `json:"city"`
				}
				if json.NewDecoder(resp.Body).Decode(&d) == nil && len(d.CountryCode) == 2 {
					country = strings.ToUpper(d.CountryCode)
					city = d.City
				}
			}
			resp.Body.Close()
		}
	}

	// Provider 5: reallyfreegeoip.org
	if country == "" {
		if resp, err := directGeoClient.Get("https://reallyfreegeoip.org/json/" + ip); err == nil {
			if resp.StatusCode == http.StatusOK {
				var d struct {
					CountryCode string `json:"country_code"`
					City        string `json:"city"`
				}
				if json.NewDecoder(resp.Body).Decode(&d) == nil && len(d.CountryCode) == 2 {
					country = strings.ToUpper(d.CountryCode)
					city = d.City
				}
			}
			resp.Body.Close()
		}
	}

	if country != "" && country != "UNKNOWN" && len(country) == 2 {
		info := GeoInfo{Country: country, City: city}
		geoCache.Store(ip, info)
		geoCache.Store(subnet, info)
		return country, city
	}

	return "", ""
}

func testHTTPS(client *http.Client) bool {
	req, err := http.NewRequest("GET", "https://cp.cloudflare.com/generate_204", nil)
	if err == nil {
		req.Close = true
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
		resp, err := client.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 500 {
				return true
			}
		}
	}

	req2, err2 := http.NewRequest("GET", "https://www.google.com/generate_204", nil)
	if err2 != nil {
		return false
	}
	req2.Close = true
	req2.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	resp2, err2 := client.Do(req2)
	if err2 != nil {
		return false
	}
	resp2.Body.Close()
	return resp2.StatusCode >= 200 && resp2.StatusCode < 500
}

func testProxyLive(client *http.Client, proxyAddr string) (string, string, string, int, string, int64, bool, bool) {
	host, _, err := net.SplitHostPort(proxyAddr)
	if err != nil || host == "" || host == myServerIP || host == "127.0.0.1" || host == "localhost" {
		return "", "", "", 0, "", 0, false, false
	}
	ipObj := net.ParseIP(host)
	if ipObj == nil || ipObj.IsPrivate() || ipObj.IsLoopback() || ipObj.IsUnspecified() || isCloudflareOrCDN(host) {
		return "", "", "", 0, "", 0, false, false
	}

	if myServerIP == "" {
		myServerIP = detectServerIP()
	}

	start := time.Now()

	req, err := http.NewRequest("GET", "http://checkip.amazonaws.com/", nil)
	if err != nil {
		return "", "", "", 0, "", 0, false, false
	}
	req.Close = true

	resp, err := client.Do(req)
	if err != nil {
		return "", "", "", 0, "", 0, false, false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", "", "", 0, "", 0, false, false
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64))
	if err != nil {
		return "", "", "", 0, "", 0, false, false
	}

	exitIP := strings.TrimSpace(string(body))
	exitIPObj := net.ParseIP(exitIP)
	if exitIPObj == nil || exitIPObj.IsPrivate() || exitIPObj.IsLoopback() || exitIPObj.IsUnspecified() {
		return "", "", "", 0, "", 0, false, false
	}

	// CRITICAL: If the exit IP is our own server IP, it's not a real proxy!
	// It is a direct connection leak, transparent ISP gateway, or CDN reverse proxy.
	if myServerIP != "" && (exitIP == myServerIP || strings.Contains(exitIP, myServerIP)) {
		return "", "", "", 0, "", 0, false, false
	}

	latency := time.Since(start).Milliseconds()

	anonymity := inspectAnonymityLevel(client)
	// Transparent proxies that leak user real IP are strictly dropped
	if anonymity == "Transparent" {
		return "", "", "", 0, "", 0, false, false
	}

	country, city := resolveGeoLocation(exitIP)
	if country == "" || country == "UNKNOWN" || len(country) != 2 {
		country, city = resolveGeoLocation(host)
		if country == "" || country == "UNKNOWN" || len(country) != 2 {
			return "", "", "", 0, "", 0, false, false
		}
	}
	threatScore := getThreatScore(host)
	tier := computeQualityTier(anonymity, threatScore, latency)
	hasHTTPS := testHTTPS(client)

	return country, city, anonymity, threatScore, tier, latency, hasHTTPS, true
}

func cleanProxyError(err error) string {
	if err == nil {
		return ""
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "timeout") || strings.Contains(msg, "deadline exceeded") || strings.Contains(msg, "i/o timeout"):
		return "timeout (exceeded deadline)"
	case strings.Contains(msg, "bad request") || strings.Contains(msg, "proxyconnect") || strings.Contains(msg, "400"):
		return "proxy https tunnel rejected (bad request)"
	case strings.Contains(msg, "bad gateway") || strings.Contains(msg, "502"):
		return "proxy gateway error (bad gateway)"
	case strings.Contains(msg, "connection refused"):
		return "connection refused"
	case strings.Contains(msg, "reset by peer") || strings.Contains(msg, "broken pipe"):
		return "connection reset by peer"
	case strings.Contains(msg, "socks"):
		return "socks handshake failed"
	case strings.Contains(msg, "certificate") || strings.Contains(msg, "tls") || strings.Contains(msg, "handshake"):
		return "ssl/tls handshake failed"
	case strings.Contains(msg, "no such host") || strings.Contains(msg, "lookup"):
		return "dns resolution failed"
	default:
		return err.Error()
	}
}

func testProxyAgainstURL(item *ProxyItem, targetURL string, timeout time.Duration) *URLTestResult {
	res := &URLTestResult{
		Address:  item.Address,
		Protocol: item.Protocol,
		Country:  item.Country,
		City:     item.City,
		Tier:     item.Tier,
	}

	cleanURL := strings.TrimSpace(targetURL)
	if !strings.HasPrefix(cleanURL, "http://") && !strings.HasPrefix(cleanURL, "https://") {
		cleanURL = "https://" + cleanURL
	}

	parsedURL, err := url.Parse(cleanURL)
	if err != nil || parsedURL.Host == "" {
		res.Error = "invalid target url"
		return res
	}

	var client *http.Client
	switch item.Protocol {
	case "http":
		client, err = getHTTPClient(item.Address, timeout)
	case "socks4":
		client, err = getSOCKS4Client(item.Address, timeout)
	default:
		client, err = getSOCKS5Client(item.Address, timeout)
	}
	if err != nil {
		res.Error = err.Error()
		return res
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout+1000*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", cleanURL, nil)
	if err != nil {
		res.Error = err.Error()
		return res
	}
	req.Close = true
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")

	start := time.Now()
	resp, err := client.Do(req)
	res.Latency = time.Since(start).Milliseconds()

	if err != nil {
		res.Error = cleanProxyError(err)
		return res
	}
	defer resp.Body.Close()

	res.StatusCode = resp.StatusCode

	// Inspect response body sample for proxy internal error signatures
	bodySample, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	bodyStr := strings.ToLower(string(bodySample))

	// Detect proxy-level failures vs genuine target website responses
	if resp.StatusCode == http.StatusProxyAuthRequired || resp.Header.Get("Proxy-Authenticate") != "" {
		res.Passed = false
		res.Error = "proxy authentication required (407)"
		return res
	}

	if resp.StatusCode == http.StatusBadGateway || resp.StatusCode == http.StatusGatewayTimeout || resp.StatusCode == http.StatusServiceUnavailable {
		if strings.Contains(bodyStr, "squid") || strings.Contains(bodyStr, "proxy") || strings.Contains(bodyStr, "tinyproxy") || strings.Contains(bodyStr, "privoxy") {
			res.Passed = false
			res.Error = fmt.Sprintf("proxy gateway error (%d)", resp.StatusCode)
			return res
		}
	}

	if resp.StatusCode == http.StatusBadRequest {
		if strings.Contains(bodyStr, "squid") || strings.Contains(bodyStr, "proxy") || strings.Contains(bodyStr, "bad request") || strings.Contains(bodyStr, "could not connect") || strings.Contains(bodyStr, "cannot connect") {
			res.Passed = false
			res.Error = "proxy tunneling rejected (bad request)"
			return res
		}
	}

	// Any successful status or valid client response from the target host proves reachability
	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		if strings.Contains(bodyStr, "could not connect") || strings.Contains(bodyStr, "access denied by proxy") {
			res.Passed = false
			res.Error = "blocked by intermediate proxy"
		} else {
			res.Passed = true
		}
	} else if resp.StatusCode >= 400 && resp.StatusCode < 500 {
		if strings.Contains(bodyStr, "squid") || strings.Contains(bodyStr, "tinyproxy") || strings.Contains(bodyStr, "privoxy") || strings.Contains(bodyStr, "mikrotik") || strings.Contains(bodyStr, "access denied") || strings.Contains(bodyStr, "could not connect") {
			res.Passed = false
			res.Error = "blocked by intermediate proxy"
		} else {
			// Real target returned 401/403/404 (e.g. Cloudflare on target or path not found)
			res.Passed = true
		}
	} else {
		res.Passed = false
		res.Error = fmt.Sprintf("server error (%d)", resp.StatusCode)
	}

	return res
}
