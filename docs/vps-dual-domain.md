# Dual-Domain VPS Deployment (Web + Resolver)

This setup runs both app servers on one Ubuntu 24 VPS:

- Web app server (`apps/web`) on `127.0.0.1:3000`
- Resolver server (`apps/resolver-worker` via `wrangler dev`) on `127.0.0.1:8787`
- Nginx routes each domain to the correct local service

## VPS specs

Minimum (MVP):

- 2 vCPU
- 4 GB RAM
- 60 GB SSD
- Ubuntu 24.04 LTS

Recommended production:

- 4 vCPU
- 8 GB RAM
- 100 GB SSD
- Daily snapshots/backups

## Domains (Cloudflare)

Use two subdomains:

- `app.yourdomain.com` -> web UI
- `q.yourdomain.com` -> resolver API/redirect domain

Create these DNS records in Cloudflare:

1. `A` record `app` -> `<YOUR_VPS_PUBLIC_IP>`
2. `A` record `q` -> `<YOUR_VPS_PUBLIC_IP>`

Proxy status:

- Start with **DNS only** while provisioning TLS
- After certs are active, you can switch to **Proxied**

## Bootstrap on fresh VPS

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/cwalinapj/QRCODE.git
cd QRCODE
sudo APP_DOMAIN=app.yourdomain.com RESOLVER_DOMAIN=q.yourdomain.com ENABLE_TLS=true LETSENCRYPT_EMAIL=you@yourdomain.com bash scripts/vps/bootstrap-ubuntu24-dual-domain.sh
```

## What this script sets up

- Node.js 20 + pnpm
- app checkout at `/opt/qr-forever`
- systemd services:
  - `qr-forever-web.service`
  - `qr-forever-resolver.service`
  - `qr-forever-deploy.timer`
- nginx virtual hosts for both domains
- optional Let's Encrypt certs for both domains

## Runtime config

Edit:

```bash
sudo nano /etc/qr-forever/qr-forever.env
```

Required values:

- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `RESOLVER_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (if used)

The script sets resolver base URL to:

- `NEXT_PUBLIC_RESOLVER_BASE_URL=https://q.yourdomain.com`

After any config change:

```bash
sudo FORCE_DEPLOY=1 /usr/local/bin/qr-forever-redeploy.sh
```

## Health checks

```bash
systemctl status qr-forever-web
systemctl status qr-forever-resolver
systemctl status qr-forever-deploy.timer
journalctl -u qr-forever-web -f
journalctl -u qr-forever-resolver -f
curl -I https://app.yourdomain.com
curl -I https://q.yourdomain.com/health
```
