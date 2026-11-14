import { DashboardEventsProvider } from "@/components/analytics/events-provider"
import { getQaPolicyEnvironment } from "@ewatrade/utils/qa-policy-server"
import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import "@/styles/dashboard.css"
import { cn } from "@/utils"
import { isQaAcceleratorClientMode } from "@ewatrade/utils/qa-accelerator"
import { Inter } from "next/font/google"
import localFont from "next/font/local"
import { Providers } from "./providers"

// Midnight Paper (ADR-0060): Inter for text and numbers, Cal Sans for titles.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

const calSans = localFont({
  src: "../../public/shop-v3/cal-sans.woff2",
  display: "swap",
  variable: "--font-cal-sans",
  weight: "600",
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
  const qaAcceleratorEnabled = isQaAcceleratorClientMode(
    process.env.APP_ENV ?? process.env.NODE_ENV,
  )
    ? getQaPolicyEnvironment()
        .then((env) => env.QA_ACCELERATOR_ENABLED === "true")
        .catch(() => false)
    : false

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("ewatrade-dashboard", inter.variable, calSans.variable)}
    >
      <body className="bg-background font-sans antialiased">
        <DashboardEventsProvider>
          <Providers qaAcceleratorEnabled={qaAcceleratorEnabled}>
            {children}
          </Providers>
        </DashboardEventsProvider>
      </body>
    </html>
  )
}
