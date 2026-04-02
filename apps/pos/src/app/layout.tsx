import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import { Geist } from "next/font/google"
import { cn } from "@/utils"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans"
})

export const metadata: Metadata = {
  title: "ewatrade POS",
  description: "Point-of-sale application for tenant cashier and in-store workflows."
}

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  )
}
