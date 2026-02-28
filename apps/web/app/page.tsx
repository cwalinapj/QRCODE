import { MintCard } from "@/components/MintCard";

const features = [
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
      </svg>
    ),
    title: "Immutable Forever",
    description: "Lock your QR destination forever (URL, wallet address, IPFS, or Arweave) with no future edits.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
    title: "Owner-Updateable",
    description: "Same QR code, new destination. Only you — the token owner — can change where it points.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
    title: "On-Chain Security",
    description: "Resolver validates every redirect against Polygon. USDC-only payments, no hidden fees.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-hero-gradient">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-brand-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-4 py-20 sm:py-28">
          {/* Brand heading */}
          <div className="mb-4 flex justify-center">
            <h1 className="text-lg font-black tracking-widest text-brand-300 uppercase">QR Forever</h1>
          </div>

          {/* Badge */}
          <div className="mb-6 flex justify-center">
            <span className="badge border border-brand-400/40 bg-brand-800/60 text-brand-300 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
              </span>
              Live on Polygon
            </span>
          </div>

          {/* Headline */}
          <p className="text-center text-4xl font-black tracking-tight text-white sm:text-6xl">
            QR Codes That Live{" "}
            <span className="bg-gradient-to-r from-brand-300 to-brand-400 bg-clip-text text-transparent">
              On-Chain Forever
            </span>
          </p>
          <p className="mx-auto mt-5 max-w-2xl text-center text-lg text-brand-200/80">
            Mint permanent QR records on Polygon with USDC. Choose immutable records that never change,
            or owner-updateable records that keep the same QR while you control the destination.
          </p>

          {/* Feature cards in hero */}
          <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="feature-card">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/30 text-brand-300">
                  {f.icon}
                </div>
                <h3 className="mb-1 text-sm font-bold text-white">{f.title}</h3>
                <p className="text-xs leading-relaxed text-brand-200/70">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mint section */}
      <section className="mx-auto max-w-2xl px-4 py-14">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Mint Your QR Record</h2>
          <p className="mt-2 text-sm text-slate-500">
            Connect your wallet, choose a mode, and pay in USDC to mint.
          </p>
        </div>
        <MintCard />
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-400">
        <p>
          QR Forever &mdash; built on{" "}
          <a
            href="https://polygon.technology"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted hover:text-brand-700"
          >
            Polygon
          </a>
          . USDC payments only.
        </p>
      </footer>
    </div>
  );
}
