#!/usr/bin/env bash
# ==============================================================================
#  ⚡ NYX PROXY LIST TOOLS — AUTOMATED SCRAPER & HEALTH CHECKER INSTALLER
#  Repository: https://github.com/Erfan-Fazeli/NyxProxyList
#  Author: Erfan Fazeli (NyxAgent.dev Developer Studio)
# ==============================================================================

set -e

# --- Color Constants ---
RED='\033[0;31m'
GREEN='\033[0;32m'
MINT='\033[38;2;0;245;155m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m'

# --- Brand Banner ---
print_banner() {
    clear || true
    echo -e "${MINT}"
    echo "  ███╗   ██╗██╗   ██╗██╗  ██╗    ██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗"
    echo "  ████╗  ██║╚██╗ ██╔╝╚██╗██╔╝    ██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝"
    echo "  ██╔██╗ ██║ ╚████╔╝  ╚███╔╝     ██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝ "
    echo "  ██║╚██╗██║  ╚██╔╝   ██╔██╗     ██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝  "
    echo "  ██║ ╚████║   ██║   ██╔╝ ██╗    ██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║   "
    echo "  ╚═╝  ╚═══╝   ╚═╝  ╚═╝  ╚═╝    ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   "
    echo -e "${NC}"
    echo -e "${GRAY}  ─────────────────────────────────────────────────────────────────────────────${NC}"
    echo -e "   ${MINT}⚡ NYX PROXY LIST TOOLS v1.2  •  AUTOMATED SCRAPER & HEALTH CHECKER${NC}"
    echo -e "${GRAY}  ─────────────────────────────────────────────────────────────────────────────${NC}\n"
}

print_banner

# --- Root Privileges Verification ---
if [[ $EUID -ne 0 ]]; then
    echo -e "   ${YELLOW}⚠ Root privileges required. Escalating with sudo...${NC}"
    exec sudo -E bash "$0" "$@"
fi

INSTALL_DIR="/opt/nyxproxy"
REPO_URL="https://github.com/Erfan-Fazeli/NyxProxyList.git"
GO_MIN_VERSION="1.22"

# --- Detect OS & Architecture ---
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64|amd64) GO_ARCH="amd64" ;;
    aarch64|arm64) GO_ARCH="arm64" ;;
    armv7l|armv6l) GO_ARCH="armv6l" ;;
    i386|i686)     GO_ARCH="386" ;;
    *)             GO_ARCH="amd64" ;;
esac

echo -e "   ${CYAN}•${NC} System Architecture : ${WHITE}${ARCH} (${GO_ARCH})${NC}"

# --- Install System Prerequisites ---
echo -e "   ${CYAN}•${NC} Checking system packages..."

if command -v apt-get &>/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq || true
    apt-get install -y -qq curl wget git tar ca-certificates >/dev/null 2>&1 || true
elif command -v dnf &>/dev/null; then
    dnf install -y -q curl wget git tar gcc ca-certificates >/dev/null 2>&1 || true
elif command -v yum &>/dev/null; then
    yum install -y -q curl wget git tar gcc ca-certificates >/dev/null 2>&1 || true
elif command -v pacman &>/dev/null; then
    pacman -Sy --noconfirm curl wget git tar base-devel ca-certificates >/dev/null 2>&1 || true
elif command -v apk &>/dev/null; then
    apk add --no-cache curl wget git tar build-base ca-certificates bash >/dev/null 2>&1 || true
fi

# --- Golang Verification & Multi-Strategy Auto-Installer ---
is_go_version_valid() {
    export PATH="/usr/local/go/bin:/snap/bin:$PATH"
    if ! command -v go &>/dev/null; then
        return 1
    fi
    local ver_str
    ver_str=$(go version 2>/dev/null | awk '{print $3}' | sed 's/go//')
    if [[ -z "$ver_str" ]]; then
        return 1
    fi
    local major minor
    major=$(echo "$ver_str" | cut -d. -f1)
    minor=$(echo "$ver_str" | cut -d. -f2)
    if [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]]; then
        if [[ "$major" -gt 1 ]] || [[ "$major" -eq 1 && "$minor" -ge 22 ]]; then
            return 0
        fi
    fi
    return 1
}

