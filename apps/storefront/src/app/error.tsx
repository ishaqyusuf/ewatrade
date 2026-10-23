"use client"
import { Button } from "@ewatrade/ui"
import "@ewatrade/storefront-templates/catalog-v4/styles.css"
export default function StorefrontError({
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="sf-catalog sf-neutral">
      <p>ẸwáTrade</p>
      <h1>We couldn’t load this page</h1>
      <p>Something went wrong on our side. It’s usually temporary.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  )
}
