import type { Metadata } from "next"

export const metadata: Metadata = {
  description:
    "This product link is unavailable. Ask the business for a new product link before placing an order.",
  title: "Product link unavailable | EwaTrade",
}

export default function SharedProductNotFound() {
  return (
    <main className="min-h-screen bg-background px-5 py-16 text-foreground">
      <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-6">
        <div className="space-y-3">
          <p className="font-medium text-muted-foreground text-sm">
            Shared product
          </p>
          <h1 className="font-semibold text-3xl tracking-normal">
            Product link unavailable
          </h1>
          <p className="text-base text-muted-foreground leading-7">
            This link may have been deactivated, expired, or moved. Ask the
            business for a new product link before placing an order.
          </p>
        </div>
      </section>
    </main>
  )
}
