import type { Metadata } from "next"
import "@ewatrade/ui/globals.css"

export const metadata: Metadata = {
  title: "ewatrade",
  description: "Commerce, logistics, and self-service retail infrastructure."
}

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
