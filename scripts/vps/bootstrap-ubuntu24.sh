#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/vps/bootstrap-ubuntu24.sh"
  exit 1
fi

REPO_URL="${REPO_URL:-https://github.com/cwalinapj/QRCODE.git}"
BRANCH="${BRANCH:-main}"
APP_USER="${APP_USER:-qrforever}"
APP_DIR="${APP_DIR:-/opt/qr-forever}"
APP_PORT="${APP_PORT:-3000}"
DOMAIN="${DOMAIN:-_}"
AUTO_DEPLOY_INTERVAL_MINUTES="${AUTO_DEPLOY_INTERVAL_MINUTES:-2}"
ENABLE_TLS="${ENABLE_TLS:-false}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
ENV_FILE="/etc/qr-forever/qr-forever.env"
DEFAULT_RESOLVER_BASE_URL="https://q.example.com"

if [[ "${DOMAIN}" != "_" ]]; then
  DEFAULT_RESOLVER_BASE_URL="https://${DOMAIN}"
fi

log() {
  echo "[qr-forever-bootstrap] $*"
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git nginx ca-certificates gnupg lsb-release build-essential ufw sudo

if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [[ "${NODE_MAJOR}" -lt 20 ]]; then
    log "Upgrading Node.js to 20"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
fi

log "Enabling pnpm via corepack"
corepack enable
corepack prepare pnpm@9.15.0 --activate

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  log "Creating app user ${APP_USER}"
  useradd --create-home --shell /bin/bash "${APP_USER}"
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  log "Cloning ${REPO_URL} into ${APP_DIR}"
  sudo -u "${APP_USER}" git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${APP_DIR}"
else
  log "Repository already exists at ${APP_DIR}; updating"
  sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && git fetch origin '${BRANCH}' --prune"
fi

mkdir -p /etc/qr-forever
if [[ ! -f "${ENV_FILE}" ]]; then
  log "Creating ${ENV_FILE}"
  cat > "${ENV_FILE}" <<ENV
# Web build/runtime values
NEXT_PUBLIC_CHAIN_ID=137
NEXT_PUBLIC_CONTRACT_ADDRESS=
NEXT_PUBLIC_USDC_ADDRESS=0x3c499c542cef5e3811e1192ce70d8cc03d5c3359
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-rpc.com
NEXT_PUBLIC_RESOLVER_BASE_URL=${DEFAULT_RESOLVER_BASE_URL}
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Resolver worker values (used if AUTO_DEPLOY_WORKER=true)
RESOLVER_POLYGON_RPC_URL=https://polygon-rpc.com
RESOLVER_CONTRACT_ADDRESS=
RESOLVER_RATE_LIMIT_PER_MINUTE=60
RESOLVER_MOCK_RECORDS_JSON=

# Optional worker auto-deploy from this VPS
AUTO_DEPLOY_WORKER=false
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
ENV
fi
chown root:"${APP_USER}" "${ENV_FILE}"
chmod 640 "${ENV_FILE}"

log "Installing env sync helper"
cat > /usr/local/bin/qr-forever-sync-env.sh <<'SYNC'
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/etc/qr-forever/qr-forever.env}"
APP_DIR="${2:-/opt/qr-forever}"
APP_USER="${3:-qrforever}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

mkdir -p "${APP_DIR}/apps/web" "${APP_DIR}/apps/resolver-worker"

