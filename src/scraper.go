package main

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fatih/color"
)

var sourceFile = getDataFilePath("proxy_source.txt")

var defaultSources = []string{
	"https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
	"https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list.txt",
	"https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
	"https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt",
	"https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
	"https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
	"https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks4.txt",
	"https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt",
	"https://cdn.jsdelivr.net/gh/TheSpeedX/PROXY-List@master/http.txt",
	"https://cdn.jsdelivr.net/gh/TheSpeedX/PROXY-List@master/socks5.txt",
	"https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
	"https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt",
	"https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt",
	"https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
	"https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt",
	"https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt",
	"https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/all.txt",
	"https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
	"https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt",
	"https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt",
	"https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt",
	"https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks4.txt",
	"https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks5.txt",
	"https://raw.githubusercontent.com/zevtyardt/proxy-list/main/http.txt",
	"https://raw.githubusercontent.com/zevtyardt/proxy-list/main/socks4.txt",
	"https://raw.githubusercontent.com/zevtyardt/proxy-list/main/socks5.txt",
	"https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt",
	"https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/http_proxies.txt",
	"https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks4_proxies.txt",
	"https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks5_proxies.txt",
	"https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/http.txt",
	"https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/socks4.txt",
	"https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/socks5.txt",
	"https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt",
	"https://raw.githubusercontent.com/casals-ar/proxy-list/main/http",
	"https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/http.txt",
	"https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/https.txt",
	"https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks4.txt",
	"https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks5.txt",
	"https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt",
	"https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt",
	"https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks4/data.txt",
	"https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt",
	"https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/http.txt",
	"https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks4.txt",
	"https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks5.txt",
	"https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/http.txt",
	"https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/socks4.txt",
	"https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/socks5.txt",
	"https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt",
	"https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-https.txt",
	"https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt",
	"https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt",
	"https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies.txt",
	"https://raw.githubusercontent.com/jetkai/proxy-list/main/archive/txt/proxies.txt",
	"https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/http_all.txt",
	"https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks4_all.txt",
	"https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks5_all.txt",
	"https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/http.txt",
	"https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/https.txt",
	"https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/socks4.txt",
	"https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/socks5.txt",
	"https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/http.txt",
	"https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/socks4.txt",
	"https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/socks5.txt",
	"https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt",
	"https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks4.txt",
	"https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt",
	"https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/proxylist.txt",
	"https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http&proxy_format=ipport&format=text",
	"https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=socks4&proxy_format=ipport&format=text",
	"https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=socks5&proxy_format=ipport&format=text",
	"https://raw.githubusercontent.com/hendrikbgr/Free-Proxy-Repo/master/proxy_list.txt",
	"https://raw.githubusercontent.com/andigwandi/free-proxy/main/proxy_list.txt",
	"https://raw.githubusercontent.com/almroot/proxylist/master/list.txt",
	"https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/all.txt",
	"https://raw.githubusercontent.com/elliottophellia/yakumo/master/results/http/global/http_checked.txt",
	"https://raw.githubusercontent.com/elliottophellia/yakumo/master/results/socks4/global/socks4_checked.txt",
	"https://raw.githubusercontent.com/elliottophellia/yakumo/master/results/socks5/global/socks5_checked.txt",
	"https://raw.githubusercontent.com/tuanminpay/live-proxy/master/http.txt",
	"https://raw.githubusercontent.com/tuanminpay/live-proxy/master/socks4.txt",
	"https://raw.githubusercontent.com/tuanminpay/live-proxy/master/socks5.txt",
	"https://raw.githubusercontent.com/proxio-io/proxy-list/main/http.txt",
	"https://raw.githubusercontent.com/proxio-io/proxy-list/main/socks4.txt",
	"https://raw.githubusercontent.com/proxio-io/proxy-list/main/socks5.txt",
	"https://raw.githubusercontent.com/Moleway/Free-Proxy-List/main/http.txt",
	"https://raw.githubusercontent.com/Moleway/Free-Proxy-List/main/socks4.txt",
	"https://raw.githubusercontent.com/Moleway/Free-Proxy-List/main/socks5.txt",
	"https://raw.githubusercontent.com/proxmint/free-proxy-list/main/proxies/socks4.txt",
	"https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/master/proxy_files/socks4_proxies.txt",
	"https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks4.txt",
	"https://raw.githubusercontent.com/proxy4parsing/proxy-list/main/http.txt",
	"https://raw.githubusercontent.com/stormsia/proxy-list/main/socks4.txt",
	"https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/sources/http.txt",
	"https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/sources/https.txt",
	"https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/sources/socks4.txt",
	"https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/sources/socks5.txt",
	"https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks5.txt",
	"https://raw.githubusercontent.com/jetkai/proxy-list/main/archive/txt/proxies-socks5.txt",
	"https://raw.githubusercontent.com/jetkai/proxy-list/main/archive/txt/proxies-socks4.txt",
}

