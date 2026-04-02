import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import { Geist } from "next/font/google"
import { cn } from "@/utils"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans"
})

export const metadata: Metadata = {
  title: "ewatrade Storefront",
  description: "Storefront application for merchant-branded customer experiences."
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
