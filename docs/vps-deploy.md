# Ubuntu 24 VPS Auto-Deploy

This repo includes a one-shot bootstrap script for fresh Ubuntu 24.04 servers:

- installs Node.js 20, pnpm, nginx, ufw
- clones `https://github.com/cwalinapj/QRCODE.git`
- creates a production systemd service for the web app
- creates a timer that checks for new commits and auto-redeploys
- optionally deploys the Cloudflare worker on each redeploy

## 1) DNS before running (recommended)

Point your domain A record to the VPS IP.

## 2) Run bootstrap on VPS

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/cwalinapj/QRCODE.git
cd QRCODE
sudo DOMAIN=qr.yourdomain.com ENABLE_TLS=true LETSENCRYPT_EMAIL=you@yourdomain.com bash scripts/vps/bootstrap-ubuntu24.sh
```

If you want a different repo branch or deploy path:

```bash
sudo BRANCH=main APP_DIR=/opt/qr-forever APP_PORT=3000 bash scripts/vps/bootstrap-ubuntu24.sh
```

## 3) Configure contract/runtime values

Edit:

```bash
sudo nano /etc/qr-forever/qr-forever.env
```

Set at minimum:

- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_RESOLVER_BASE_URL`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (if used)
- `RESOLVER_CONTRACT_ADDRESS`

Then redeploy:

```bash
sudo FORCE_DEPLOY=1 /usr/local/bin/qr-forever-redeploy.sh
```

## 4) Auto-deploy behavior

- Timer unit: `qr-forever-deploy.timer`
- Interval: `AUTO_DEPLOY_INTERVAL_MINUTES` (default `2`)
- Pull source: `origin/main` (or `BRANCH` override)

Every interval:

1. fetches latest commit
2. if changed, runs install + build
3. restarts `qr-forever-web.service`
4. if `AUTO_DEPLOY_WORKER=true`, runs `wrangler deploy`

## 5) Cloudflare worker auto-deploy (optional)

Set these in `/etc/qr-forever/qr-forever.env`:

- `AUTO_DEPLOY_WORKER=true`
- `CLOUDFLARE_API_TOKEN=...`
- `CLOUDFLARE_ACCOUNT_ID=...`
- `RESOLVER_CONTRACT_ADDRESS=...`

Then force a deploy:

```bash
sudo FORCE_DEPLOY=1 /usr/local/bin/qr-forever-redeploy.sh
```

## Useful operations

```bash
systemctl status qr-forever-web.service
systemctl status qr-forever-deploy.timer
journalctl -u qr-forever-web -f
journalctl -u qr-forever-deploy.service -f
sudo FORCE_DEPLOY=1 /usr/local/bin/qr-forever-redeploy.sh
```
