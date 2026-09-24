# 🌐 NyxProxy

<div align="center">

![Go Version](https://img.shields.io/badge/Go-%3E%3D1.22-00ADD8?style=flat-square&logo=go)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-blueviolet?style=flat-square)

**An autonomous, self-hosted proxy scraper and real-time health checker with a built-in REST API and web dashboard.**

[Installation](#-quick-start) • [How It Works](#-how-it-works) • [REST API](#-rest-api-documentation) • [Web Dashboard](#-web-interface)

</div>

---

## 💡 What is NyxProxy?

Most proxy scrapers only fetch and check proxies when you manually execute them. This workflow is slow: whenever you need a working proxy, you have to wait minutes for the tool to download raw lists and filter out dead IPs.

**NyxProxy takes a continuous, server-first approach:**

- It runs quietly as a 24/7 background service on your server.
- Every hour, it automatically pulls fresh proxies from **100+ public sources**.
- It continuously checks each proxy for connectivity, protocol support (HTTP, SOCKS4, SOCKS5), latency, anonymity level, and IP reputation.
- Dead or unstable proxies are automatically evicted from memory.
- When your scrapers, bots, or applications need proxies, you fetch them instantly via the **REST API** or **Web UI** — no scanning delays, zero wait time.

---

## ⚡ Quick Start

### 🐧 Linux (One-Command Installer)
Run the automated installation script on any modern Linux distribution (Ubuntu, Debian, CentOS, AlmaLinux, Arch, etc.):

```bash
curl -sSL https://raw.githubusercontent.com/Erfan-Fazeli/NyxProxyList/main/install.sh | bash
```

The installer will:
1. Detect system architecture and install Golang if not present.
2. Let you choose between **IP mode** (HTTP on your chosen port) or **Domain mode** (automatic HTTPS via Let's Encrypt).
3. Compile the optimized binary and register a background `systemd` service (`nyxproxy.service`).

---

### 🪟 Windows Setup
1. Clone the repository:
   ```cmd
   git clone https://github.com/Erfan-Fazeli/NyxProxyList.git
   cd NyxProxyList
   ```
2. Double-click `install.bat` or run:
   ```cmd
   install.bat
   ```

---

### 🛠️ Manual Build (Any OS)
Make sure you have [Go 1.22+](https://go.dev/dl/) installed:

```bash
git clone https://github.com/Erfan-Fazeli/NyxProxyList.git
cd NyxProxyList

go mod tidy
go build -ldflags="-s -w" -o nyxProxy ./src

# Run on default port (8080)
./nyxProxy

# Run on custom port
./nyxProxy --port 9090

# Run with Let's Encrypt SSL on domain
./nyxProxy --domain proxy.example.com --email admin@example.com
```

---

## ⚙️ How It Works

```
  ┌───────────────────────┐
  │  100+ Proxy Sources   │
  └───────────┬───────────┘
              │ (Automated hourly sync)
              ▼
  ┌───────────────────────┐
  │  Multi-Protocol Test  │ ──► Tests HTTP, SOCKS4, SOCKS5 & SSL
  └───────────┬───────────┘
              │
              ├──► Inspects Anonymity (Elite, Anonymous, Transparent)
              ├──► Resolves GeoIP (Country & City)
              └──► Checks Threat Intelligence (IPsum Blacklist)
              │
              ▼
  ┌───────────────────────┐
  │ In-Memory Active Pool │ ──► Dead proxies removed automatically
  └───────────┬───────────┘
              │
      ┌───────┴───────┐
      ▼               ▼
┌───────────┐   ┌───────────┐
│  REST API │   │  Web UI   │
└───────────┘   └───────────┘
```

1. **Multi-Source Scraping:** Periodically extracts IP:Port candidates across 100+ maintained sources.
2. **Deep Validation:** Verifies actual internet egress through multiple protocols, discarding ISP transparent caches and internal network leaks.
3. **Quality Tiers:**
   - **Diamond:** Elite L1 anonymity, 0 blacklist flags, latency < 800ms.
   - **Gold:** Elite L1 anonymity, 0 blacklist flags.
   - **Silver:** Anonymous L2, 0 blacklist flags.
   - **Bronze:** Anonymous L2 with minor reputation reports.
   - **Iron:** Transparent proxy or blacklisted.
4. **Target URL Checker:** An integrated probing engine that lets you test if pool proxies can specifically reach your target website (e.g. `https://example.com`) with live streaming progress.

---

## 📡 REST API Documentation

NyxProxy provides public, CORS-enabled endpoints to easily integrate with Python, Node.js, Go, or cURL.

### 1. Get Plaintext Proxies (`/api/v1/raw`)
Returns a line-separated list of `protocol://ip:port`.

```bash
# Get 20 Diamond-tier SOCKS5 proxies from Germany
curl "http://localhost:8080/api/v1/raw?type=socks5&country=DE&tier=Diamond&limit=20"
```

### 2. Get JSON Proxy Pool (`/api/v1/proxies`)
Returns full proxy metadata in JSON format.

```bash
curl "http://localhost:8080/api/v1/proxies?type=http&clean_only=true&limit=10"
```

### 3. Real-Time Target URL Test (`/api/v1/test`)
Tests proxies against a specific URL with Server-Sent Events (SSE) support:

```bash
curl -N "http://localhost:8080/api/v1/test?url=https://httpbin.org/ip&stream=true&limit=5"
```

### 4. Grid Statistics (`/api/v1/stats`)
```bash
curl "http://localhost:8080/api/v1/stats"
```

### Filter Parameters Reference

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `type` | string | `all` | Protocol: `all`, `http`, `socks4`, `socks5`, `socks` |
| `country` | string | `ALL` | 2-letter country code (e.g., `US`, `DE`, `FR`, `GB`) |
| `city` | string | `ALL` | Specific city name |
| `tier` | string | `ALL` | `Diamond`, `Gold`, `Silver`, `Bronze`, `Iron` |
| `anonymity` | string | `ALL` | `Elite`, `Anonymous`, `Transparent` |
| `clean_only` | bool | `false` | When `true`, returns only proxies with 0 threat score |
| `https` | bool | `false` | When `true`, returns only proxies with HTTPS connect support |
| `max_latency` | int | `0` | Max latency in milliseconds (e.g., `500`) |
| `limit` | int | `0` | Max proxies to return (`0` = all matching) |
| `random` | bool | `false` | When `true`, randomizes order |

---

## 💻 Web Interface

The included dashboard runs directly from the Go binary without external web server dependencies:
- **Clean Dark/Mint Theme:** Modern, responsive UI with live telemetry counters.
- **Search & Filter:** Instant client-side filtering by IP, country, city, protocol, and tier.
- **URL Prober:** Test proxy reachability against custom target URLs with live visual progress.
- **One-Click Export:** Quick clipboard copy or TXT download.
- **PWA & Mobile Ready:** Installable as a Progressive Web App or used inside Telegram WebApp.

---

## 📄 License & Author

- **Author:** [Erfan Fazeli](https://github.com/Erfan-Fazeli)
- **Studio:** [NyxAgent.dev](https://NyxAgent.dev)
- **License:** [MIT License](LICENSE)
