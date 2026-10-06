import { DashboardEventsProvider } from "@/components/analytics/events-provider"
import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import "@/styles/dashboard.css"
import { cn } from "@/utils"
import {
  assertQaAcceleratorStartupSafety,
  isQaAcceleratorClientMode,
} from "@ewatrade/utils/qa-accelerator"
import { Hedvig_Letters_Sans, Hedvig_Letters_Serif } from "next/font/google"
import { Providers } from "./providers"

assertQaAcceleratorStartupSafety(process.env)

const hedvigSans = Hedvig_Letters_Sans({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hedvig-sans",
})

const hedvigSerif = Hedvig_Letters_Serif({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hedvig-serif",
})

export const metadata: Metadata = {
  title: "ewatrade Dashboard",
  description:
    "Tenant dashboard for operations, catalog, orders, and logistics management.",
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const qaAcceleratorEnabled =
    process.env.QA_ACCELERATOR_ENABLED === "true" &&
    isQaAcceleratorClientMode(process.env.APP_ENV ?? process.env.NODE_ENV)

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "ewatrade-dashboard",
        hedvigSans.variable,
        hedvigSerif.variable,
      )}
    >
      <body className="bg-background font-sans antialiased">
        <Providers qaAcceleratorEnabled={qaAcceleratorEnabled}>
          <DashboardEventsProvider>{children}</DashboardEventsProvider>
        </Providers>
      </body>
    </html>
  )
}
