import { EventsProvider } from "@ewatrade/events/client"
import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import { cn } from "@/utils"
import {
  assertQaAcceleratorStartupSafety,
  isQaAcceleratorClientMode,
} from "@ewatrade/utils/qa-accelerator"
import { Geist } from "next/font/google"
import { Providers } from "./providers"

assertQaAcceleratorStartupSafety(process.env)

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
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
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="bg-background">
        <Providers qaAcceleratorEnabled={qaAcceleratorEnabled}>
          <EventsProvider surface="dashboard">{children}</EventsProvider>
        </Providers>
      </body>
    </html>
  )
}
