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