// ensureAndLoadSources loads proxy source URLs from disk or initializes defaults.
func ensureAndLoadSources() []string {
	if _, err := os.Stat(sourceFile); os.IsNotExist(err) {
		file, err := os.Create(sourceFile)
		if err == nil {
			writer := bufio.NewWriter(file)
			writer.WriteString("# Proxy Sources (One URL per line - lines starting with # are comments)\n")
			for _, s := range defaultSources {
				writer.WriteString(s)
				writer.WriteByte('\n')
			}
			writer.Flush()
			file.Close()
			color.HiGreen("  [SOURCES] Created %s with %d default sources.", sourceFile, len(defaultSources))
		}
	}

	file, err := os.Open(sourceFile)
	if err != nil {
		return defaultSources
	}
	defer file.Close()

	var activeSources []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Non-empty, non-comment lines are active source URLs
		if line != "" && !strings.HasPrefix(line, "#") {
			activeSources = append(activeSources, line)
		}
	}
	if err := scanner.Err(); err != nil && len(activeSources) == 0 {
		return defaultSources
	}

	if len(activeSources) == 0 {
		return defaultSources
	}
	return activeSources
}

func runPoolHealthKeeper() {
	for {
		time.Sleep(5 * time.Minute)

		pool.mu.RLock()
		snapshot := make([]*ProxyItem, 0, len(pool.proxies))
		for _, item := range pool.proxies {
			snapshot = append(snapshot, item)
		}
		pool.mu.RUnlock()

		if len(snapshot) == 0 {
			continue
		}

		var wg sync.WaitGroup
		sem := make(chan struct{}, 200)

		for _, item := range snapshot {
			wg.Add(1)
			sem <- struct{}{}
			go func(p *ProxyItem) {
				defer wg.Done()
				defer func() { <-sem }()

				var client *http.Client
				var err error
				switch p.Protocol {
				case "http":
					client, err = getHTTPClient(p.Address, 3*time.Second)
				case "socks4":
					client, err = getSOCKS4Client(p.Address, 3*time.Second)
				default:
					client, err = getSOCKS5Client(p.Address, 3*time.Second)
				}

				key := fmt.Sprintf("%s://%s", p.Protocol, p.Address)
				if err != nil {
					p.FailStrikes++
				} else {
					cc, city, anon, tScore, tier, lat, https, ok := testProxyLive(client, p.Address)
					if ok {
						p.FailStrikes = 0
						p.Latency = lat
						p.LastChecked = time.Now()
						if cc != "" && cc != "UNKNOWN" {
							p.Country = cc
						}
						if city != "" {
							p.City = city
						}
						p.Anonymity = anon
						p.ThreatScore = tScore
						p.Tier = tier
						p.HTTPS = https
					} else {
						p.FailStrikes++
					}
				}

				if p.FailStrikes >= 2 {
					pool.Remove(key)
				}
			}(item)
		}
		wg.Wait()
		pool.SaveToFile()
	}
}