install_golang() {
    echo -e "   ${YELLOW}•${NC} Installing modern Golang compiler (>= 1.22)..."

    # Strategy 1: Snap Package Manager
    if command -v snap &>/dev/null; then
        snap install go --classic >/dev/null 2>&1 || true
        export PATH="/snap/bin:$PATH"
        if is_go_version_valid; then
            echo -e "   ${GREEN}✓${NC} Golang installed via Snap: ${WHITE}$(go version | awk '{print $3}')${NC}"
            return 0
        fi
    fi

    # Strategy 2: System Package Manager
    if command -v apt-get &>/dev/null; then
        apt-get install -y -qq golang-go >/dev/null 2>&1 || apt-get install -y -qq golang >/dev/null 2>&1 || true
    elif command -v dnf &>/dev/null; then
        dnf install -y -q golang >/dev/null 2>&1 || true
    elif command -v yum &>/dev/null; then
        yum install -y -q golang >/dev/null 2>&1 || true
    elif command -v pacman &>/dev/null; then
        pacman -Sy --noconfirm go >/dev/null 2>&1 || true
    elif command -v apk &>/dev/null; then
        apk add --no-cache go >/dev/null 2>&1 || true
    fi

    if is_go_version_valid; then
        echo -e "   ${GREEN}✓${NC} Golang installed via Package Manager: ${WHITE}$(go version 2>/dev/null | awk '{print $3}')${NC}"
        return 0
    fi

    # Strategy 3: Official Binary Tarball
    echo -e "   ${CYAN}•${NC} Fetching official Go binary distribution..."
    LATEST_GO_VER=""
    if command -v curl &>/dev/null; then
        LATEST_GO_VER=$(curl -sSL --connect-timeout 5 "https://go.dev/VERSION?m=text" 2>/dev/null | head -n 1 || true)
    elif command -v wget &>/dev/null; then
        LATEST_GO_VER=$(wget -qO- --timeout=5 "https://go.dev/VERSION?m=text" 2>/dev/null | head -n 1 || true)
    fi

    if [[ -z "$LATEST_GO_VER" || ! "$LATEST_GO_VER" =~ ^go[0-9] ]]; then
        LATEST_GO_VER="go1.23.1"
    fi

    GO_TAR="${LATEST_GO_VER}.linux-${GO_ARCH}.tar.gz"
    DOWNLOAD_SUCCESS=false
    URLS=(
        "https://dl.google.com/go/${GO_TAR}"
        "https://go.dev/dl/${GO_TAR}"
        "https://golang.google.cn/dl/${GO_TAR}"
    )

    for DL_URL in "${URLS[@]}"; do
        if command -v curl &>/dev/null; then
            if curl -fSL --connect-timeout 15 "$DL_URL" -o "/tmp/${GO_TAR}" >/dev/null 2>&1; then
                DOWNLOAD_SUCCESS=true
                break
            fi
        elif command -v wget &>/dev/null; then
            if wget -q --timeout=15 "$DL_URL" -O "/tmp/${GO_TAR}" >/dev/null 2>&1; then
                DOWNLOAD_SUCCESS=true
                break
            fi
        fi
    done

    if [ "$DOWNLOAD_SUCCESS" = true ]; then
        rm -rf /usr/local/go
        tar -C /usr/local -xzf "/tmp/${GO_TAR}" >/dev/null 2>&1 || true
        rm -f "/tmp/${GO_TAR}"
        export PATH="/usr/local/go/bin:/snap/bin:$PATH"
        echo 'export PATH="/usr/local/go/bin:/snap/bin:$PATH"' > /etc/profile.d/golang.sh 2>/dev/null || true
        chmod +x /etc/profile.d/golang.sh 2>/dev/null || true
    fi

    if is_go_version_valid || [ -f "/usr/local/go/bin/go" ]; then
        export PATH="/usr/local/go/bin:/snap/bin:$PATH"
        echo -e "   ${GREEN}✓${NC} Golang installed: ${WHITE}$(go version 2>/dev/null | awk '{print $3}' || echo ${LATEST_GO_VER})${NC}"
        return 0
    else
        echo -e "   ${RED}✗ Failed to install Go >= 1.22. Please install Go manually.${NC}"
        exit 1
    fi
}

export PATH="/usr/local/go/bin:/snap/bin:$PATH"

if ! is_go_version_valid; then
    install_golang
else
    echo -e "   ${GREEN}✓${NC} Golang compiler verified: ${WHITE}$(go version 2>/dev/null | awk '{print $3}')${NC}"
fi

export PATH="/usr/local/go/bin:/snap/bin:$PATH"

