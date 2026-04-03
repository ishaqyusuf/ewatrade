import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"
import { NotificationsProvider } from "@ewatrade/notifications-react"
import { Geist } from "next/font/google"
import { cn } from "@/utils"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans"
})

export const metadata: Metadata = {
  title: "ewatrade Marketing",
  description: "Public marketing website for ewatrade."
}

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <NotificationsProvider>{children}</NotificationsProvider>
      </body>
    </html>
  )
}
