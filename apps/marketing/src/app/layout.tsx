import { EventsProvider } from "@ewatrade/events/client"
import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import { cn } from "@/utils"
import {
  assertQaAcceleratorStartupSafety,
  isQaAcceleratorClientMode,
} from "@ewatrade/utils/qa-accelerator"
import { Fraunces, Geist } from "next/font/google"
import { Providers } from "./providers"

assertQaAcceleratorStartupSafety(process.env)

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK"],
})

export const metadata: Metadata = {
  title: "EwaTrade — Come. Trade. Together.",
  description:
    "The products you sell, the orders you take, and the work that follows. One connected place to keep your business moving.",
  metadataBase: new URL("https://ewatrade.com"),
  openGraph: {
    title: "EwaTrade — Come. Trade. Together.",
    description:
      "One connected place for the products you sell, the orders you take, and the work that follows.",
    images: [
      {
        url: "/brand/ewatrade-social-preview-v3.png",
        width: 1727,
        height: 910,
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
        url: "/brand/ewatrade-social-preview-v3.png",
        alt: "ẸwáTrade — Come. Trade. Together. Products. Orders. What’s next.",
      },
    ],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/brand/ewatrade-mark.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const qaAcceleratorEnabled =
    process.env.QA_ACCELERATOR_ENABLED === "true" &&
    isQaAcceleratorClientMode(process.env.APP_ENV ?? process.env.NODE_ENV)

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
