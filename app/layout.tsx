import type { Metadata } from "next";
import { Geist, Gilda_Display } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Siftag Pop-Up at Fabrica X: Vendor Hub",
  description:
    "Everything you need for the Siftag pop-up at Fabrica X, King's Cross, 25 to 27 September 2026.",
  robots: { index: false, follow: false },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

const gildaDisplay = Gilda_Display({
  variable: "--font-gilda",
  display: "swap",
  subsets: ["latin"],
  weight: ["400"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.className} ${gildaDisplay.variable} antialiased bg-white text-neutral-900`}
      >
        {children}
      </body>
    </html>
  );
}