# --- Inline Interactive Prompt Helper ---
read_input() {
    local var_name="$1"
    local label="$2"
    local default_val="$3"
    local user_val=""

    if [[ -n "$default_val" ]]; then
        echo -ne "   ${WHITE}▶${NC} ${label} ${GRAY}[Default: ${default_val}]${NC}: ${MINT}"
    else
        echo -ne "   ${WHITE}▶${NC} ${label}: ${MINT}"
    fi

    if [ -t 0 ]; then
        read -r user_val || true
    elif [ -c /dev/tty ]; then
        read -r user_val < /dev/tty || true
    else
        read -r user_val || true
    fi
    echo -ne "${NC}"

    user_val="$(echo "${user_val}" | tr -d '\r\n')"
    if [[ -z "$user_val" ]]; then
        user_val="$default_val"
    fi

    printf -v "$var_name" '%s' "$user_val"
}

# --- Deployment Configuration Setup ---
echo ""
echo -e "${GRAY}  ─────────────────────────────────────────────────────────────────────────────${NC}"
echo -e "   ${MINT}⚙️  DEPLOYMENT CONFIGURATION SETUP${NC}"
echo -e "${GRAY}  ─────────────────────────────────────────────────────────────────────────────${NC}"
echo -e "   ${CYAN}1)${NC} ${WHITE}IP Address Mode${NC}  ${GRAY}— Standard HTTP on custom port (e.g. :8080)${NC}"
echo -e "   ${CYAN}2)${NC} ${WHITE}Domain Mode${NC}      ${GRAY}— HTTPS with Automatic Let's Encrypt SSL (Port 443)${NC}"
echo ""

DEPLOY_MODE="1"
read_input DEPLOY_MODE "Select deployment mode (1 or 2)" "1"

if [[ "$DEPLOY_MODE" != "1" && "$DEPLOY_MODE" != "2" ]]; then
    DEPLOY_MODE="1"
fi

SERVER_PORT="8080"
SERVER_DOMAIN=""
SERVER_EMAIL=""
AUTO_SSL=false

if [[ "$DEPLOY_MODE" == "2" ]]; then
    echo ""
    read_input SERVER_DOMAIN "Enter domain pointed to this server (e.g. proxy.mysite.com)" ""
    SERVER_DOMAIN=$(echo "$SERVER_DOMAIN" | sed -e 's|^https://||' -e 's|^http://||' -e 's|/$||' | tr -d ' ')

    if [[ -z "$SERVER_DOMAIN" ]]; then
        echo -e "   ${YELLOW}⚠ No domain entered. Defaulting to IP Address Mode on port 8080...${NC}"
        DEPLOY_MODE="1"
        SERVER_PORT="8080"
        AUTO_SSL=false
    else
        read_input SERVER_EMAIL "Enter admin email for SSL renewal (Optional)" ""
        SERVER_EMAIL=$(echo "$SERVER_EMAIL" | tr -d ' ')
        AUTO_SSL=true
        SERVER_PORT="443"
    fi
else
    echo ""
    read_input SERVER_PORT "Enter HTTP port to bind" "8080"
    SERVER_PORT="${SERVER_PORT:-8080}"
fi

echo ""
echo -e "   ${GREEN}✓${NC} Configuration set: Mode=${WHITE}${DEPLOY_MODE}${NC}, Domain='${WHITE}${SERVER_DOMAIN:-N/A}${NC}', Port=${WHITE}${SERVER_PORT}${NC}"

# --- Setup Target Directory & Source Code ---
echo ""
echo -e "   ${CYAN}•${NC} Setting up application files..."

if [[ -f "src/main.go" && -f "src/api.go" ]]; then
    INSTALL_DIR="$(pwd)"
    echo -e "   ${GREEN}✓${NC} Using repository path: ${WHITE}${INSTALL_DIR}${NC}"
else
    mkdir -p "$INSTALL_DIR"
    if [[ -d "$INSTALL_DIR/.git" ]]; then
        echo -e "   ${CYAN}•${NC} Updating repository..."
        cd "$INSTALL_DIR"
        git pull origin main || git pull origin master || true
    else
        echo -e "   ${CYAN}•${NC} Cloning repository..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
fi

mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/data/certs"

cat <<EOF > "$INSTALL_DIR/data/config.json"
{
  "port": "${SERVER_PORT}",
  "domain": "${SERVER_DOMAIN}",
  "email": "${SERVER_EMAIL}",
  "auto_ssl": ${AUTO_SSL},
  "update_proxylist_interval_hours": 1
}
EOF

