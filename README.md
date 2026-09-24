# 🌐 NyxProxy

<div align="center">

![Go Version](https://img.shields.io/badge/Go-%3E%3D1.22-00ADD8?style=flat-square&logo=go)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-blueviolet?style=flat-square)

**Self-hosted autonomous proxy scraper and real-time health checker with REST API and web dashboard.**

[Quick Start](#-quick-start) • [Configuration](#%EF%B8%8F-configuration) • [REST API](#-rest-api) • [Web Dashboard](#-web-interface)

</div>

---

## 💡 Overview

Traditional proxy tools only scrape when manually invoked, making you wait minutes for scans to finish before getting working endpoints.

**NyxProxy runs 24/7 as an autonomous background service:**
- **Automated Re-Harvesting:** Periodically pulls fresh proxies from **100+ public sources** every **N hours** (customizable in config).
- **Continuous Health Checking:** Actively validates protocol connectivity (HTTP, SOCKS4, SOCKS5), true latency, anonymity headers, and blacklist reputation (IPsum).
- **Auto-Pruning:** Dead or failing proxies are automatically removed from memory.
- **Instant Availability:** An active pool of verified proxies is always hot in memory — accessible within milliseconds via the REST API or Web Dashboard.

---

## ⚡ Quick Start

### 🐧 Linux (One-Line Installer)
```bash
curl -sSL https://raw.githubusercontent.com/Erfan-Fazeli/NyxProxyList/main/install.sh | bash
```
> Installs dependencies, compiles the binary, sets up a background `systemd` service (`nyxproxy.service`), and lets you configure IP or Domain mode with automatic Let's Encrypt SSL.

### 🪟 Windows Setup
```cmd
git clone https://github.com/Erfan-Fazeli/NyxProxyList.git
cd NyxProxyList
install.bat
```

### 🛠️ Manual Build (Any OS)
```bash
git clone https://github.com/Erfan-Fazeli/NyxProxyList.git
cd NyxProxyList

go mod tidy
go build -ldflags="-s -w" -o nyxProxy ./src

# Run with custom options
./nyxProxy --port 8080 --interval 2
```

---

## ⚙️ Configuration

Settings can be defined in `data/config.json`, via environment variables, or CLI flags:

### `data/config.json`
```json
{
  "port": "8080",
  "domain": "",
  "email": "",
  "auto_ssl": false,
  "harvest_interval_hours": 1
}
```

### CLI Flags & Environment Variables
| Option | CLI Flag | Env Variable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Port** | `--port` | `NYX_PORT` | `8080` | HTTP port to bind |
| **Domain** | `--domain` | `NYX_DOMAIN` | `""` | Domain for Auto-SSL (Port 443 + 80) |
| **Email** | `--email` | `NYX_EMAIL` | `""` | Let's Encrypt notification email |
| **Interval** | `--interval` | `NYX_INTERVAL_HOURS` | `1` | Sync frequency in hours (N hours) |

---

## 🏆 Quality Tiers

Every proxy is automatically classified:

| Tier | Anonymity | Blacklist Score | Latency | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Diamond** | Elite (L1) | 0 | < 800ms | Fast, pristine IP reputation, no header leaks |
| **Gold** | Elite (L1) | 0 | Any | Full origin IP concealment, clean reputation |
| **Silver** | Anonymous (L2) | 0 | Any | Origin IP hidden, proxy signature detected |
| **Bronze** | Anonymous (L2) | 1–2 | Any | Working proxy with minor threat flags |
| **Iron** | Transparent | ≥ 3 | Any | Leaks client IP or heavily blacklisted |

---

## 📡 REST API

CORS-enabled endpoints with query parameter filtering:

### Endpoints
- `GET /api/v1/raw` — Plaintext list of `protocol://ip:port`
- `GET /api/v1/proxies` — Detailed JSON array with GeoIP and latency
- `GET /api/v1/test?url=...` — Live test pool proxies against a target URL (supports `stream=true`)
- `GET /api/v1/stats` — Overall telemetry and breakdown

### Example Requests
```bash
# Plaintext: 20 Diamond SOCKS5 proxies from Germany
curl "http://localhost:8080/api/v1/raw?type=socks5&country=DE&tier=Diamond&limit=20"

# JSON: 10 clean HTTP proxies
curl "http://localhost:8080/api/v1/proxies?type=http&clean_only=true&limit=10"

# Streamed probe against custom target URL
curl -N "http://localhost:8080/api/v1/test?url=https://httpbin.org/ip&stream=true"
```

### Filter Parameters
| Parameter | Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `type` | `all`, `http`, `socks4`, `socks5`, `socks` | `all` | Protocol type |
| `country` | 2-letter ISO code (e.g. `US`, `DE`) | `ALL` | Country filter |
| `city` | City name (e.g. `Frankfurt`) | `ALL` | City filter |
| `tier` | `Diamond`, `Gold`, `Silver`, `Bronze`, `Iron` | `ALL` | Quality rating |
| `anonymity` | `Elite`, `Anonymous`, `Transparent` | `ALL` | Anonymity level |
| `clean_only` | `true`, `false` | `false` | Filter out blacklisted IPs |
| `https` | `true`, `false` | `false` | Must support HTTPS connect |
| `max_latency`| Number in ms (e.g. `500`) | `0` | Latency cap |
| `limit` | Number (`0` = all) | `0` | Result count limit |
| `random` | `true`, `false` | `false` | Randomize output |

---

## 💻 Web Interface

Built-in zero-dependency responsive UI:
- **Live Counters:** Real-time telemetry, active pool count, and countdown to next harvest.
- **Instant Search & Filter:** Client-side sorting and multi-criteria filters.
- **Custom Target Prober:** Verify proxy reachability to specific URLs with visual progress.
- **PWA & Telegram Ready:** Installable as a Progressive Web App or used directly inside Telegram WebApp.

---

## 📄 License & Credits

- **Author:** [Erfan Fazeli](https://github.com/Erfan-Fazeli)
- **Studio:** [NyxAgent.dev](https://NyxAgent.dev)
- **License:** MIT License
