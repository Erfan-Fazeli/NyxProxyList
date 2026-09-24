package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fatih/color"
	"golang.org/x/crypto/acme/autocert"
)

const miniAppHTML = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>NYX GLOBAL PROXY GRID</title>
  
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#09090b">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="NyxGrid">
  <link rel="apple-touch-icon" href="/icon.svg">
  <link rel="icon" type="image/svg+xml" href="/icon.svg">

  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            navy: {
              600: 'oklch(0.34 0.012 265 / <alpha-value>)',
              700: 'oklch(0.18 0.014 265 / <alpha-value>)',
              800: 'oklch(0.22 0.014 265 / <alpha-value>)',
              900: 'oklch(0.16 0.012 265 / <alpha-value>)'
            },
            well: { DEFAULT: 'oklch(0.13 0.012 265 / <alpha-value>)' },
            line: { DEFAULT: 'oklch(0.28 0.012 265 / <alpha-value>)', 2: 'oklch(0.34 0.012 265 / <alpha-value>)' },
            mint: {
              50: 'oklch(0.97 0.03 165 / <alpha-value>)',
              100: 'oklch(0.94 0.06 165 / <alpha-value>)',
              200: 'oklch(0.91 0.09 165 / <alpha-value>)',
              300: 'oklch(0.89 0.13 165 / <alpha-value>)',
              400: 'oklch(0.86 0.16 165 / <alpha-value>)',
              500: 'oklch(0.78 0.18 165 / <alpha-value>)',
              600: 'oklch(0.66 0.18 165 / <alpha-value>)',
              700: 'oklch(0.54 0.16 165 / <alpha-value>)',
              800: 'oklch(0.42 0.12 165 / <alpha-value>)',
              900: 'oklch(0.32 0.08 165 / <alpha-value>)'
            },
            brass: {
              400: 'oklch(0.78 0.09 85 / <alpha-value>)',
              500: 'oklch(0.68 0.12 85 / <alpha-value>)'
            },
            steel: {
              300: '#9fb0c7',
              400: '#8b9bb5',
              500: '#7b8ca0',
              600: '#5e6d82'
            },
            cyan: {
              400: 'oklch(0.86 0.13 200 / <alpha-value>)',
              500: 'oklch(0.78 0.15 200 / <alpha-value>)'
            }
          }
        }
      }
    };
  </script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: oklch(0.13 0.012 265);
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      background-image: 
        radial-gradient(circle at 50% 0%, rgba(0, 245, 155, 0.06) 0%, transparent 60%),
        radial-gradient(rgba(139, 155, 181, 0.08) 1px, transparent 1px);
      background-size: 100% 100%, 24px 24px;
      color: #d1d5db;
    }
    .mono { font-family: 'JetBrains Mono', 'SF Mono', monospace; }
  </style>
</head>
<body class="bg-well text-zinc-100 min-h-screen select-none">
  <div id="app" class="max-w-md mx-auto p-4 pb-20"></div>
  <script type="application/javascript" src="/app.js?v=17.0"></script>
