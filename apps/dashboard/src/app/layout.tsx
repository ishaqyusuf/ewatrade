import { DashboardEventsProvider } from "@/components/analytics/events-provider"
import { getQaPolicyEnvironment } from "@ewatrade/utils/qa-policy-server"
import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import "@/styles/dashboard.css"
import { cn } from "@/utils"
import { isQaAcceleratorClientMode } from "@ewatrade/utils/qa-accelerator"
import { Figtree } from "next/font/google"
import { Providers } from "./providers"

const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-figtree",
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const qaAcceleratorEnabled =
    (await getQaPolicyEnvironment()).QA_ACCELERATOR_ENABLED === "true" &&
    isQaAcceleratorClientMode(process.env.APP_ENV ?? process.env.NODE_ENV)

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("ewatrade-dashboard", figtree.variable)}
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
