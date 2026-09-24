package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"os"
	"strings"
	"time"

	"github.com/fatih/color"
)

type ServerConfig struct {
	Port                         string `json:"port"`
	Domain                       string `json:"domain"`
	Email                        string `json:"email"`
	AutoSSL                      bool   `json:"auto_ssl"`
	UpdateProxylistIntervalHours int    `json:"update_proxylist_interval_hours"`
}

var (
	portFlag     = flag.String("port", "", "Web server port (default: 8080 or config.json)")
	domainFlag   = flag.String("domain", "", "Custom domain name for Auto-SSL / HTTPS (e.g. proxy.example.com)")
	emailFlag    = flag.String("email", "", "Admin email address for Let's Encrypt notifications")
	intervalFlag = flag.Int("interval", 0, "Update proxylist interval in hours (default: 1 or config.json)")
)

const configFile = "data/config.json"

func init() {
	log.SetOutput(io.Discard)
}

func loadServerConfig() ServerConfig {
	cfg := ServerConfig{
		Port:                         "8080",
		Domain:                       "",
		Email:                        "",
		AutoSSL:                      false,
		UpdateProxylistIntervalHours: 1,
	}

	if data, err := os.ReadFile(configFile); err == nil {
		_ = json.Unmarshal(data, &cfg)
	}

	if cfg.UpdateProxylistIntervalHours <= 0 {
		cfg.UpdateProxylistIntervalHours = 1
	}

	// Environment variable overrides
	if p := os.Getenv("NYX_PORT"); p != "" {
		cfg.Port = p
	} else if p := os.Getenv("PORT"); p != "" {
		cfg.Port = p
	}
	if d := os.Getenv("NYX_DOMAIN"); d != "" {
		cfg.Domain = d
	}
	if e := os.Getenv("NYX_EMAIL"); e != "" {
		cfg.Email = e
	}
	if envInt := os.Getenv("NYX_INTERVAL_HOURS"); envInt != "" {
		if val, err := time.ParseDuration(envInt + "h"); err == nil && val > 0 {
			cfg.UpdateProxylistIntervalHours = int(val.Hours())
		}
	}

	// CLI flag overrides
	if *portFlag != "" {
		cfg.Port = *portFlag
	}
	if *domainFlag != "" {
		cfg.Domain = *domainFlag
	}
	if *emailFlag != "" {
		cfg.Email = *emailFlag
	}
	if *intervalFlag > 0 {
		cfg.UpdateProxylistIntervalHours = *intervalFlag
	}

	cfg.Domain = strings.TrimSpace(cfg.Domain)
	cfg.Domain = strings.TrimPrefix(cfg.Domain, "https://")
	cfg.Domain = strings.TrimPrefix(cfg.Domain, "http://")
	cfg.Domain = strings.TrimRight(cfg.Domain, "/")

	if cfg.Domain != "" {
		cfg.AutoSSL = true
	}

	return cfg
}

func saveServerConfig(cfg ServerConfig) {
	_ = os.MkdirAll("data", 0755)
	if data, err := json.MarshalIndent(cfg, "", "  "); err == nil {
		_ = os.WriteFile(configFile, data, 0644)
	}
}

func printBanner(cfg ServerConfig) {
	mintColor := "\033[38;2;0;245;155m"
	grayColor := "\033[0;90m"
	whiteColor := "\033[1;37m"
	cyanColor := "\033[0;36m"
	resetColor := "\033[0m"

	fmt.Println()
	fmt.Printf("%s", mintColor)
	fmt.Println("  ███╗   ██╗██╗   ██╗██╗  ██╗    ██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗")
	fmt.Println("  ████╗  ██║╚██╗ ██╔╝╚██╗██╔╝    ██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝")
	fmt.Println("  ██╔██╗ ██║ ╚████╔╝  ╚███╔╝     ██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝ ")
	fmt.Println("  ██║╚██╗██║  ╚██╔╝   ██╔██╗     ██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝  ")
	fmt.Println("  ██║ ╚████║   ██║   ██╔╝ ██╗    ██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║   ")
	fmt.Println("  ╚═╝  ╚═══╝   ╚═╝  ╚═╝  ╚═╝    ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ")
	fmt.Printf("%s", resetColor)
	fmt.Printf("%s  ─────────────────────────────────────────────────────────────────────────────%s\n", grayColor, resetColor)
	fmt.Printf("   %s⚡ NYX PROXY LIST TOOLS  •  AUTOMATED SCRAPER & REAL-TIME HEALTH CHECKER%s\n", mintColor, resetColor)
	fmt.Printf("%s  ─────────────────────────────────────────────────────────────────────────────%s\n", grayColor, resetColor)

	if cfg.Domain != "" {
		fmt.Printf("   %s• Web Dashboard:%s %shttps://%s/%s       %s• API Docs:%s %shttps://%s/docs%s\n",
			cyanColor, resetColor, mintColor, cfg.Domain, resetColor,
			cyanColor, resetColor, cyanColor, cfg.Domain, resetColor)
		fmt.Printf("   %s• TLS Security :%s %sPort 443 (Auto-SSL)%s      %s• ACME Auth:%s %sPort 80 (HTTP-01)%s\n",
			mintColor, resetColor, whiteColor, resetColor,
			mintColor, resetColor, whiteColor, resetColor)
	} else {
		fmt.Printf("   %s• Web Dashboard:%s %shttp://127.0.0.1:%s/%s       %s• API Docs:%s %shttp://127.0.0.1:%s/docs%s\n",
			cyanColor, resetColor, mintColor, cfg.Port, resetColor,
			cyanColor, resetColor, cyanColor, cfg.Port, resetColor)
	}

	fmt.Printf("   %s• Storage File :%s %sdata/live_pool.json%s       %s• Sources :%s %sdata/proxy_source.txt%s\n",
		grayColor, resetColor, whiteColor, resetColor,
		grayColor, resetColor, whiteColor, resetColor)
	fmt.Printf("%s  ─────────────────────────────────────────────────────────────────────────────%s\n\n", grayColor, resetColor)
}

func main() {
	flag.Parse()
	rand.Seed(time.Now().UnixNano())

	cfg := loadServerConfig()
	saveServerConfig(cfg)
	printBanner(cfg)

	now := time.Now()
	statusMu.Lock()
	statusData.LastHarvestTime = now
	statusData.NextHarvestTime = now.Add(time.Duration(cfg.UpdateProxylistIntervalHours) * time.Hour)
	statusData.HarvestIntervalMins = cfg.UpdateProxylistIntervalHours * 60
	statusData.ActivePoolCount = len(pool.proxies)
	statusMu.Unlock()

	pool.LoadFromFile()
	startPeriodicSaver()

	go func() {
		for {
			myServerIP = detectServerIP()
			if myServerIP != "" {
				color.HiCyan("  [ENGINE] Server Exit IP: %s", myServerIP)
				statusMu.Lock()
				statusData.ServerIP = myServerIP
				statusMu.Unlock()
				break
			}
			time.Sleep(1 * time.Second)
		}

		loadIPsumDatabase()

		initialSources := ensureAndLoadSources()
		color.HiGreen("  [SOURCES] Loaded %d dynamic target sources from %s", len(initialSources), sourceFile)

		go runPoolHealthKeeper()
		go runPeriodicHarvester(cfg.UpdateProxylistIntervalHours)
	}()

	startWebServer(cfg.Port, cfg.Domain, cfg.Email)
}