func runPeriodicHarvester(intervalHours int) {
	if intervalHours <= 0 {
		intervalHours = 1
	}
	for {
		sources := ensureAndLoadSources()

		statusMu.Lock()
		statusData.State = "RUNNING"
		statusData.CurrentTask = fmt.Sprintf("Scraping %d Dynamic Sources", len(sources))
		statusData.TotalSources = len(sources)
		statusData.ProgressTotal = 0
		statusData.ProgressTested = 0
		statusMu.Unlock()

		color.HiCyan("  [HARVEST] Scraping %d dynamic sources...", len(sources))

		var wg sync.WaitGroup
		var mu sync.Mutex
		candidates := make(map[string]struct{})

		for _, src := range sources {
			wg.Add(1)
			go func(link string) {
				defer wg.Done()
				c := &http.Client{Timeout: 35 * time.Second}
				req, err := http.NewRequest("GET", link, nil)
				if err != nil {
					return
				}
				req.Header.Set("User-Agent", "Mozilla/5.0")

				resp, err := c.Do(req)
				if err != nil {
					return
				}
				defer resp.Body.Close()

				reader := bufio.NewReader(resp.Body)
				for {
					line, err := reader.ReadString('\n')
					line = strings.TrimSpace(line)

					for _, prefix := range []string{"http://", "https://", "socks4://", "socks5://"} {
						line = strings.TrimPrefix(line, prefix)
					}
					if idx := strings.Index(line, "@"); idx != -1 {
						line = line[idx+1:]
					}

					if line != "" && strings.Contains(line, ":") && !strings.HasPrefix(line, "#") {
						parts := strings.Split(line, ":")
						if len(parts) >= 2 {
							ip := strings.TrimSpace(parts[0])
							flds := strings.Fields(parts[1])
							if len(flds) == 0 {
								continue
							}
							port := flds[0]
							if net.ParseIP(ip) != nil {
								ipObj := net.ParseIP(ip)
								if ipObj.IsPrivate() || ipObj.IsLoopback() || ipObj.IsUnspecified() || (myServerIP != "" && ip == myServerIP) || isCloudflareOrCDN(ip) {
									continue
								}
								if p, err := strconv.Atoi(port); err == nil && p > 0 && p <= 65535 {
									addr := fmt.Sprintf("%s:%d", ip, p)
									if !pool.Exists(addr) {
										mu.Lock()
										candidates[addr] = struct{}{}
										mu.Unlock()
									}
								}
							}
						}
					}

					if err != nil {
						break
					}
				}
			}(src)
		}
		wg.Wait()

		totalCand := int64(len(candidates))
		color.HiGreen("  [HARVEST] Discovered %d candidate endpoints. Probing...", totalCand)

		statusMu.Lock()
		statusData.CurrentTask = fmt.Sprintf("Verifying %d Endpoints", totalCand)
		statusData.ProgressTotal = totalCand
		statusData.ProgressTested = 0
		statusMu.Unlock()

		var testWg sync.WaitGroup
		sem := make(chan struct{}, 300)
		var testedCounter int64

		for addr := range candidates {
			testWg.Add(1)
			sem <- struct{}{}
			go func(a string) {
				defer testWg.Done()
				defer func() { <-sem }()
				defer func() {
					val := atomic.AddInt64(&testedCounter, 1)
					if val%250 == 0 || val == totalCand {
						statusMu.Lock()
						statusData.ProgressTested = val
						statusMu.Unlock()
					}
				}()

				// 1. Test SOCKS5 first
				if sc, err := getSOCKS5Client(a, 3500*time.Millisecond); err == nil {
					if cc, city, anon, tScore, tier, lat, https, ok := testProxyLive(sc, a); ok {
						pool.AddOrUpdate(&ProxyItem{
							Address:     a,
							Protocol:    "socks5",
							Country:     cc,
							City:        city,
							Anonymity:   anon,
							ThreatScore: tScore,
							Tier:        tier,
							Latency:     lat,
							LastChecked: time.Now(),
							HTTPS:       https,
						})
						return
					}
				}

				// 2. Test HTTP
				if hc, err := getHTTPClient(a, 3500*time.Millisecond); err == nil {
					if cc, city, anon, tScore, tier, lat, https, ok := testProxyLive(hc, a); ok {
						pool.AddOrUpdate(&ProxyItem{
							Address:     a,
							Protocol:    "http",
							Country:     cc,
							City:        city,
							Anonymity:   anon,
							ThreatScore: tScore,
							Tier:        tier,
							Latency:     lat,
							LastChecked: time.Now(),
							HTTPS:       https,
						})
						return
					}
				}

				// 3. Test SOCKS4
				if s4, err := getSOCKS4Client(a, 3500*time.Millisecond); err == nil {
					if cc, city, anon, tScore, tier, lat, https, ok := testProxyLive(s4, a); ok {
						pool.AddOrUpdate(&ProxyItem{
							Address:     a,
							Protocol:    "socks4",
							Country:     cc,
							City:        city,
							Anonymity:   anon,
							ThreatScore: tScore,
							Tier:        tier,
							Latency:     lat,
							LastChecked: time.Now(),
							HTTPS:       https,
						})
						return
					}
				}
			}(addr)
		}
		testWg.Wait()

		pool.SaveToFile()

		statusMu.Lock()
		statusData.State = "IDLE"
		statusData.CurrentTask = "Decentralized Grid Online"
		statusData.LastHarvestTime = time.Now()
		sleepDuration := time.Duration(intervalHours) * time.Hour
		statusData.NextHarvestTime = time.Now().Add(sleepDuration)
		statusData.HarvestIntervalMins = intervalHours * 60
		statusData.ActivePoolCount = len(pool.proxies)
		statusMu.Unlock()

		color.HiGreen("  [HARVEST] Sync complete. Active pool size: %d verified proxies", len(pool.proxies))
		time.Sleep(sleepDuration)
	}
}