</body>
</html>`

const pwaManifest = `{
  "name": "NYX GLOBAL PROXY GRID",
  "short_name": "NyxGrid",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}`

const serviceWorkerJS = `
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
`

const appIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="128" fill="#09090b"/>
  <path d="M256 96L128 160V256C128 340 182.4 416 256 448C329.6 416 384 340 384 256V160L256 96Z" fill="#18181b" stroke="#10b981" stroke-width="24"/>
  <path d="M216 256L248 288L304 224" stroke="#06b6d4" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

func startWebServer(port, domain, email string) {
	mux := http.NewServeMux()

	setCors := func(w http.ResponseWriter) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "*")
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, miniAppHTML)
	})

	mux.HandleFunc("/docs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, miniAppHTML)
	})

	mux.HandleFunc("/app.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("X-Content-Type-Options", "nosniff")

		data, err := os.ReadFile("src/app.js")
		if err != nil {
			data, err = os.ReadFile("app.js")
		}
		if err != nil {
			data, err = os.ReadFile("../src/app.js")
		}
		if err != nil {
			data, err = os.ReadFile("../app.js")
		}
		if err != nil {
			http.Error(w, "// app.js not found", http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write(data)
	})

	mux.HandleFunc("/manifest.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/manifest+json")
		fmt.Fprint(w, pwaManifest)
	})

	mux.HandleFunc("/sw.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		fmt.Fprint(w, serviceWorkerJS)
	})

	mux.HandleFunc("/icon.svg", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		fmt.Fprint(w, appIconSVG)
	})

	mux.HandleFunc("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "healthy",
			"timestamp": time.Now().Unix(),
			"uptime":    "online",
		})
	})

	mux.HandleFunc("/api/v1/countries", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		pool.mu.RLock()
		defer pool.mu.RUnlock()

		counts := make(map[string]int)
		for _, p := range pool.proxies {
			if p.Country != "" && p.Country != "UNKNOWN" {
				counts[p.Country]++
			}
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success":   true,
			"total":     len(counts),
			"countries": counts,
		})
	})

	mux.HandleFunc("/api/v1/cities", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		filterCountry := strings.ToUpper(r.URL.Query().Get("country"))

		pool.mu.RLock()
		defer pool.mu.RUnlock()

		counts := make(map[string]int)
		for _, p := range pool.proxies {
			if filterCountry != "" && filterCountry != "ALL" && strings.ToUpper(p.Country) != filterCountry {
				continue
			}
			if p.City != "" && p.City != "Unknown" {
				counts[p.City]++
			}
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"total":   len(counts),
			"cities":  counts,
		})
	})

	mux.HandleFunc("/api/v1/tiers", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		pool.mu.RLock()
		defer pool.mu.RUnlock()

		tiers := make(map[string]int)
		for _, p := range pool.proxies {
			tiers[p.Tier]++
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"tiers":   tiers,
		})
	})

	mux.HandleFunc("/api/v1/raw", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == "OPTIONS" {
			return
		}

		q := r.URL.Query()
		country := q.Get("country")
		city := q.Get("city")
		proto := q.Get("type")
		tier := q.Get("tier")
		anon := q.Get("anonymity")
		cleanOnly := q.Get("clean_only") == "true" || q.Get("clean_only") == "1"
		httpsOnly := q.Get("https") == "true" || q.Get("https") == "1"
		maxLat, _ := strconv.Atoi(q.Get("max_latency"))
		randomize := q.Get("random") == "true" || q.Get("random") == "1"
		limit, _ := strconv.Atoi(q.Get("limit"))

		results := filterPoolProxies(country, city, proto, tier, maxLat, cleanOnly, anon, limit, randomize, httpsOnly)

		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		if q.Get("download") == "true" || q.Get("download") == "1" {
			fnProto := "all"
			if proto != "" && strings.ToUpper(proto) != "ALL" {
				fnProto = strings.ToLower(proto)
			}
			fnCountry := "all"
			if country != "" && strings.ToUpper(country) != "ALL" {
				fnCountry = strings.ToLower(country)
			}
			fnCity := "all"
			if city != "" && strings.ToUpper(city) != "ALL" {
				fnCity = strings.ToLower(city)
			}
			fnTier := "all"
			if tier != "" && strings.ToUpper(tier) != "ALL" {
				fnTier = strings.ToLower(tier)
			}
			dateStr := time.Now().Format("2006-01-02")
			filename := fmt.Sprintf("nyx_proxies_%s_%s_%s_%s_%s.txt", fnProto, fnCountry, fnCity, fnTier, dateStr)
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
		}
		for _, p := range results {
			fmt.Fprintf(w, "%s://%s\n", p.Protocol, p.Address)
		}
	})

	mux.HandleFunc("/api/v1/proxies", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == "OPTIONS" {
			return
		}

		q := r.URL.Query()
		country := q.Get("country")
		city := q.Get("city")
		proto := q.Get("type")
		tier := q.Get("tier")
		anon := q.Get("anonymity")
		cleanOnly := q.Get("clean_only") == "true" || q.Get("clean_only") == "1"
		httpsOnly := q.Get("https") == "true" || q.Get("https") == "1"
		maxLat, _ := strconv.Atoi(q.Get("max_latency"))
		randomize := q.Get("random") == "true" || q.Get("random") == "1"
		limit, _ := strconv.Atoi(q.Get("limit"))

		results := filterPoolProxies(country, city, proto, tier, maxLat, cleanOnly, anon, limit, randomize, httpsOnly)

		if q.Get("format") == "text" {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			for _, p := range results {
				fmt.Fprintf(w, "%s://%s\n", p.Protocol, p.Address)
			}
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"count":   len(results),
			"proxies": results,
		})
	})

	mux.HandleFunc("/api/v1/test", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == "OPTIONS" {
			return
		}

		q := r.URL.Query()
		targetURL := strings.TrimSpace(q.Get("url"))
		if targetURL == "" {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   "Missing required query parameter 'url'",
			})
			return
		}

		limitStr := q.Get("limit")
		var limit int
		if limitStr == "" || limitStr == "all" || limitStr == "0" {
			limit = 0 // 0 = test ALL matching proxies in the pool
		} else {
			limit, _ = strconv.Atoi(limitStr)
			if limit < 0 || limit > 10000 {
				limit = 0
			}
		}

		country := q.Get("country")
		city := q.Get("city")
		proto := q.Get("type")
		tier := q.Get("tier")
		anon := q.Get("anonymity")
		cleanOnly := q.Get("clean_only") == "true" || q.Get("clean_only") == "1"
		httpsOnly := q.Get("https") == "true" || q.Get("https") == "1"
		maxLat, _ := strconv.Atoi(q.Get("max_latency"))
		randomize := q.Get("random") == "true" || q.Get("random") == "1"

		timeoutMs, _ := strconv.Atoi(q.Get("timeout"))
		if timeoutMs <= 0 {
			timeoutMs = 4500
		} else if timeoutMs > 15000 {
			timeoutMs = 15000
		}
		probeTimeout := time.Duration(timeoutMs) * time.Millisecond

		// Retrieve all matching pool candidates to probe against the target URL
		candidates := filterPoolProxies(country, city, proto, tier, maxLat, cleanOnly, anon, 0, randomize, httpsOnly)

		flusher, isFlusher := w.(http.Flusher)
		if q.Get("stream") == "true" && isFlusher {
			w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Connection", "keep-alive")
			w.WriteHeader(http.StatusOK)
			flusher.Flush()

			var totalTested int32
			var passedCount int32
			totalCandidates := int32(len(candidates))

			ctx, cancelProbe := context.WithCancel(r.Context())
			defer cancelProbe()

			var streamWg sync.WaitGroup
			sem := make(chan struct{}, 60)
			var writeMu sync.Mutex

			for _, item := range candidates {
				if ctx.Err() != nil {
					break
				}
				if limit > 0 && atomic.LoadInt32(&passedCount) >= int32(limit) {
					break
				}

				streamWg.Add(1)
				sem <- struct{}{}
				go func(p *ProxyItem) {
					defer streamWg.Done()
					defer func() { <-sem }()

					if ctx.Err() != nil {
						return
					}
					if limit > 0 && atomic.LoadInt32(&passedCount) >= int32(limit) {
						return
					}

					r := testProxyAgainstURL(p, targetURL, probeTimeout)
					tested := atomic.AddInt32(&totalTested, 1)
					var passed int32
					if r.Passed {
						passed = atomic.AddInt32(&passedCount, 1)
						if limit > 0 && passed >= int32(limit) {
							cancelProbe()
						}
					} else {
						passed = atomic.LoadInt32(&passedCount)
					}

					writeMu.Lock()
					b, _ := json.Marshal(map[string]interface{}{
						"type":         "progress",
						"result":       r,
						"current":      tested,
						"total":        totalCandidates,
						"target_limit": limit,
						"passed_count": passed,
					})
					fmt.Fprintf(w, "data: %s\n\n", b)
					flusher.Flush()
					writeMu.Unlock()
				}(item)
			}
			streamWg.Wait()

			writeMu.Lock()
			finalPassed := atomic.LoadInt32(&passedCount)
			finalTested := atomic.LoadInt32(&totalTested)
			b, _ := json.Marshal(map[string]interface{}{
				"type":         "done",
				"target_url":   targetURL,
				"total_tested": finalTested,
				"passed_count": finalPassed,
				"target_limit": limit,
			})
			fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
			writeMu.Unlock()
			return
		}

		var wg sync.WaitGroup
		sem := make(chan struct{}, 60)
		var mu sync.Mutex
		results := make([]*URLTestResult, 0, len(candidates))
		ctx, cancelProbe := context.WithCancel(r.Context())
		defer cancelProbe()
		var nonStreamPassed int32

		for _, item := range candidates {
			if ctx.Err() != nil {
				break
			}
			if limit > 0 && atomic.LoadInt32(&nonStreamPassed) >= int32(limit) {
				break
			}

			wg.Add(1)
			sem <- struct{}{}
			go func(p *ProxyItem) {
				defer wg.Done()
				defer func() { <-sem }()

				if ctx.Err() != nil {
					return
				}
				if limit > 0 && atomic.LoadInt32(&nonStreamPassed) >= int32(limit) {
					return
				}

				r := testProxyAgainstURL(p, targetURL, probeTimeout)
				if r.Passed {
					if p := atomic.AddInt32(&nonStreamPassed, 1); limit > 0 && p >= int32(limit) {
						cancelProbe()
					}
				}

				mu.Lock()
				results = append(results, r)
				mu.Unlock()
			}(item)
		}
		wg.Wait()

		passed := make([]*URLTestResult, 0)
		for _, r := range results {
			if r.Passed {
				passed = append(passed, r)
			}
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success":      true,
			"target_url":   targetURL,
			"target_limit": limit,
			"total_tested": len(results),
			"passed_count": len(passed),
			"passed":       passed,
			"results":      results,
		})
	})

	// Stats endpoint: Real-time telemetry, breakdown by protocol, country, anonymity and quality tier.
	mux.HandleFunc("/api/v1/stats", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == "OPTIONS" {
			return
		}

		pool.mu.RLock()
		defer pool.mu.RUnlock()

		countries := make(map[string]int)
		cities := make(map[string]int)
		anonymityStats := make(map[string]int)
		tierStats := make(map[string]int)
		cleanCount := 0
		httpCount := 0
		socks4Count := 0
		socks5Count := 0
		httpsCount := 0

		for _, p := range pool.proxies {
			switch p.Protocol {
			case "http":
				httpCount++
			case "socks4":
				socks4Count++
			case "socks5":
				socks5Count++
			}
			if p.HTTPS {
				httpsCount++
			}
			if p.Country != "" && p.Country != "UNKNOWN" {
				countries[p.Country]++
			}
			if p.City != "" && p.City != "Unknown" {
				cities[p.City]++
			}
			anonymityStats[p.Anonymity]++
			tierStats[p.Tier]++
			if p.ThreatScore == 0 {
				cleanCount++
			}
		}

		// Count active sources from proxy_source.txt
		activeSources := ensureAndLoadSources()
		sourcesCount := len(activeSources)

		statusMu.Lock()
		statusData.TotalSources = sourcesCount
		statusMu.Unlock()

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success":         true,
			"total_live":      len(pool.proxies),
			"http_live":       httpCount,
			"socks4_live":     socks4Count,
			"socks5_live":     socks5Count,
			"socks_live":      socks4Count + socks5Count,
			"https_live":      httpsCount,
			"clean_live":      cleanCount,
			"total_countries": len(countries),
			"total_cities":    len(cities),
			"total_sources":   sourcesCount,
			"countries":       countries,
			"anonymity":       anonymityStats,
			"tiers":           tierStats,
		})
	})

	mux.HandleFunc("/api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == "OPTIONS" {
			return
		}

		statusMu.RLock()
		defer statusMu.RUnlock()

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"status":  statusData,
		})
	})

	mux.HandleFunc("/api/proxies", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		pool.mu.RLock()
		defer pool.mu.RUnlock()

		var results []*ProxyItem
		for _, p := range pool.proxies {
			results = append(results, p)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(results)
	})

	mux.HandleFunc("/api/download", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		q := r.URL.Query()
		country := q.Get("country")
		city := q.Get("city")
		proto := q.Get("type")
		tier := q.Get("tier")
		cleanOnly := q.Get("clean_only") == "true" || q.Get("clean_only") == "1"
		httpsOnly := q.Get("https") == "true" || q.Get("https") == "1"
		limit, _ := strconv.Atoi(q.Get("limit"))
		results := filterPoolProxies(country, city, proto, tier, 0, cleanOnly, "", limit, false, httpsOnly)

		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Disposition", "attachment; filename=proxies.txt")
		for _, p := range results {
			fmt.Fprintf(w, "%s://%s\n", p.Protocol, p.Address)
		}
	})

	if domain != "" {
		certDir := "data/certs"
		_ = os.MkdirAll(certDir, 0700)

		certManager := &autocert.Manager{
			Prompt:     autocert.AcceptTOS,
			HostPolicy: autocert.HostWhitelist(domain),
			Cache:      autocert.DirCache(certDir),
			Email:      email,
		}

		httpsServer := &http.Server{
			Addr:      ":443",
			Handler:   mux,
			TLSConfig: certManager.TLSConfig(),
		}

		// Port 80 listener for ACME HTTP-01 challenge and automatic HTTP -> HTTPS redirection
		go func() {
			color.HiCyan("  [HTTPS] Listening on port :80 for ACME challenge & HTTPS redirection")
			httpServer := &http.Server{
				Addr:    ":80",
				Handler: certManager.HTTPHandler(nil),
			}
			if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				color.HiYellow("  [HTTP-80] Warning: %v", err)
			}
		}()

		color.HiGreen("  [NETWORK] Auto-SSL Active! Listening on https://%s (Port 443)\n", domain)
		err := httpsServer.ListenAndServeTLS("", "")
		if err != nil {
			color.HiRed("  [NETWORK] HTTPS Server error: %v", err)
		}
	} else {
		color.HiGreen("  [NETWORK] Grid Core active & listening on http://0.0.0.0:%s\n", port)
		err := http.ListenAndServe(":"+port, mux)
		if err != nil {
			color.HiRed("  [NETWORK] Server error: %v", err)
		}
	}
}
