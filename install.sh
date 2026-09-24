#!/usr/bin/env bash
# ==============================================================================
#  ⚡ NYX PROXY GRID — ALL-IN-ONE PRODUCTION DEPLOYMENT & INSTALLER
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
NC='\033[0m' # No Color

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
    echo -e "   ${MINT}⚡ NYX PROXY GRID ENGINE  •  ENTERPRISE AUTO-INSTALLER & DEPLOYMENT${NC}"
    echo -e "${GRAY}  ─────────────────────────────────────────────────────────────────────────────${NC}\n"
}

print_banner

# --- Root Privileges Verification ---
if [[ $EUID -ne 0 ]]; then
    echo -e "${YELLOW} [!] This script requires root privileges. Attempting sudo...${NC}"
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

echo -e "${CYAN} [*] System Architecture detected: ${WHITE}${ARCH} (${GO_ARCH})${NC}"

# --- Install System Prerequisites ---
echo -e "${CYAN} [*] Checking and installing system packages...${NC}"

if command -v apt-get &>/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl wget git tar ufw build-essential ca-certificates >/dev/null 2>&1
elif command -v dnf &>/dev/null; then
    dnf install -y -q curl wget git tar gcc ca-certificates >/dev/null 2>&1
elif command -v yum &>/dev/null; then
    yum install -y -q curl wget git tar gcc ca-certificates >/dev/null 2>&1
elif command -v pacman &>/dev/null; then
    pacman -Sy --noconfirm curl wget git tar base-devel ca-certificates >/dev/null 2>&1
elif command -v apk &>/dev/null; then
    apk add --no-cache curl wget git tar build-base ca-certificates bash >/dev/null 2>&1
fi

# --- Golang Verification & Auto-Installer ---
install_golang() {
    echo -e "${YELLOW} [*] Downloading and installing official Golang distribution...${NC}"
    GO_LATEST_VERSION="1.23.1"
    GO_TAR="go${GO_LATEST_VERSION}.linux-${GO_ARCH}.tar.gz"
    
    wget -q --show-progress "https://go.dev/dl/${GO_TAR}" -O "/tmp/${GO_TAR}"
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "/tmp/${GO_TAR}"
    rm -f "/tmp/${GO_TAR}"
    
    export PATH="/usr/local/go/bin:$PATH"
    echo 'export PATH="/usr/local/go/bin:$PATH"' > /etc/profile.d/golang.sh
    chmod +x /etc/profile.d/golang.sh
    echo -e "${GREEN} [✓] Golang ${GO_LATEST_VERSION} installed successfully!${NC}"
}

if ! command -v go &>/dev/null; then
    install_golang
else
    CURRENT_GO_VER=$(go version | awk '{print $3}' | sed 's/go//')
    echo -e "${GREEN} [✓] Go compiler found: version ${CURRENT_GO_VER}${NC}"
fi

export PATH="/usr/local/go/bin:$PATH"

# --- Interactive Configuration Step ---
echo ""
echo -e "${WHITE}─────────────────────────────────────────────────────────────────────────────${NC}"
echo -e "${MINT} ⚙️  DEPLOYMENT CONFIGURATION SETUP${NC}"
echo -e "${WHITE}─────────────────────────────────────────────────────────────────────────────${NC}"
echo -e " Select your preferred deployment mode:"
echo -e "   ${CYAN}1)${NC} ${WHITE}IP Address Mode${NC}  (Standard HTTP on custom port, e.g. :8080 or :80)"
echo -e "   ${CYAN}2)${NC} ${WHITE}Domain Mode${NC}      (HTTPS with Automatic Let's Encrypt SSL & HTTP-01)"
echo ""

DEPLOY_MODE=""
while [[ "$DEPLOY_MODE" != "1" && "$DEPLOY_MODE" != "2" ]]; do
    read -r -p " Enter choice [1 or 2] (Default: 1): " DEPLOY_MODE < /dev/tty || DEPLOY_MODE="1"
    DEPLOY_MODE="${DEPLOY_MODE:-1}"
done

SERVER_PORT="8080"
SERVER_DOMAIN=""
SERVER_EMAIL=""
AUTO_SSL=false

