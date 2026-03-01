import {
  qrRegistryAbi,
  toDestinationUrl,
  isValidTargetByType,
  type TargetType,
} from "@qr-forever/shared";
import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  http,
} from "viem";

type Env = {
  POLYGON_RPC_URL: string;
  CONTRACT_ADDRESS: string;
  RATE_LIMIT_PER_MINUTE?: string;
  MOCK_RECORDS_JSON?: string;
  ALLOW_PUBLIC_RESOLVER?: string;
  ADMIN_API_TOKEN?: string;
  BILLING_WEBHOOK_URL?: string;
  BILLING_WEBHOOK_AUTH?: string;
  RESOLVER_KV?: KVNamespace;
};

type RateCounter = {
  windowStart: number;
  count: number;
};

type ApiKeyRecord = {
  id: string;
  name: string;
  secretHash: string;
  creditsRemaining: number;
  totalCalls: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};

type ResolvedRecord = {
  tokenId: string;
  targetType: TargetType;
  target: string;
  destination: string;
  txHash: string;
};

const counters = new Map<string, RateCounter>();
const memoryKeys = new Map<string, ApiKeyRecord>();

const chain = defineChain({
  id: 137,
  name: "Polygon",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://polygon-rpc.com"] },
  },
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

export function isRateLimited(ip: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const current = counters.get(ip);

  if (!current || now - current.windowStart >= 60_000) {
    counters.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  if (current.count >= maxPerMinute) {
    return true;
  }

  current.count += 1;
  counters.set(ip, current);
  return false;
}

export function parseApiKeyToken(input: string | null): { id: string; secret: string } | null {
  if (!input) return null;
  const trimmed = input.trim();
  const match = /^qrf_live_([a-zA-Z0-9]{12,64})_([a-zA-Z0-9]{24,128})$/.exec(trimmed);
  if (!match) return null;
  return { id: match[1], secret: match[2] };
}

export function buildApiKeyToken(id: string, secret: string): string {
  return `qrf_live_${id}_${secret}`;
}

function getApiKeyFromRequest(request: Request): string | null {
  const direct = request.headers.get("x-api-key");
  if (direct) return direct;

  const auth = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  if (auth.startsWith(prefix)) return auth.slice(prefix.length).trim();

  return null;
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomAlphaNum(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function readKeyRecord(env: Env, id: string): Promise<ApiKeyRecord | null> {
  if (env.RESOLVER_KV) {
    return await env.RESOLVER_KV.get(`api_key:${id}`, "json");
  }
  return memoryKeys.get(id) || null;
}

async function writeKeyRecord(env: Env, record: ApiKeyRecord): Promise<void> {
  if (env.RESOLVER_KV) {
    await env.RESOLVER_KV.put(`api_key:${record.id}`, JSON.stringify(record));
    return;
  }
  memoryKeys.set(record.id, record);
}

async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  const token = env.ADMIN_API_TOKEN?.trim();
  if (!token) {
    return jsonResponse(
      { error: "admin_not_configured", message: "Set ADMIN_API_TOKEN as a Worker secret." },
      503,
    );
  }

  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${token}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  return null;
}

async function createApiKey(env: Env, name: string, credits: number): Promise<{ record: ApiKeyRecord; apiKey: string }> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const secret = randomAlphaNum(40);
  const secretHash = await sha256Hex(secret);
  const now = new Date().toISOString();

  const record: ApiKeyRecord = {
    id,
    name,
    secretHash,
    creditsRemaining: Math.max(0, Math.floor(credits)),
    totalCalls: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await writeKeyRecord(env, record);
  return { record, apiKey: buildApiKeyToken(id, secret) };
}

async function authenticateApiKey(request: Request, env: Env): Promise<{ record: ApiKeyRecord } | { response: Response }> {
  const raw = getApiKeyFromRequest(request);
  const parsed = parseApiKeyToken(raw);
  if (!parsed) {
    return { response: jsonResponse({ error: "missing_or_invalid_api_key" }, 401) };
  }

  const record = await readKeyRecord(env, parsed.id);
  if (!record || !record.active) {
    return { response: jsonResponse({ error: "api_key_not_found_or_inactive" }, 401) };
  }

  const providedHash = await sha256Hex(parsed.secret);
  if (providedHash !== record.secretHash) {
    return { response: jsonResponse({ error: "invalid_api_key" }, 401) };
  }

  return { record };
}

async function consumeCredit(env: Env, record: ApiKeyRecord): Promise<{ ok: true; record: ApiKeyRecord } | { ok: false }> {
  if (record.creditsRemaining <= 0) return { ok: false };

  const updated: ApiKeyRecord = {
    ...record,
    creditsRemaining: record.creditsRemaining - 1,
    totalCalls: record.totalCalls + 1,
    lastUsedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeKeyRecord(env, updated);
  return { ok: true, record: updated };
}

function renderHtml(args: {
  tokenId: string;
  destination: string;
  targetType: string;
  target: string;
  txHash: string;
  autoRedirect: boolean;
}): Response {
  const autoScript = args.autoRedirect
    ? `<script>
      let canceled = false;
      const btn = document.getElementById('cancel');
      btn?.addEventListener('click', () => { canceled = true; document.getElementById('status').innerText = 'Redirect canceled'; });
      setTimeout(() => { if (!canceled) window.location.href = ${JSON.stringify(args.destination)}; }, 1500);
    </script>`
    : "";

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>QR Verification #${args.tokenId}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; background:#f8fafc; color:#0f172a; margin:0; padding:20px; }
      .card { max-width:680px; margin:0 auto; background:white; border:1px solid #e2e8f0; border-radius:14px; padding:20px; }
      .tag { display:inline-block; padding:4px 8px; border-radius:999px; background:#dcfce7; color:#166534; font-size:12px; font-weight:700; }
      .line { margin:10px 0; word-break: break-all; }
      button, a.btn { display:inline-block; margin-top:12px; background:#0f6b4a; color:white; border:0; border-radius:8px; padding:10px 14px; text-decoration:none; cursor:pointer; }
      #cancel { background:#334155; margin-left:8px; }
      .muted { color:#475569; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="tag">Verified on-chain</div>
      <h1>QR #${args.tokenId}</h1>
      <div class="line"><strong>Type:</strong> ${args.targetType}</div>
      <div class="line"><strong>Destination:</strong> ${args.target}</div>
      <div class="line"><strong>Last update tx:</strong> ${args.txHash || "n/a"}</div>
      <a class="btn" href="${args.destination}">Open destination</a>
      ${args.autoRedirect ? '<button id="cancel">Cancel auto-redirect</button><p id="status" class="muted">Auto-redirecting in 1.5 seconds...</p>' : ""}
      <p class="muted">Resolver verifies the on-chain record before redirecting.</p>
    </div>
    ${autoScript}
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function getLastUpdateTx(
  client: ReturnType<typeof createPublicClient>,
  contractAddress: `0x${string}`,
  tokenId: bigint,
): Promise<string> {
  const blockNumber = await client.getBlockNumber();

  const logs = await client.getLogs({
    address: contractAddress,
    fromBlock: blockNumber > 50_000n ? blockNumber - 50_000n : 0n,
    toBlock: blockNumber,
  });

  let latest = "";
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: qrRegistryAbi,
        topics: log.topics,
        data: log.data,
      });

      if (decoded.args.tokenId !== tokenId) continue;
      if (decoded.eventName === "TargetUpdated" || decoded.eventName === "Minted") {
        latest = log.transactionHash;
      }
    } catch {
      // ignore
    }
  }

  return latest;
}

function parseTokenId(pathname: string): string | null {
  const publicMatch = pathname.match(/^\/r\/(\d+)$/);
  if (publicMatch?.[1]) return publicMatch[1];

  const apiMatch = pathname.match(/^\/api\/resolve\/(\d+)$/);
  return apiMatch?.[1] || null;
}

function readMockRecord(env: Env, tokenId: string): {
  targetType: TargetType;
  target: string;
  txHash: string;
} | null {
  if (!env.MOCK_RECORDS_JSON) return null;

  try {
    const data = JSON.parse(env.MOCK_RECORDS_JSON) as Record<
      string,
      { targetType: TargetType; target: string; txHash?: string }
    >;
    const record = data[tokenId];
    if (!record) return null;

    return {
      targetType: record.targetType,
      target: record.target,
      txHash: record.txHash || "",
    };
  } catch {
    return null;
  }
}

async function resolveRecord(tokenIdRaw: string, env: Env): Promise<ResolvedRecord> {
  const mocked = readMockRecord(env, tokenIdRaw);
  if (mocked) {
    if (!isValidTargetByType(mocked.targetType, mocked.target)) {
      throw new Error("Stored target is invalid");
    }

    return {
      tokenId: tokenIdRaw,
      targetType: mocked.targetType,
      target: mocked.target,
      destination: toDestinationUrl(mocked.targetType, mocked.target),
      txHash: mocked.txHash,
    };
  }

  const client = createPublicClient({
    chain,
    transport: http(env.POLYGON_RPC_URL),
  });

  const tokenId = BigInt(tokenIdRaw);
  const recordResult = await client.readContract({
    address: env.CONTRACT_ADDRESS as `0x${string}`,
    abi: qrRegistryAbi,
    functionName: "getRecord",
    args: [tokenId],
  });

  const record = (
    recordResult as readonly [
      { targetType: string; target: string },
      string,
    ]
  )[0];

  const targetType = record.targetType as TargetType;
  const target = record.target;

  if (!isValidTargetByType(targetType, target)) {
    throw new Error("Stored target is invalid");
  }

  const txHash = await getLastUpdateTx(
    client,
    env.CONTRACT_ADDRESS as `0x${string}`,
    tokenId,
  );

  return {
    tokenId: tokenIdRaw,
    targetType,
    target,
    destination: toDestinationUrl(targetType, target),
    txHash,
  };
}

async function handleAdmin(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/admin/")) return null;

  const adminCheck = await requireAdmin(request, env);
  if (adminCheck) return adminCheck;

  if (request.method === "POST" && url.pathname === "/api/admin/keys/create") {
    const body = await request.json().catch(() => ({})) as { name?: string; credits?: number };
    const name = (body.name || "default").slice(0, 80);
    const credits = Number.isFinite(body.credits) ? Number(body.credits) : 0;

    const created = await createApiKey(env, name, Math.max(0, Math.floor(credits)));
    return jsonResponse({
      id: created.record.id,
      name: created.record.name,
      creditsRemaining: created.record.creditsRemaining,
      active: created.record.active,
      apiKey: created.apiKey,
      warning: "Store this key securely. Secret is only returned once.",
    }, 201);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/keys/topup") {
    const body = await request.json().catch(() => ({})) as { keyId?: string; credits?: number };
    const keyId = body.keyId || "";
    const credits = Number(body.credits || 0);

    const record = await readKeyRecord(env, keyId);
    if (!record) return jsonResponse({ error: "key_not_found" }, 404);

    const updated: ApiKeyRecord = {
      ...record,
      creditsRemaining: record.creditsRemaining + Math.max(0, Math.floor(credits)),
      updatedAt: new Date().toISOString(),
    };
    await writeKeyRecord(env, updated);

    return jsonResponse({
      id: updated.id,
      creditsRemaining: updated.creditsRemaining,
      active: updated.active,
      totalCalls: updated.totalCalls,
    });
  }

  const keyMatch = url.pathname.match(/^\/api\/admin\/keys\/([a-zA-Z0-9]{12,64})$/);
  if (request.method === "GET" && keyMatch?.[1]) {
    const record = await readKeyRecord(env, keyMatch[1]);
    if (!record) return jsonResponse({ error: "key_not_found" }, 404);

    return jsonResponse({
      id: record.id,
      name: record.name,
      creditsRemaining: record.creditsRemaining,
      totalCalls: record.totalCalls,
      active: record.active,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastUsedAt: record.lastUsedAt || null,
    });
  }

  if (request.method === "POST" && url.pathname.match(/^\/api\/admin\/keys\/[a-zA-Z0-9]{12,64}\/deactivate$/)) {
    const id = url.pathname.split("/")[4];
    const record = await readKeyRecord(env, id);
    if (!record) return jsonResponse({ error: "key_not_found" }, 404);

    const updated: ApiKeyRecord = { ...record, active: false, updatedAt: new Date().toISOString() };
    await writeKeyRecord(env, updated);
    return jsonResponse({ id: updated.id, active: updated.active });
  }

  if (request.method === "POST" && url.pathname.match(/^\/api\/admin\/keys\/[a-zA-Z0-9]{12,64}\/activate$/)) {
    const id = url.pathname.split("/")[4];
    const record = await readKeyRecord(env, id);
    if (!record) return jsonResponse({ error: "key_not_found" }, 404);

    const updated: ApiKeyRecord = { ...record, active: true, updatedAt: new Date().toISOString() };
    await writeKeyRecord(env, updated);
    return jsonResponse({ id: updated.id, active: updated.active });
  }

  return jsonResponse({ error: "not_found" }, 404);
}

async function postBillingUsage(
  env: Env,
  payload: { apiKeyId: string; tokenId: string; creditsRemaining: number; totalCalls: number },
): Promise<void> {
  if (!env.BILLING_WEBHOOK_URL) return;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (env.BILLING_WEBHOOK_AUTH) {
    headers.authorization = `Bearer ${env.BILLING_WEBHOOK_AUTH}`;
  }

  await fetch(env.BILLING_WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...payload,
      ts: new Date().toISOString(),
      chain: "polygon",
    }),
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    const adminResponse = await handleAdmin(request, url, env);
    if (adminResponse) return adminResponse;

    if (!env.CONTRACT_ADDRESS) {
      return jsonResponse({ error: "resolver_not_configured" }, 500);
    }

    const maxPerMinute = Number(env.RATE_LIMIT_PER_MINUTE || 60);
    const ip = getIp(request);
    if (isRateLimited(ip, maxPerMinute)) {
      return jsonResponse({ error: "too_many_requests" }, 429);
    }

    if (url.pathname === "/api/me") {
      const auth = await authenticateApiKey(request, env);
      if ("response" in auth) return auth.response;

      const record = auth.record;
      return jsonResponse({
        id: record.id,
        name: record.name,
        creditsRemaining: record.creditsRemaining,
        totalCalls: record.totalCalls,
        active: record.active,
        lastUsedAt: record.lastUsedAt || null,
      });
    }

    const tokenIdRaw = parseTokenId(url.pathname);
    if (!tokenIdRaw) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const resolved = await resolveRecord(tokenIdRaw, env);

      if (url.pathname.startsWith("/api/resolve/")) {
        const auth = await authenticateApiKey(request, env);
        if ("response" in auth) return auth.response;

        const consumed = await consumeCredit(env, auth.record);
        if (!consumed.ok) {
          return jsonResponse({ error: "insufficient_credits" }, 402);
        }

        ctx.waitUntil(
          postBillingUsage(env, {
            apiKeyId: consumed.record.id,
            tokenId: tokenIdRaw,
            creditsRemaining: consumed.record.creditsRemaining,
            totalCalls: consumed.record.totalCalls,
          }),
        );

        return jsonResponse({
          verified: true,
          chain: "polygon",
          recordId: resolved.tokenId,
          targetType: resolved.targetType,
          target: resolved.target,
          destination: resolved.destination,
          lastUpdateTxHash: resolved.txHash,
          creditsRemaining: consumed.record.creditsRemaining,
        });
      }

      if (env.ALLOW_PUBLIC_RESOLVER === "false") {
        const auth = await authenticateApiKey(request, env);
        if ("response" in auth) return auth.response;
      }

      const autoRedirect = url.searchParams.get("redirect") !== "0";

      return renderHtml({
        tokenId: tokenIdRaw,
        destination: resolved.destination,
        targetType: resolved.targetType,
        target: resolved.target,
        txHash: resolved.txHash,
        autoRedirect,
      });
    } catch (error) {
      return jsonResponse(
        { error: "resolver_error", message: error instanceof Error ? error.message : "unknown" },
        500,
      );
    }
  },
};
