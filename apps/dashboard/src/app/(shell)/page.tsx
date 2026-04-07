import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"

export default async function DashboardHomePage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null

  const store = ctx?.activeStore
  const tenant = ctx?.tenant

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {store
            ? `${store.name} · ${tenant?.slug}.ewatrade.com`
            : "Your store at a glance"}
        </p>
      </div>

      {/* Summary cards — M6 Analytics (populated in later sprint) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Revenue today", value: "—", sub: "No orders yet" },
          { label: "Orders", value: "0", sub: "This month" },
          { label: "Products", value: "0", sub: "Active listings" },
          { label: "Low stock", value: "0", sub: "Items below reorder point" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-border/70 bg-background p-5 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {card.value}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Recent orders placeholder */}
      <div className="flex flex-1 flex-col gap-3">
        <h2 className="text-sm font-semibold">Recent orders</h2>
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background p-10 text-sm text-muted-foreground">
          Orders you receive will appear here.
        </div>
      </div>
    </div>
  )
}