if [[ "$DEPLOY_MODE" == "2" ]]; then
    echo ""
    echo -e "${CYAN} 🌐 Enter your fully qualified domain name (pointed to this server's IP):${NC}"
    while [[ -z "$SERVER_DOMAIN" ]]; do
        read -r -p " Domain Name (e.g. proxy.example.com): " SERVER_DOMAIN < /dev/tty
        SERVER_DOMAIN=$(echo "$SERVER_DOMAIN" | sed -e 's|^https://||' -e 's|^http://||' -e 's|/$||' | tr -d ' ')
    done

    echo -e "${CYAN} ✉️  Enter email address for Let's Encrypt certificate renewal (Optional):${NC}"
    read -r -p " Admin Email (e.g. admin@example.com): " SERVER_EMAIL < /dev/tty
    SERVER_EMAIL=$(echo "$SERVER_EMAIL" | tr -d ' ')
    AUTO_SSL=true
    SERVER_PORT="443"
else
    echo ""
    read -r -p " Enter HTTP port to bind [Default: 8080]: " INPUT_PORT < /dev/tty || INPUT_PORT="8080"
    SERVER_PORT="${INPUT_PORT:-8080}"
fi

echo -e "${GREEN} [✓] Configuration selected: Mode=${DEPLOY_MODE}, Domain='${SERVER_DOMAIN}', Port=${SERVER_PORT}${NC}"

# --- Setup Target Directory & Source Code ---
echo ""
echo -e "${CYAN} [*] Setting up workspace directory...${NC}"

# Check if current directory is already the repository
if [[ -f "src/main.go" && -f "src/api.go" ]]; then
    INSTALL_DIR="$(pwd)"
    echo -e "${GREEN} [✓] Using current repository directory: ${INSTALL_DIR}${NC}"
else
    mkdir -p "$INSTALL_DIR"
    if [[ -d "$INSTALL_DIR/.git" ]]; then
        echo -e "${CYAN} [*] Pulling latest updates from GitHub...${NC}"
        cd "$INSTALL_DIR"
        git pull origin main || git pull origin master || true
    else
        echo -e "${CYAN} [*] Cloning NyxProxy repository to ${INSTALL_DIR}...${NC}"
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
fi

# Ensure data directory exists
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/data/certs"

# Write config.json
cat <<EOF > "$INSTALL_DIR/data/config.json"
{
  "port": "${SERVER_PORT}",
  "domain": "${SERVER_DOMAIN}",
  "email": "${SERVER_EMAIL}",
  "auto_ssl": ${AUTO_SSL}
}
EOF

# --- Compile Optimized Binary ---
echo -e "${CYAN} [*] Building NyxProxy engine binary...${NC}"
cd "$INSTALL_DIR"
go mod tidy
go build -ldflags="-s -w" -o nyxProxy ./src

chmod +x nyxProxy
echo -e "${GREEN} [✓] Binary successfully compiled: ${INSTALL_DIR}/nyxProxy${NC}"

# --- Systemd Service Configuration ---
echo -e "${CYAN} [*] Configuring Systemd Service (nyxproxy.service)...${NC}"

cat <<EOF > /etc/systemd/system/nyxproxy.service
[Unit]
Description=NyxProxy Global Proxy Grid Engine & API
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
    echo -e "${CYAN} [*] Updating UFW firewall rules...${NC}"
    if [[ "$AUTO_SSL" == "true" ]]; then
        ufw allow 80/tcp >/dev/null 2>&1 || true
        ufw allow 443/tcp >/dev/null 2>&1 || true
    else
        ufw allow "${SERVER_PORT}/tcp" >/dev/null 2>&1 || true
    fi
elif command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld; then
    echo -e "${CYAN} [*] Updating firewalld rules...${NC}"
    if [[ "$AUTO_SSL" == "true" ]]; then
        firewall-cmd --permanent --add-service=http --add-service=https >/dev/null 2>&1 || true
    else
        firewall-cmd --permanent --add-port="${SERVER_PORT}/tcp" >/dev/null 2>&1 || true
    fi
    firewall-cmd --reload >/dev/null 2>&1 || true
fi

# --- Health Probe ---
echo -e "${CYAN} [*] Verifying service health status...${NC}"
sleep 2

SERVER_PUBLIC_IP="$(curl -s --max-time 3 https://api.ipify.org || curl -s --max-time 3 http://checkip.amazonaws.com || echo "YOUR_SERVER_IP")"

# --- Final Output Banner ---
echo ""
echo -e "${GRAY}  ─────────────────────────────────────────────────────────────────────────────${NC}"
echo -e "   ${MINT}🎉 NYX PROXY ENGINE DEPLOYED & RUNNING SUCCESSFULLY!${NC}"
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
