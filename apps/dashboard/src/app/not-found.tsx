import { AuthShell } from "@/components/auth/auth-shell"
import { Button } from "@ewatrade/ui"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Page not found — EwaTrade",
  robots: { index: false, follow: false },
}

/** Unknown addresses and old or mistyped links, inside or outside the shell. */
export default function NotFound() {
  return (
    <AuthShell
      title="Page not found"
      description="The link may be old or mistyped."
    >
      <Button className="w-full" render={<Link href="/" />}>
        Go to EwaTrade
      </Button>
    </AuthShell>
  )
}