cat > "${APP_DIR}/apps/web/.env.local" <<WEBENV
NEXT_PUBLIC_CHAIN_ID=${NEXT_PUBLIC_CHAIN_ID:-137}
NEXT_PUBLIC_CONTRACT_ADDRESS=${NEXT_PUBLIC_CONTRACT_ADDRESS:-}
NEXT_PUBLIC_USDC_ADDRESS=${NEXT_PUBLIC_USDC_ADDRESS:-0x3c499c542cef5e3811e1192ce70d8cc03d5c3359}
NEXT_PUBLIC_POLYGON_RPC_URL=${NEXT_PUBLIC_POLYGON_RPC_URL:-https://polygon-rpc.com}
NEXT_PUBLIC_RESOLVER_BASE_URL=${NEXT_PUBLIC_RESOLVER_BASE_URL:-https://q.example.com}
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:-}
WEBENV

cat > "${APP_DIR}/apps/resolver-worker/.dev.vars" <<WORKERENV
POLYGON_RPC_URL=${RESOLVER_POLYGON_RPC_URL:-https://polygon-rpc.com}
CONTRACT_ADDRESS=${RESOLVER_CONTRACT_ADDRESS:-}
RATE_LIMIT_PER_MINUTE=${RESOLVER_RATE_LIMIT_PER_MINUTE:-60}
MOCK_RECORDS_JSON=${RESOLVER_MOCK_RECORDS_JSON:-}
WORKERENV

chown "${APP_USER}:${APP_USER}" "${APP_DIR}/apps/web/.env.local" "${APP_DIR}/apps/resolver-worker/.dev.vars"
SYNC
chmod +x /usr/local/bin/qr-forever-sync-env.sh

log "Installing redeploy script"
cat > /usr/local/bin/qr-forever-redeploy.sh <<'REDEPLOY'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="__APP_DIR__"
APP_USER="__APP_USER__"
BRANCH="__BRANCH__"
ENV_FILE="__ENV_FILE__"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file at ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

/usr/local/bin/qr-forever-sync-env.sh "${ENV_FILE}" "${APP_DIR}" "${APP_USER}"

sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && git fetch origin '${BRANCH}' --prune"

local_rev=$(sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && git rev-parse HEAD")
remote_rev=$(sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && git rev-parse origin/'${BRANCH}'")

if [[ "${FORCE_DEPLOY:-0}" != "1" && "${local_rev}" == "${remote_rev}" ]]; then
  echo "No new commit on origin/${BRANCH}; skipping deploy."
  exit 0
fi

sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && git reset --hard origin/'${BRANCH}'"
sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && pnpm install --frozen-lockfile"
/usr/local/bin/qr-forever-sync-env.sh "${ENV_FILE}" "${APP_DIR}" "${APP_USER}"
sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && set -a; source '${ENV_FILE}'; set +a; pnpm build"

systemctl restart qr-forever-web.service

if [[ "${AUTO_DEPLOY_WORKER:-false}" == "true" ]]; then
  sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && set -a; source '${ENV_FILE}'; set +a; pnpm --filter @qr-forever/resolver-worker exec wrangler deploy"
fi
REDEPLOY

sed -i \
  -e "s/__APP_DIR__/$(escape_sed "${APP_DIR}")/g" \
  -e "s/__APP_USER__/$(escape_sed "${APP_USER}")/g" \
  -e "s/__BRANCH__/$(escape_sed "${BRANCH}")/g" \
  -e "s/__ENV_FILE__/$(escape_sed "${ENV_FILE}")/g" \
  /usr/local/bin/qr-forever-redeploy.sh
chmod +x /usr/local/bin/qr-forever-redeploy.sh

log "Installing systemd units"
cat > /etc/systemd/system/qr-forever-web.service <<SERVICE
[Unit]
Description=qr-forever Next.js web app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
ExecStart=/usr/bin/env pnpm --filter @qr-forever/web start -- -H 127.0.0.1 -p ${APP_PORT}
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SERVICE

cat > /etc/systemd/system/qr-forever-deploy.service <<SERVICE
[Unit]
Description=qr-forever git pull + build + restart
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/qr-forever-redeploy.sh
SERVICE

cat > /etc/systemd/system/qr-forever-deploy.timer <<TIMER
[Unit]
Description=Check for qr-forever updates

[Timer]
OnBootSec=1min
OnUnitActiveSec=${AUTO_DEPLOY_INTERVAL_MINUTES}min
Unit=qr-forever-deploy.service

[Install]
WantedBy=timers.target
TIMER

log "Configuring nginx"
cat > /etc/nginx/sites-available/qr-forever.conf <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_pass http://127.0.0.1:${APP_PORT};
    }
}
NGINX

ln -sf /etc/nginx/sites-available/qr-forever.conf /etc/nginx/sites-enabled/qr-forever.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if command -v ufw >/dev/null 2>&1; then
  log "Configuring firewall rules"
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
fi

if [[ "${ENABLE_TLS}" == "true" ]]; then
  if [[ "${DOMAIN}" == "_" || -z "${LETSENCRYPT_EMAIL}" ]]; then
    log "Skipping TLS: set DOMAIN and LETSENCRYPT_EMAIL to enable certbot"
  else
    log "Installing certbot and issuing certificate"
    apt-get install -y certbot python3-certbot-nginx
    if certbot --nginx -d "${DOMAIN}" --agree-tos --non-interactive -m "${LETSENCRYPT_EMAIL}" --redirect; then
      log "TLS enabled for ${DOMAIN}"
    else
      log "Certbot failed. Ensure DNS is pointing to this VPS, then rerun certbot manually."
    fi
  fi
fi

systemctl daemon-reload
systemctl enable qr-forever-web.service
FORCE_DEPLOY=1 /usr/local/bin/qr-forever-redeploy.sh
systemctl enable --now qr-forever-deploy.timer

log "Bootstrap complete"
log "Edit config: ${ENV_FILE}"
log "Redeploy now: sudo FORCE_DEPLOY=1 /usr/local/bin/qr-forever-redeploy.sh"
log "Tail web logs: journalctl -u qr-forever-web -f"
log "Check timer: systemctl status qr-forever-deploy.timer"
