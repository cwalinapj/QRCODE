import { MintCard } from "@/components/MintCard";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-black tracking-tight">QR Forever</h1>
        <p className="text-slate-600">
          Mint permanent QR records on Polygon with USDC. Immutable records never change. Updateable
          records keep the same QR while allowing owner-controlled destination updates.
        </p>
      </header>
      <MintCard />
    </main>
  );
}
