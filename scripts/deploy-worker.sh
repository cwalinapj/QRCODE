#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

CONTRACT_ADDRESS="${RESOLVER_CONTRACT_ADDRESS:-${CONTRACT_ADDRESS:-}}"
POLYGON_RPC_URL="${RESOLVER_POLYGON_RPC_URL:-${POLYGON_RPC_URL:-https://polygon-rpc.com}}"
RATE_LIMIT_PER_MINUTE="${RESOLVER_RATE_LIMIT_PER_MINUTE:-60}"
ALLOW_PUBLIC_RESOLVER="${ALLOW_PUBLIC_RESOLVER:-true}"
BILLING_WEBHOOK_URL="${BILLING_WEBHOOK_URL:-}"
BILLING_WEBHOOK_AUTH="${BILLING_WEBHOOK_AUTH:-}"

if [[ -z "${CONTRACT_ADDRESS}" ]]; then
  echo "Missing resolver contract address. Set RESOLVER_CONTRACT_ADDRESS or CONTRACT_ADDRESS in .env"
  exit 1
fi

echo "Deploying resolver worker"
echo "- contract: ${CONTRACT_ADDRESS}"
echo "- rpc: ${POLYGON_RPC_URL}"
echo "- public resolver: ${ALLOW_PUBLIC_RESOLVER}"

pnpm --filter @qr-forever/resolver-worker exec wrangler deploy \
  --var "CONTRACT_ADDRESS:${CONTRACT_ADDRESS}" \
  --var "POLYGON_RPC_URL:${POLYGON_RPC_URL}" \
  --var "RATE_LIMIT_PER_MINUTE:${RATE_LIMIT_PER_MINUTE}" \
  --var "ALLOW_PUBLIC_RESOLVER:${ALLOW_PUBLIC_RESOLVER}" \
  --var "BILLING_WEBHOOK_URL:${BILLING_WEBHOOK_URL}" \
  --var "BILLING_WEBHOOK_AUTH:${BILLING_WEBHOOK_AUTH}"

if [[ -n "${ADMIN_API_TOKEN:-}" ]]; then
  printf '%s' "${ADMIN_API_TOKEN}" | pnpm --filter @qr-forever/resolver-worker exec wrangler secret put ADMIN_API_TOKEN
  echo "Updated worker secret: ADMIN_API_TOKEN"
else
  echo "ADMIN_API_TOKEN not set in env; admin API endpoints will return 503 until configured."
fi
