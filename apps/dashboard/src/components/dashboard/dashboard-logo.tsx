import { BrandMark } from "@ewatrade/ui"
import Link from "next/link"

export function DashboardLogo() {
  return (
    <Link
      href="/"
      aria-label="EwaTrade dashboard home"
      className="flex size-6 shrink-0 items-center justify-center rounded-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <BrandMark className="size-6" />
    </Link>
  )
}
