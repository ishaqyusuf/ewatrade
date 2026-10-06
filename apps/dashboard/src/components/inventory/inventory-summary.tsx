import type { summarizeInventory } from "@/lib/inventory-view"

export function InventorySummary({
  summary,
}: { summary: ReturnType<typeof summarizeInventory> }) {
  const cards = [
    {
      label: "Products with stock",
      value: summary.stocked,
      total: summary.products,
      detail: `Across ${summary.balances} physical balance${summary.balances === 1 ? "" : "s"}`,
    },
    {
      label: "With reservations",
      value: summary.reserved,
      detail: "Balances committed to orders",
    },
    {
      label: "Out of stock",
      value: summary.out,
      detail: "No quantity available",
    },
  ]
  return (
    <section
      aria-label="Inventory summary"
      data-summary-grid
      className="grid grid-cols-1 divide-y divide-border border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0"
    >
      {cards.map((card) => (
        <div key={card.label} className="px-5 py-4">
          <p data-summary-label className="text-xs text-muted-foreground">
            {card.label}
          </p>
          <p
            data-summary-value
            className="my-2 text-3xl font-medium tabular-nums"
          >
            {card.value}
            {card.total !== undefined ? (
              <span className="ml-2 text-sm text-muted-foreground">
                / {card.total}
              </span>
            ) : null}
          </p>
          <p data-summary-detail className="text-xs text-muted-foreground">
            {card.detail}
          </p>
        </div>
      ))}
    </section>
  )
}
