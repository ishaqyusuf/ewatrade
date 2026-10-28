"use client"

import { Button } from "@ewatrade/ui"

export default function StorefrontError({ reset }: { reset(): void }) {
  return (
    <section className="mx-auto max-w-3xl space-y-4 px-6 py-12" role="alert">
      <h1 className="text-2xl font-semibold">This page couldn’t load</h1>
      <p>Please try again. Your bag is still available.</p>
      <Button onClick={reset}>Try again</Button>
    </section>
  )
}
