import {
  TARGET_TYPE,
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
};

type RateCounter = {
  windowStart: number;
  count: number;
};

const counters = new Map<string, RateCounter>();

const chain = defineChain({
  id: 137,
  name: "Polygon",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://polygon-rpc.com"] },
  },
});

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

  let latest: string = "";
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
  const match = pathname.match(/^\/r\/(\d+)$/);
  return match?.[1] || null;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    const tokenIdRaw = parseTokenId(url.pathname);
    if (!tokenIdRaw) {
      return new Response("Not found", { status: 404 });
    }

    const maxPerMinute = Number(env.RATE_LIMIT_PER_MINUTE || 60);
    const ip = getIp(request);
    if (isRateLimited(ip, maxPerMinute)) {
      return new Response("Too Many Requests", { status: 429 });
    }

    if (!env.CONTRACT_ADDRESS) {
      return new Response("Resolver not configured", { status: 500 });
    }

    try {
      const mocked = readMockRecord(env, tokenIdRaw);
      if (mocked) {
        if (!isValidTargetByType(mocked.targetType, mocked.target)) {
          return new Response("Stored target is invalid", { status: 400 });
        }

        const destination = toDestinationUrl(mocked.targetType, mocked.target);
        const autoRedirect = url.searchParams.get("redirect") !== "0";

        return renderHtml({
          tokenId: tokenIdRaw,
          destination,
          targetType: mocked.targetType,
          target: mocked.target,
          txHash: mocked.txHash,
          autoRedirect,
        });
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
        return new Response("Stored target is invalid", { status: 400 });
      }

      const txHash = await getLastUpdateTx(
        client,
        env.CONTRACT_ADDRESS as `0x${string}`,
        tokenId,
      );

      const destination = toDestinationUrl(targetType, target);
      const autoRedirect = url.searchParams.get("redirect") !== "0";

      return renderHtml({
        tokenId: tokenIdRaw,
        destination,
        targetType,
        target,
        txHash,
        autoRedirect,
      });
    } catch (error) {
      return new Response(
        `Resolver error: ${error instanceof Error ? error.message : "unknown"}`,
        { status: 500 },
      );
    }
  },
};
