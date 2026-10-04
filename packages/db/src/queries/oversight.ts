import type { DbClient } from "./types"
const live = { dataClassification: "LIVE" as const, qaPurgeStartedAt: null }
const accounts = {
  OR: [
    { memberships: { none: {} } },
    { memberships: { some: { tenant: live } } },
  ],
}
export async function oversightSummary(db: DbClient, days: number) {
  const to = new Date()
  const from = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - days + 1),
  )
  const [
    businesses,
    activeBusinesses,
    users,
    newUsers,
    orders,
    newBusinesses,
    usersInPeriod,
    ordersInPeriod,
  ] = await Promise.all([
    db.tenant.count({ where: live }),
    db.tenant.count({ where: { ...live, isActive: true } }),
    db.user.count({ where: accounts }),
    db.user.count({
      where: { ...accounts, createdAt: { gte: from, lte: to } },
    }),
    db.commercialOrder.count({
      where: { createdAt: { gte: from, lte: to }, tenant: live },
    }),
    db.tenant.count({ where: { ...live, createdAt: { gte: from, lte: to } } }),
    db.user.findMany({
      where: { ...accounts, createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
      take: 10001,
    }),
    db.commercialOrder.findMany({
      where: { createdAt: { gte: from, lte: to }, tenant: live },
      select: { createdAt: true },
      take: 10001,
    }),
  ])
  if (usersInPeriod.length > 10000 || ordersInPeriod.length > 10000)
    throw new Error("Oversight series exceeds supported volume")
  const buckets = new Map<
    string,
    { date: string; users: number; orders: number }
  >()
  for (let i = 0; i < days; i++) {
    const date = new Date(from.getTime() + i * 86400000)
      .toISOString()
      .slice(0, 10)
    buckets.set(date, { date, users: 0, orders: 0 })
  }
  for (const u of usersInPeriod) {
    const b = buckets.get(u.createdAt.toISOString().slice(0, 10))
    if (b) b.users++
  }
  for (const o of ordersInPeriod) {
    const b = buckets.get(o.createdAt.toISOString().slice(0, 10))
    if (b) b.orders++
  }
  return {
    version: 1,
    projectId: "ewatrade",
    asOf: to.toISOString(),
    period: { from: from.toISOString(), to: to.toISOString() },
    capabilities: { businessStatus: false, campaigns: false },
    totals: {
      businesses,
      activeBusinesses,
      users,
      newUsers,
      orders,
      newBusinesses,
    },
    series: [...buckets.values()],
  }
}
export async function oversightBusinesses(
  db: DbClient,
  search: string,
  cursor?: string,
) {
  const rows = await db.tenant.findMany({
    where: {
      ...live,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { slug: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { id: "asc" },
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { users: true, commercialOrders: true } },
    },
  })
  return {
    items: rows
      .slice(0, 50)
      .map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        type: t.type,
        status: t.isActive ? "active" : "suspended",
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        users: t._count.users,
        orders: t._count.commercialOrders,
      })),
    nextCursor: rows.length > 50 ? (rows[49]?.id ?? null) : null,
  }
}
export async function oversightUsers(
  db: DbClient,
  search: string,
  cursor?: string,
) {
  const rows = await db.user.findMany({
    where: {
      ...accounts,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { id: "asc" },
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      _count: { select: { memberships: { where: { tenant: live } } } },
    },
  })
  return {
    items: rows
      .slice(0, 50)
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt.toISOString(),
        businesses: u._count.memberships,
      })),
    nextCursor: rows.length > 50 ? (rows[49]?.id ?? null) : null,
  }
}
export async function oversightRecords(
  db: DbClient,
  search: string,
  cursor?: string,
) {
  const rows = await db.commercialOrder.findMany({
    where: {
      tenant: live,
      ...(search
        ? { orderNumber: { contains: search, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: { id: "asc" },
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      orderNumber: true,
      status: true,
      currencyCode: true,
      totalMinor: true,
      createdAt: true,
      tenant: { select: { name: true } },
    },
  })
  return {
    items: rows
      .slice(0, 50)
      .map((o) => ({
        id: o.id,
        number: o.orderNumber,
        business: o.tenant.name,
        status: o.status,
        currency: o.currencyCode,
        totalMinor: o.totalMinor,
        createdAt: o.createdAt.toISOString(),
      })),
    nextCursor: rows.length > 50 ? (rows[49]?.id ?? null) : null,
  }
}
