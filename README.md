# 🌐 NyxProxy

<div align="center">

![Go Version](https://img.shields.io/badge/Go-%3E%3D1.22-00ADD8?style=flat-square&logo=go)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-blueviolet?style=flat-square)

**A minimal and fast proxy list tool for automated scraping, real-time health checking, and instant API access.**

[Quick Start](#-quick-start) • [How It Works](#-how-it-works) • [Configuration](#%EF%B8%8F-configuration) • [API Guide](#-rest-api) • [Web Interface](#-web-interface)

</div>

---

## 💡 Why NyxProxy?

### ❌ The Problem with Traditional Scrapers
Most proxy tools work **on-demand**: every time you need proxies for your bot, scraper, or project, you have to run a script and wait several minutes while it downloads raw lists and tests thousands of dead IPs. By the time the scan finishes, many of those proxies have already gone offline.

### ✅ The NyxProxy Way: Always Ready & Pre-Tested
NyxProxy changes this completely by doing all the heavy lifting in the background:

- **Always Running in the Background:** Operates silently as a server service, so you never have to launch manual scans again.
- **Continuous Auto-Harvesting:** Automatically pulls fresh proxies from **100+ public sources** every **N hours** (customizable in config).
- **Real-Time Health Checking:** Constantly verifies connectivity, speed, protocols (HTTP, SOCKS4, SOCKS5), privacy level (Elite, Anonymous), and blacklist reputation.
- **Instant Auto-Pruning:** Unhealthy or dead proxies are removed from the active list immediately.
- **Zero Wait Time:** When your code needs proxies, they are already tested and waiting in memory. Fetch them in milliseconds via the **REST API** or **Web Dashboard** with zero scanning delay.

---

## ⚡ Quick Start

### 🐧 Linux (One-Line Setup)
Run this single command in your Linux terminal:

```bash
curl -sSL https://raw.githubusercontent.com/Erfan-Fazeli/NyxProxyList/main/install.sh | bash
```
> The script installs any missing tools, builds the program, and sets up a background service for you. You can choose to run it with a simple IP address or connect your domain for free automatic HTTPS.

---

### 🪟 Windows Setup
1. Clone this repository:
   ```cmd
   git clone https://github.com/Erfan-Fazeli/NyxProxyList.git
   cd NyxProxyList
   ```
2. Double-click `install.bat` (or run it in Command Prompt). It will build and start the app for you.

---

### 🛠️ Manual Build (Any System)
If you already have [Go 1.22+](https://go.dev/dl/) installed:

```bash
# 1. Clone the repo
git clone https://github.com/Erfan-Fazeli/NyxProxyList.git
cd NyxProxyList

# 2. Build the app
go mod tidy
go build -ldflags="-s -w" -o nyxProxy ./src

# 3. Start running
./nyxProxy --port 8080
```

---

## ⚙️ How It Works

1. **Scrapes Sources:** Automatically downloads proxy lists from over 100 sources.
2. **Tests Connectivity:** Checks if the proxy is alive, measures response speed (latency), and tests HTTP, SOCKS4, and SOCKS5 support.
3. **Checks Privacy & Safety:** Checks anonymity levels (Elite, Anonymous, Transparent) and screens against threat blacklists.
4. **Removes Dead Proxies:** Automatically drops proxies that stop responding so your list stays clean and healthy.
5. **Ready to Use:** Serves live proxies instantly via the web UI and REST API.

---

## ⚙️ Configuration

You can easily change settings in `data/config.json`, through environment variables, or command-line flags.

### `data/config.json`
```json
{
  "port": "8080",
  "domain": "",
  "email": "",
  "auto_ssl": false,
  "update_proxylist_interval_hours": 1
}
```

### Settings Reference
| Setting | CLI Flag | Env Variable | Default | What it does |
| :--- | :--- | :--- | :--- | :--- |
| **Port** | `--port` | `NYX_PORT` | `8080` | Port for the web server and API |
| **Domain** | `--domain` | `NYX_DOMAIN` | `""` | Domain name for automatic free SSL |
| **Email** | `--email` | `NYX_EMAIL` | `""` | Email for SSL notifications (optional) |
| **Update Interval** | `--interval` | `NYX_INTERVAL_HOURS` | `1` | How often to refresh sources (in hours) |

---

## 🏆 Quality Levels (Tiers)

Every proxy is grouped into a simple quality level:

- **💎 Diamond:** Fastest speed (ping < 800ms), highest privacy (Elite), completely clean IP.
- **🥇 Gold:** High privacy (Elite) and clean IP.
- **🥈 Silver:** Good privacy (Anonymous) and clean IP.
- **🥉 Bronze:** Working proxy with minor blacklist flags.
- **⚙️ Iron:** Transparent proxy (reveals your real IP) or heavily blacklisted.

---

## 📡 REST API

The API is free, fast, and supports CORS so you can use it directly in Python, JavaScript, cURL, or any other language.

### Main Endpoints

#### 1. Plain Text List (`/api/v1/raw`)
Returns a simple line-by-line list of `protocol://ip:port`. Great for scripts and command-line tools.

```bash
# Get 20 Diamond SOCKS5 proxies from Germany
curl "http://localhost:8080/api/v1/raw?type=socks5&country=DE&tier=Diamond&limit=20"
```

#### 2. JSON List (`/api/v1/proxies`)
Returns full details for each proxy (country, city, latency, privacy level, and safety score).

```bash
# Get 10 clean HTTP proxies in JSON format
curl "http://localhost:8080/api/v1/proxies?type=http&clean_only=true&limit=10"
```

#### 3. Live Target URL Tester (`/api/v1/test`)
Tests proxies in real-time against any website you want to reach:

```bash
curl -N "http://localhost:8080/api/v1/test?url=https://httpbin.org/ip&stream=true"
```

#### 4. Live Statistics (`/api/v1/stats`)
```bash
curl "http://localhost:8080/api/v1/stats"
```

---

### Easy Query Filters

You can mix and match these filters in any request:

| Parameter | Example Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `type` | `http`, `socks4`, `socks5`, `socks`, `all` | `all` | Filter by proxy protocol |
| `country` | `US`, `DE`, `FR`, `GB`, `ALL` | `ALL` | 2-letter country code |
| `city` | `Frankfurt`, `London`, `ALL` | `ALL` | Filter by city name |
| `tier` | `Diamond`, `Gold`, `Silver`, `Bronze` | `ALL` | Filter by quality level |
| `clean_only` | `true`, `false` | `false` | Only return clean proxies with 0 threat score |
| `https` | `true`, `false` | `false` | Only return proxies that support HTTPS |
| `max_latency`| `500`, `1000` | `0` | Max response time in milliseconds |
| `limit` | `10`, `50`, `100` (`0` = all) | `0` | How many proxies to return |
| `random` | `true`, `false` | `false` | Randomize the order |

---

## 💻 Web Interface

NyxProxy comes with a built-in web dashboard:
- **Live Numbers:** See total alive proxies, country counts, and countdown to the next update.
- **Search & Filters:** Instantly search by IP, country, city, or protocol.
- **Custom URL Tester:** Test if proxies can connect to your specific website directly from the browser.
- **Copy & Download:** Copy all proxies with one click or download them as a `.txt` file.
- **Mobile Friendly:** Works smoothly on mobile browsers, as an installable app (PWA), or inside Telegram.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Free to use for personal and commercial projects.

- **Author:** [Erfan Fazeli](https://github.com/Erfan-Fazeli)
- **Developer Studio:** [NyxAgent.dev](https://NyxAgent.dev)
