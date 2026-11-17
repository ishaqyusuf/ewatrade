import { EventsProvider } from "@ewatrade/events/client"
import {
  getQaPolicyEnvironment,
  qaPolicyTarget,
} from "@ewatrade/utils/qa-policy-server"
import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import { cn } from "@/utils"
import { isQaAcceleratorClientMode } from "@ewatrade/utils/qa-accelerator"
import { Fraunces, Geist } from "next/font/google"
import { connection } from "next/server"
import { Providers } from "./providers"

const geist = Geist({
  preload: false,
  subsets: ["latin"],
  variable: "--font-sans",
})

const fraunces = Fraunces({
  preload: false,
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK"],
})

export const metadata: Metadata = {
  title: "EwaTrade — Come. Trade. Together.",
  description:
    "The products you sell, the orders you take, and the work that follows. One connected place to keep your business moving.",
  // Canonical host: the apex 308-redirects here, and WhatsApp drops
  // og:image URLs that redirect.
  metadataBase: new URL("https://www.ewatrade.com"),
  openGraph: {
    title: "EwaTrade — Come. Trade. Together.",
    description:
      "One connected place for the products you sell, the orders you take, and the work that follows.",
    images: [
      {
        url: "/brand/ewatrade-social-preview-v4.png",
        width: 1200,
        height: 630,
        alt: "ẸwáTrade — Come. Trade. Together. Products. Orders. What’s next.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "EwaTrade — Come. Trade. Together.",
    description:
      "One connected place for the products you sell, the orders you take, and the work that follows.",
    images: [
      {
        url: "/brand/ewatrade-social-preview-v4.png",
        alt: "ẸwáTrade — Come. Trade. Together. Products. Orders. What’s next.",
      },
    ],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      {
        url: "/brand/ewatrade-mark-precision-rise-v1.svg",
        type: "image/svg+xml",
        sizes: "any",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/brand/ewatrade-mark-precision-rise-v1-reverse.svg",
        type: "image/svg+xml",
        sizes: "any",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: "/brand/ewatrade-mark-precision-rise-v1.png",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let qaAcceleratorEnabled = false
  if (
    qaPolicyTarget() &&
    isQaAcceleratorClientMode(process.env.APP_ENV ?? process.env.NODE_ENV)
  ) {
    // QA policy may change while a preview is running. Resolve it only for a
    // real request so the build never freezes QA state into the public shell.
    await connection()
    qaAcceleratorEnabled =
      (await getQaPolicyEnvironment()).QA_ACCELERATOR_ENABLED === "true"
  }

  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable, fraunces.variable)}
    >
      <body>
        <Providers qaAcceleratorEnabled={qaAcceleratorEnabled}>
          <EventsProvider surface="marketing">{children}</EventsProvider>
        </Providers>
      </body>
    </html>
  )
}
