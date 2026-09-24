# ⚡ NYX PROXY GRID ENGINE

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-00f59b.svg?style=for-the-badge)
![Go Version](https://img.shields.io/badge/go-%3E%3D1.22-06b6d4.svg?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-3b82f6.svg?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-a855f7.svg?style=for-the-badge)

**24/7 Autonomous Global Proxy Harvester, Continuous Real-Time Health-Checker & High-Speed REST API**

[⚡ Quick Start](#-quick-start) • [💡 Why NyxProxy?](#-the-paradigm-shift-how-nyxproxy-is-different) • [✨ Key Capabilities](#-key-features) • [📡 REST API Docs](#-rest-api-specification) • [🏆 Quality Tiers](#-quality-tiers--security-classification)

</div>

---

## 💡 The Paradigm Shift: How NyxProxy is Different

### ❌ The Old Way (Legacy Scraping Tools)
Traditional proxy scrapers run only when you execute them. When your scripts or bots need proxies, you have to launch a script, wait 5–15 minutes while it scrapes websites and tests thousands of dead IPs, and by the time it finishes, half the proxies are already offline or timed out.

### ✅ The NyxProxy Way (Autonomous 24/7 Live Grid Engine)
**NyxProxy changes the entire architecture.** It runs continuously 24/7 as an intelligent daemon on your server:

1. **Continuous Hourly Harvesting:** Automatically cycles through **100+ decentralized dynamic sources** every 60 minutes to discover fresh candidates.
2. **Real-Time Health & Liveness Keeper:** Constantly probes active pool members in the background. If a proxy drops, slows down, or fails tests, it is **immediately purged** from the live pool.
3. **Always-Hot, Zero-Latency Access:** An in-memory, fully-validated pool of high-quality live proxies is maintained around the clock.
4. **Instant Consumption:** When your bots, scrapers, data pipelines, or applications need proxies, you make a sub-millisecond call to the REST API or Web Mini-App and get **guaranteed-live proxies instantly** — zero scanning delay.

```
 Traditional Tools:   [Need Proxies] ──► [Wait 10 mins scraping/checking] ──► [Get 40% Dead Proxies]
 NyxProxy Engine:     [24/7 Auto-Sync & Pruning] ──► [Need Proxies] ──► [Instant Fresh Alive Pool (0ms wait)]
```

---

## ⚡ Quick Start

### 🐧 One-Line Linux Production Installer (Ubuntu / Debian / CentOS / Arch / Alpine)
Deploy a complete production server with automatic dependency setup, Go compiler installation, Let's Encrypt Auto-SSL, and background `systemd` service:

```bash
curl -sSL https://raw.githubusercontent.com/Erfan-Fazeli/NyxProxyList/main/install.sh | bash
```

> **Interactive 1-Step Setup:** The script prompts you to choose between **IP Mode** (standard HTTP on custom port) or **Domain Mode** (automatic HTTPS with Let's Encrypt SSL on port 443 + HTTP-01 challenge).

---

### 🪟 Windows Quick Setup
1. Clone repository and run the automated launcher batch script:
```cmd
git clone https://github.com/Erfan-Fazeli/NyxProxyList.git
cd NyxProxyList
install.bat
```
> `install.bat` resolves dependencies, builds `nyxProxy.exe` with optimized flags, initializes `data/config.json`, and launches the grid engine.

---

### 🛠️ Manual Build from Source (All Platforms)

```bash
# 1. Clone repository
git clone https://github.com/Erfan-Fazeli/NyxProxyList.git
cd NyxProxyList

# 2. Download dependencies & build binary
go mod tidy
go build -ldflags="-s -w" -o nyxProxy ./src

# 3. Run with custom parameters
./nyxProxy --port 8080

# Or run with Domain + Auto-SSL:
./nyxProxy --domain proxy.yourdomain.com --email admin@yourdomain.com
```

---

## ✨ Key Features

- 🔄 **100+ Dynamic Source Ingestion:** Aggregates and parses raw proxy streams from over 100 verified public and community feeds.
- ⚡ **Multi-Protocol Health Engine:** Validates **HTTP**, **SOCKS4**, **SOCKS4a (remote DNS)**, and **SOCKS5** connections with true latency calculation.
- 🛡️ **Anonymity & Threat Intelligence:**
  - Active detection of **Transparent (L3)**, **Anonymous (L2)**, and **Elite (L1)** headers.
  - Threat score integration via **IPsum threat intelligence blacklist** (scores 1–8).
  - Categorization into **Diamond**, **Gold**, **Silver**, **Bronze**, and **Iron** quality tiers.
- 🎯 **Target URL Tester (Tunnel Probing Engine):** Tests proxies in real-time against any destination URL (e.g., `https://api.github.com` or `https://google.com`) with Server-Sent Events (SSE) live streaming and intermediate proxy error rejection.
- 🔒 **Automated Let's Encrypt SSL (ACME):** Zero-config HTTPS certificate provisioning via `autocert` with automatic renewal on port 443 and HTTP-01 redirection on port 80.
- 📱 **Modern Web Dashboard & Mini-App:**
  - Dark / Mint UI with real-time counters and filter controls.
  - Progressive Web App (**PWA**) & **Telegram WebApp** ready.
  - Real-time search, one-click clipboard copy, and TXT file export.

---

## 📡 REST API Specification

All endpoints support CORS (`*`) and provide instant access to the continuously maintained in-memory pool.

### Universal Filter Query Parameters

| Parameter | Type | Default | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `type` | string | `all` | Protocol: `all`, `http`, `socks4`, `socks5`, `socks` | `type=socks5` |
| `country` | string | `ALL` | ISO 2-letter country code | `country=DE` |
| `city` | string | `ALL` | City name | `city=Frankfurt` |
| `tier` | string | `ALL` | Quality tier: `Diamond`, `Gold`, `Silver`, `Bronze`, `Iron` | `tier=Diamond` |
| `anonymity`| string | `ALL` | Anonymity level: `Elite`, `Anonymous`, `Transparent` | `anonymity=Elite` |
| `clean_only`| bool | `false` | When `true`, filters out blacklisted IPs (threat score 0) | `clean_only=true` |
| `https` | bool | `false` | When `true`, returns only proxies with verified SSL tunnel | `https=true` |
| `max_latency`| int | `0` | Maximum acceptable latency in ms | `max_latency=600` |
| `limit` | int | `0` | Number of proxies to return (`0` = all matching) | `limit=50` |
| `random` | bool | `false` | When `true`, shuffles matching results | `random=true` |

---

### Core API Endpoints

#### 1. Plaintext Raw List (`GET /api/v1/raw`)
Ideal for CLI tools, curl scripts, Python scripts, and automated bots.

```bash
# Get 20 clean, Diamond-tier SOCKS5 proxies from Germany
curl "http://localhost:8080/api/v1/raw?type=socks5&country=DE&tier=Diamond&clean_only=true&limit=20"
```

*Output:*
```text
socks5://159.69.123.45:1080
socks5://168.119.89.12:9050
socks5://116.203.45.67:1080
```

#### 2. Detailed JSON Array (`GET /api/v1/proxies`)
Returns comprehensive JSON records including GeoIP, threat score, latency, and anonymity metadata.

```bash
curl "http://localhost:8080/api/v1/proxies?type=http&country=US&limit=5"
```

*Sample Response:*
```json
{
  "success": true,
  "count": 1,
  "proxies": [
    {
      "address": "198.51.100.42:8080",
      "protocol": "http",
      "country": "US",
      "city": "Ashburn",
      "anonymity": "Elite",
      "threat_score": 0,
      "tier": "Diamond",
      "latency": 240,
      "last_checked": "2026-09-24T17:35:00Z",
      "https": true
    }
  ]
}
```

#### 3. Real-Time Target URL Tester (`GET /api/v1/test`)
Live test proxies against your specific target endpoint with SSE streaming:

```bash
curl -N "http://localhost:8080/api/v1/test?url=https://api.github.com&stream=true&limit=10"
```

#### 4. System Telemetry & Statistics (`GET /api/v1/stats`)
```bash
curl "http://localhost:8080/api/v1/stats"
```

---

## 🏆 Quality Tiers & Security Classification

| Tier | Anonymity Level | Blacklists | Latency | Description |
| :--- | :--- | :--- | :--- | :--- |
| **💎 DIAMOND** | Elite (L1) | 0 Reports | < 800 ms | Ultra-low latency, zero leak, pristine reputation |
| **🥇 GOLD** | Elite (L1) | 0 Reports | Standard | Full origin IP concealment, zero blacklists |
| **🥈 SILVER** | Anonymous (L2) | 0 Reports | Standard | Client IP hidden, proxy signature present |
| **🥉 BRONZE** | Anonymous (L2) | 1–2 Reports | Standard | Moderate quality, minor threat records |
| **⚙️ IRON** | Transparent (L3) | ≥ 3 Reports | Any | Leaks real client IP or heavily blacklisted |

---

## 🏗️ Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    24/7 BACKGROUND AUTONOMOUS DAEMON                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [100+ Dynamic Sources] ──(Hourly)──► [Multi-Threaded Ingestion Worker]     │
│                                                     │                       │
│                                                     ▼                       │
│  [Health Prober (SOCKS5/HTTP/SOCKS4)] ◄─── [Candidate Pipeline]            │
│       │                                                                     │
│       ├──► [GeoIP & Subnet Resolver]                                        │
│       ├──► [L1/L2/L3 Anonymity Inspector]                                   │
│       └──► [IPsum Threat Blacklist Evaluator]                               │
│                                                     │                       │
│                                                     ▼                       │
│                              [Thread-Safe In-Memory Live Pool]              │
│                              [Continuous Dead Proxy Pruning]                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
       ┌─────────────────────────────────┐   ┌────────────────────────────────┐
       │   Public REST API / Raw Stream  │   │  Responsive Web UI / PWA / TG  │
       │   (Sub-millisecond instant pool)│   │  (Instant search, copy & test) │
       └─────────────────────────────────┘   └────────────────────────────────┘
```

---

## 📄 License & Credits

- **Author:** [Erfan Fazeli](https://github.com/Erfan-Fazeli)
- **Studio:** [NyxAgent.dev Developer Studio](https://NyxAgent.dev)
- **License:** MIT License — Open-source and free for personal and commercial use.
