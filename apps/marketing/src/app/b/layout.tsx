import type { ReactNode } from "react"
import "./platform-catalog.css"

export default function PlatformCatalogLayout({
  children,
}: {
  children: ReactNode
}) {
  return <div className="pc">{children}</div>
}
