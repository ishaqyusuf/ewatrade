import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import { cn } from "@/utils"
import { NotificationsProvider } from "@ewatrade/notifications-react"
import { Fraunces, Geist } from "next/font/google"

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
  title: "ewatrade — Commerce, logistics, and merchant operations",
  description:
    "ewatrade combines branded storefronts, merchant operations, dispatch coordination, POS workflows, and customer messaging into one multi-tenant platform.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable, fraunces.variable)}
    >
      <body>
        <NotificationsProvider>{children}</NotificationsProvider>
      </body>
    </html>
  )
}
