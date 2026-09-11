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
  title: "EwaTrade — The operating layer behind the shop",
  description:
    "Keep catalog, customers, orders, inventory, and service work on one commercial thread across every store and team.",
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
          <EventsProvider>{children}</EventsProvider>
        </Providers>
      </body>
    </html>
  )
}
