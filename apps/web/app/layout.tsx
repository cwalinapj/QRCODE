import "./globals.css";
import type { Metadata } from "next";

import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "QR Forever",
  description: "Mint immutable or owner-updateable QR records on Polygon"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