# --- Compile Binary ---
echo -e "   ${CYAN}•${NC} Compiling NyxProxy high-performance binary..."
cd "$INSTALL_DIR"
go mod tidy
go build -ldflags="-s -w" -o nyxProxy ./src
chmod +x nyxProxy
echo -e "   ${GREEN}✓${NC} Binary compiled successfully: ${WHITE}${INSTALL_DIR}/nyxProxy${NC}"

# --- Systemd Service Configuration ---
echo -e "   ${CYAN}•${NC} Configuring systemd daemon service..."

cat <<EOF > /etc/systemd/system/nyxproxy.service
[Unit]
Description=NyxProxy Automated Scraper & Health Checker
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/nyxProxy
Restart=always
RestartSec=3s
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nyxproxy >/dev/null 2>&1
systemctl restart nyxproxy

# --- Firewall Adjustments ---
if command -v ufw &>/dev/null && ufw status | grep -qw "active"; then
    echo -e "   ${CYAN}•${NC} Updating UFW firewall rules..."
    if [[ "$AUTO_SSL" == "true" ]]; then
        ufw allow 80/tcp >/dev/null 2>&1 || true
        ufw allow 443/tcp >/dev/null 2>&1 || true
    else
        ufw allow "${SERVER_PORT}/tcp" >/dev/null 2>&1 || true
    fi
elif command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld; then
    echo -e "   ${CYAN}•${NC} Updating firewalld rules..."
    if [[ "$AUTO_SSL" == "true" ]]; then
        firewall-cmd --permanent --add-service=http --add-service=https >/dev/null 2>&1 || true
    else
        firewall-cmd --permanent --add-port="${SERVER_PORT}/tcp" >/dev/null 2>&1 || true
    fi
    firewall-cmd --reload >/dev/null 2>&1 || true
fi

# --- Health Probe ---
echo -e "   ${CYAN}•${NC} Verifying service status..."
sleep 2

SERVER_PUBLIC_IP="$(curl -s --max-time 3 https://api.ipify.org || curl -s --max-time 3 http://checkip.amazonaws.com || echo "YOUR_SERVER_IP")"

# --- Final Output Banner ---
echo ""
echo -e "${GRAY}  ─────────────────────────────────────────────────────────────────────────────${NC}"
echo -e "   ${MINT}🎉 NYX PROXY LIST TOOLS DEPLOYED & RUNNING SUCCESSFULLY!${NC}"
echo -e "${GRAY}  ─────────────────────────────────────────────────────────────────────────────${NC}"

if [[ "$AUTO_SSL" == "true" ]]; then
    echo -e "   ${WHITE}• Web Dashboard :${NC} ${MINT}https://${SERVER_DOMAIN}/${NC}"
    echo -e "   ${WHITE}• API Docs      :${NC} ${CYAN}https://${SERVER_DOMAIN}/docs${NC}"
    echo -e "   ${WHITE}• Plaintext API :${NC} ${CYAN}https://${SERVER_DOMAIN}/api/v1/raw${NC}"
    echo -e "   ${WHITE}• JSON API      :${NC} ${CYAN}https://${SERVER_DOMAIN}/api/v1/proxies${NC}"
    echo -e "   ${WHITE}• SSL Security  :${NC} ${GREEN}Active (Let's Encrypt Auto-SSL on Port 443)${NC}"
else
    echo -e "   ${WHITE}• Web Dashboard :${NC} ${MINT}http://${SERVER_PUBLIC_IP}:${SERVER_PORT}/${NC}"
    echo -e "   ${WHITE}• API Docs      :${NC} ${CYAN}http://${SERVER_PUBLIC_IP}:${SERVER_PORT}/docs${NC}"
    echo -e "   ${WHITE}• Plaintext API :${NC} ${CYAN}http://${SERVER_PUBLIC_IP}:${SERVER_PORT}/api/v1/raw${NC}"
    echo -e "   ${WHITE}• JSON API      :${NC} ${CYAN}http://${SERVER_PUBLIC_IP}:${SERVER_PORT}/api/v1/proxies${NC}"
fi

echo -e "${GRAY}  ─────────────────────────────────────────────────────────────────────────────${NC}"
echo -e "   ${WHITE}Service Management Commands:${NC}"
echo -e "   ${GRAY}• Check Status :${NC} systemctl status nyxproxy"
echo -e "   ${GRAY}• View Logs    :${NC} journalctl -u nyxproxy -f"
echo -e "   ${GRAY}• Restart Core :${NC} systemctl restart nyxproxy"
echo -e "   ${GRAY}• Stop Service :${NC} systemctl stop nyxproxy"
echo -e "${GRAY}  ─────────────────────────────────────────────────────────────────────────────${NC}\n"
