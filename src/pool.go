package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fatih/color"
)

func getDataFilePath(filename string) string {
	if _, err := os.Stat("data"); err == nil {
		return filepath.Join("data", filename)
	}
	if _, err := os.Stat("../data"); err == nil {
		return filepath.Join("../data", filename)
	}
	_ = os.MkdirAll("data", 0755)
	return filepath.Join("data", filename)
}

type ProxyItem struct {
	Address     string    `json:"address"`
	Protocol    string    `json:"protocol"` // "http", "socks4", "socks5"
	Country     string    `json:"country"`
	City        string    `json:"city"`
	Anonymity   string    `json:"anonymity"`
	ThreatScore int       `json:"threat_score"`
	Tier        string    `json:"tier"`
	Latency     int64     `json:"latency"`
	LastChecked time.Time `json:"last_checked"`
	FailStrikes int       `json:"fail_strikes"`
	HTTPS       bool      `json:"https"`
}

type ProxyPool struct {
	mu      sync.RWMutex
	proxies map[string]*ProxyItem
}

type SystemStatus struct {
	State               string    `json:"state"`
	CurrentTask         string    `json:"current_task"`
	ProgressTotal       int64     `json:"progress_total"`
	ProgressTested      int64     `json:"progress_tested"`
	LastHarvestTime     time.Time `json:"last_harvest_time"`
	NextHarvestTime     time.Time `json:"next_harvest_time"`
	HarvestIntervalMins int       `json:"harvest_interval_mins"`
	ActivePoolCount     int       `json:"active_pool_count"`
	TotalSources        int       `json:"total_sources"`
	ServerIP            string    `json:"server_ip"`
}

var (
	pool           = &ProxyPool{proxies: make(map[string]*ProxyItem)}
	poolFile       = getDataFilePath("live_pool.json")
	poolDirtyCount int64
	statusMu       sync.RWMutex
	statusData     = SystemStatus{
		State:               "IDLE",
		CurrentTask:         "Proxy Scraper & Health Checker Active",
		HarvestIntervalMins: 60,
	}
	myServerIP string
)

func (p *ProxyPool) SaveToFile() {
	p.mu.RLock()
	items := make([]*ProxyItem, 0, len(p.proxies))
	for _, item := range p.proxies {
		items = append(items, item)
	}
	p.mu.RUnlock()

	data, err := json.MarshalIndent(items, "", "  ")
	if err == nil {
		tmpFile := poolFile + ".tmp"
		if err := os.WriteFile(tmpFile, data, 0644); err == nil {
			_ = os.Rename(tmpFile, poolFile)
		}
	}
}

func startPeriodicSaver() {
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if atomic.SwapInt64(&poolDirtyCount, 0) > 0 {
				pool.SaveToFile()
			}
		}
	}()
}

func (p *ProxyPool) LoadFromFile() {
	p.mu.Lock()
	defer p.mu.Unlock()

	if fi, err := os.Stat(poolFile); err == nil {
		statusMu.Lock()
		statusData.LastHarvestTime = fi.ModTime()
		statusMu.Unlock()
	}

	data, err := os.ReadFile(poolFile)
	if err != nil {
		return
	}

	var items []*ProxyItem
	if json.Unmarshal(data, &items) == nil {
		seenAddrs := make(map[string]bool)
		cleanProxies := make(map[string]*ProxyItem)

		for _, it := range items {
			if it == nil || it.Address == "" {
				continue
			}
			host, _, err := net.SplitHostPort(it.Address)
			if err != nil || host == "" || host == myServerIP || host == "127.0.0.1" || host == "localhost" {
				continue
			}
			ip := net.ParseIP(host)
			if ip == nil || ip.IsPrivate() || ip.IsLoopback() || ip.IsUnspecified() || isCloudflareOrCDN(host) {
				continue
			}
			// Exclude fake Iron/unknown items, transparent proxies, or unverified country
			if it.Country == "UNKNOWN" || it.Country == "" || len(it.Country) != 2 || it.Anonymity == "Transparent" {
				continue
			}
			if it.Country == "US" && it.City == "New York" && strings.HasSuffix(it.Address, ":80") {
				continue
			}
			if seenAddrs[it.Address] {
				continue
			}
			seenAddrs[it.Address] = true

			key := fmt.Sprintf("%s://%s", it.Protocol, it.Address)
			cleanProxies[key] = it
		}

		p.proxies = cleanProxies
		color.HiGreen("  [STORAGE] Loaded %d verified proxies from %s", len(p.proxies), poolFile)
	}
}

