import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import { cn } from "@/utils"
import { Geist } from "next/font/google"

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
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="bg-background">{children}</body>
    </html>
  )
}
