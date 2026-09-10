import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sperm Quality Lab",
  description: "Customer portal and lab platform for semen sample analysis"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