func (p *ProxyPool) Exists(addr string) bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	httpKey := fmt.Sprintf("http://%s", addr)
	s4Key := fmt.Sprintf("socks4://%s", addr)
	s5Key := fmt.Sprintf("socks5://%s", addr)
	_, hasHTTP := p.proxies[httpKey]
	_, hasS4 := p.proxies[s4Key]
	_, hasS5 := p.proxies[s5Key]
	return hasHTTP || hasS4 || hasS5
}

func (p *ProxyPool) AddOrUpdate(item *ProxyItem) {
	p.mu.Lock()
	// Clean any previous protocol variants for this address to avoid duplicates
	delete(p.proxies, fmt.Sprintf("http://%s", item.Address))
	delete(p.proxies, fmt.Sprintf("socks4://%s", item.Address))
	delete(p.proxies, fmt.Sprintf("socks5://%s", item.Address))

	key := fmt.Sprintf("%s://%s", item.Protocol, item.Address)
	p.proxies[key] = item
	p.mu.Unlock()
	if atomic.AddInt64(&poolDirtyCount, 1) >= 40 {
		atomic.StoreInt64(&poolDirtyCount, 0)
		go pool.SaveToFile()
	}
}

func (p *ProxyPool) Remove(key string) {
	p.mu.Lock()
	delete(p.proxies, key)
	p.mu.Unlock()
	atomic.AddInt64(&poolDirtyCount, 1)
}

func filterPoolProxies(country, city, proto, tier string, maxLatency int, cleanOnly bool, anonymity string, limit int, randomize bool, httpsOnly bool) []*ProxyItem {
	pool.mu.RLock()
	defer pool.mu.RUnlock()

	cleanCountry := strings.ToUpper(strings.TrimSpace(country))
	cleanCity := strings.ToLower(strings.TrimSpace(city))
	cleanProto := strings.ToLower(strings.TrimSpace(proto))
	cleanTier := strings.ToLower(strings.TrimSpace(tier))
	cleanAnon := strings.ToLower(strings.TrimSpace(anonymity))

	var results []*ProxyItem
	for _, p := range pool.proxies {
		if cleanCountry != "" && cleanCountry != "ALL" && !strings.EqualFold(p.Country, cleanCountry) {
			continue
		}
		if cleanCity != "" && cleanCity != "all" && !strings.EqualFold(p.City, cleanCity) {
			continue
		}
		if cleanProto != "" && cleanProto != "all" {
			if cleanProto == "socks" {
				if p.Protocol != "socks4" && p.Protocol != "socks5" {
					continue
				}
			} else if !strings.EqualFold(p.Protocol, cleanProto) {
				continue
			}
		}
		if cleanTier != "" && cleanTier != "all" && !strings.EqualFold(p.Tier, cleanTier) {
			continue
		}
		if cleanAnon != "" && cleanAnon != "all" && !strings.EqualFold(p.Anonymity, cleanAnon) {
			continue
		}
		if cleanOnly && p.ThreatScore > 0 {
			continue
		}
		if maxLatency > 0 && p.Latency > int64(maxLatency) {
			continue
		}
		if httpsOnly && !p.HTTPS {
			continue
		}

		results = append(results, p)
	}

	if randomize && len(results) > 1 {
		rand.Shuffle(len(results), func(i, j int) {
			results[i], results[j] = results[j], results[i]
		})
	}

	if limit > 0 && limit < len(results) {
		results = results[:limit]
	}

	return results
}
