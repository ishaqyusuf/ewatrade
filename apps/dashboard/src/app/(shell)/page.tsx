import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"

function startOfToday() {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  return value
}

function startOfMonth() {
  const value = new Date()
  value.setDate(1)
  value.setHours(0, 0, 0, 0)
  return value
}

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(value / 100)
}

export default async function DashboardHomePage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null

  const store = ctx?.activeStore
  const tenant = ctx?.tenant
  const summary =
    store && tenant
      ? await Promise.all([
          prisma.commercialOrder.aggregate({
            where: { createdAt: { gte: startOfToday() }, storeId: store.id },
            _sum: { totalMinor: true },
          }),
          prisma.commercialOrder.count({
            where: { createdAt: { gte: startOfMonth() }, storeId: store.id },
          }),
          prisma.catalogItem.count({
            where: { status: "ACTIVE", tenantId: tenant.id },
          }),
          prisma.stockBalanceSource.count({
            where: { storeId: store.id },
          }),
          prisma.commercialOrder.findMany({
            orderBy: { createdAt: "desc" },
            select: {
              createdAt: true,
              currencyCode: true,
              customerName: true,
              orderNumber: true,
              status: true,
              totalMinor: true,
            },
            take: 5,
            where: { storeId: store.id },
          }),
        ])
      : null
  const [
    revenueToday,
    ordersThisMonth,
    catalogItems,
    stockBalances,
    recentOrders,
  ] = summary ?? [{ _sum: { totalMinor: null } }, 0, 0, 0, []]
  const metrics = [
    {
      label: "Revenue today",
      value: store
        ? money(revenueToday._sum.totalMinor ?? 0, store.currencyCode)
        : "—",
      sub: "Confirmed order value",
    },
    {
      label: "Orders",
      value: ordersThisMonth.toLocaleString(),
      sub: "This month",
    },
    {
      label: "Catalog items",
      value: catalogItems.toLocaleString(),
      sub: "Active products and services",
    },
    {
      label: "Stock balances",
      value: stockBalances.toLocaleString(),
      sub: "Physical balance sources",
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {store && tenant
            ? `${tenant.name} · ${store.name}`
            : "Your business at a glance"}
        </p>
      </div>

      <dl className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-background p-5">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {metric.label}
            </dt>
            <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
              {metric.value}
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">{metric.sub}</p>
          </div>
        ))}
      </dl>

      <div className="flex flex-1 flex-col gap-3">
        <h2 className="text-sm font-semibold">Recent orders</h2>
        {recentOrders.length > 0 ? (
          <div className="border-y border-border bg-background">
            {recentOrders.map((order) => (
              <div
                key={order.orderNumber}
                className="grid gap-2 border-b border-border px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {order.customerName || "Walk-in customer"} ·{" "}
                    {order.createdAt.toLocaleString("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {order.status.toLowerCase().replaceAll("_", " ")}
                </p>
                <p className="font-semibold tabular-nums">
                  {money(order.totalMinor, order.currencyCode)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center border-y border-border bg-background p-10 text-sm text-muted-foreground">
            Orders you create or receive will appear here.
          </div>
        )}
      </div>
    </div>
  )
}
