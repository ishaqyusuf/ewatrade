import type { summarizeInventory } from "@/lib/inventory-view"

export function InventorySummary({
  summary,
}: { summary: ReturnType<typeof summarizeInventory> }) {
  const cards = [
    {
      label: "Products you can sell",
      value: summary.sellable,
      total: summary.products,
      detail: "Have stock that is not held for orders",
    },
    {
      label: "Running low",
      value: summary.low,
      detail:
        summary.low === 1
          ? "1 product is at or under its low-stock level"
          : `${summary.low} products are at or under their low-stock level`,
    },
    {
      label: "Held for orders",
      value: summary.held,
      detail:
        summary.held === 1
          ? "1 product has stock set aside"
          : `${summary.held} products have stock set aside`,
    },
    {
      label: "Out of stock",
      value: summary.out,
      detail:
        summary.out === 1
          ? "1 product has none to sell"
          : `${summary.out} products have none to sell`,
    },
  ]
  return (
    <section
      aria-label="Inventory summary"
      data-summary-grid
      className="grid grid-cols-1 divide-y divide-border border border-border sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0"
    >
      {cards.map((card) => (
        <div key={card.label} className="px-5 py-4">
          <p data-summary-label className="text-sm text-muted-foreground">
            {card.label}
          </p>
          <p
            data-summary-value
            className="my-2 text-3xl font-medium tabular-nums"
          >
            {card.value}
            {card.total !== undefined ? (
              <span className="ml-2 text-sm text-muted-foreground">
                of {card.total}
              </span>
            ) : null}
          </p>
          <p data-summary-detail className="text-sm text-muted-foreground">
            {card.detail}
          </p>
        </div>
      ))}
    </section>
  )
}
