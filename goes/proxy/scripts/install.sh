#!/bin/bash
set -euo pipefail

AGENT_TOKEN=""
API_URL="https://api.openroute.cn"
DATACENTER=""
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/openroute"

while [[ $# -gt 0 ]]; do
  case $1 in
    --token) AGENT_TOKEN="$2"; shift 2 ;;
    --api-url) API_URL="$2"; shift 2 ;;
    --datacenter) DATACENTER="$2"; shift 2 ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

if [ -z "$AGENT_TOKEN" ]; then
  echo "Error: --token is required"
  exit 1
fi

if [ -z "$DATACENTER" ]; then
  echo "Error: --datacenter is required"
  exit 1
fi

echo "Installing OpenRoute Edge Agent..."
echo "  Datacenter: ${DATACENTER}"
echo "  API URL:    ${API_URL}"

# Architecture detection
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  AGENT_ARCH="amd64" ;;
  aarch64) AGENT_ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Download binary
VERSION=$(curl -s "${API_URL}/api/agent/version" 2>/dev/null | grep -o '"latest":"[^"]*"' | cut -d'"' -f4 || echo "latest")
DOWNLOAD_URL="${API_URL}/api/agent/downloads/${VERSION}/openroute-agent-linux-${AGENT_ARCH}.tar.gz"
echo "Downloading ${DOWNLOAD_URL}..."

curl -fsSL "$DOWNLOAD_URL" -o /tmp/openroute-agent.tar.gz || {
  echo "Download failed, trying local build..."
  exit 1
}

tar xzf /tmp/openroute-agent.tar.gz -C "$INSTALL_DIR" openroute-agent
chmod +x "${INSTALL_DIR}/openroute-agent"

# Generate config
mkdir -p "$CONFIG_DIR"
AGENT_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)

cat > "${CONFIG_DIR}/agent.yaml" <<EOF
agent_id: "${AGENT_ID}"
agent_token: "${AGENT_TOKEN}"
api_url: "${API_URL}"
datacenter: "${DATACENTER}"
listen_addr: ":9090"
state_dir: "${CONFIG_DIR}"
log_level: "info"
ssh:
  concurrent_limit: 20
  connect_timeout: 10
  command_timeout: 60
  preferred_auth: ["publickey", "password"]
  bastion:
    host: ""
    port: "22"
    user: "ops"
    private_key_path: ""
k8s:
  kubeconfig_path: ""
  default_labels:
    "openroute.io/managed-by": "edge-agent"
    "openroute.io/datacenter": "${DATACENTER}"
polling:
  task_interval: 15
  heartbeat_interval: 30
retry:
  max_attempts: 3
  backoff_base: 10
  backoff_max: 300
health:
  ssh_probe_interval: 1800
  ssh_consecutive_fail_max: 3
  node_ready_timeout: 300
EOF

# Register systemd service
cat > /etc/systemd/system/openroute-agent.service <<EOF
[Unit]
Description=OpenRoute Edge Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/openroute-agent --config ${CONFIG_DIR}/agent.yaml
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now openroute-agent

sleep 3
if systemctl is-active --quiet openroute-agent; then
  echo "✅ OpenRoute Edge Agent installed successfully"
  echo "   Datacenter: ${DATACENTER}"
  echo "   Logs: journalctl -u openroute-agent -f"
else
  echo "❌ Agent failed to start, check logs: journalctl -u openroute-agent -n 50"
  exit 1
fi
