// Local-only demo data for the Oversight Growth page (lifecycle marketing W4).
// Creates LIVE demo businesses `growth-demo-NNN` with 12 weeks of weekly
// snapshots, lifecycle ledger rows (with holdout) and See plans taps.
//
//   APP_ENV=local DEV_PROFILE=local node ../../scripts/with-workspace-env.mjs \
//     bun scripts/seed-growth-demo.ts            # seed (replaces earlier demo rows)
//   ... bun scripts/seed-growth-demo.ts --clean  # remove every demo row
import { prisma } from "../src/client"

if (process.env.APP_ENV !== "local" || process.env.DEV_PROFILE !== "local")
  throw new Error(
    "Growth demo data is local-only (APP_ENV=local DEV_PROFILE=local).",
  )

const PREFIX = "growth-demo-"
const OWNER_EMAIL = "growth-demo-owner@example.test"
const BUSINESSES = 160
const DAY_MS = 86_400_000

async function clean() {
  const tenants = await prisma.tenant.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true },
  })
  await prisma.tenant.deleteMany({
    where: { id: { in: tenants.map((t) => t.id) } },
  })
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } })
  return tenants.length
}

// Small deterministic PRNG so the demo looks the same on every run.
let state = 20261112
function rand() {
  state = (state * 1103515245 + 12345) % 2147483648
  return state / 2147483648
}
const pick = <T>(items: readonly T[]) =>
  items[Math.floor(rand() * items.length)] as T

async function seed() {
  const removed = await clean()
  const today = new Date(new Date().toISOString().slice(0, 10))
  const owner = await prisma.user.create({
    data: {
      email: OWNER_EMAIL,
      emailVerified: true,
      name: "Growth Demo Owner",
    },
  })
  const names = [
    "Mama",
    "Bola",
    "Chidi",
    "Ade",
    "Kemi",
    "Tunde",
    "Ngozi",
    "Ifeoma",
  ]
  const kinds = [
    "Provisions",
    "Pharmacy",
    "Fabrics",
    "Phones",
    "Bakery",
    "Salon",
  ]
  const snapshots: Parameters<
    typeof prisma.businessGrowthSnapshot.createMany
  >[0]["data"] = []
  const messages: Parameters<
    typeof prisma.lifecycleMessage.createMany
  >[0]["data"] = []
  const intents: Parameters<
    typeof prisma.growthFeatureIntent.createMany
  >[0]["data"] = []
  for (let i = 0; i < BUSINESSES; i++) {
    const ageDays = Math.floor(rand() * 180) + 3
    const createdAt = new Date(
      today.getTime() - ageDays * DAY_MS + 9 * 3600_000,
    )
    const id = `${PREFIX}${String(i).padStart(3, "0")}`
    await prisma.tenant.create({
      data: {
        id,
        slug: id,
        name: `${pick(names)} ${pick(kinds)} ${i + 1}`,
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        createdAt,
      },
    })
    const engaged = rand() // business "energy"
    const plan = engaged > 0.85 ? pick(["starter", "growth"]) : "free"
    for (let week = 12; week >= 0; week--) {
      const day = new Date(today.getTime() - week * 7 * DAY_MS)
      // Snapshot days on or after signup only; plus each signup's first week.
      if (day < new Date(createdAt.toISOString().slice(0, 10))) continue
      const age = Math.floor((day.getTime() - createdAt.getTime()) / DAY_MS)
      const momentum = engaged * Math.min(1, age / 30) * (0.8 + rand() * 0.4)
      const ordersLast7 = momentum > 0.25 ? Math.round(momentum * 30) : 0
      const products = Math.min(1.05, momentum * 1.1 + rand() * 0.1)
      const stage =
        plan !== "free"
          ? "paying"
          : age < 7 && ordersLast7 === 0
            ? "signed_up"
            : ordersLast7 === 0
              ? age > 45
                ? "dormant"
                : "at_risk"
              : products >= 0.8 || ordersLast7 > 20
                ? "expanding"
                : ordersLast7 > 8
                  ? "habit"
                  : "activated"
      snapshots.push({
        tenantId: id,
        day,
        stage,
        planId: plan,
        businessCreatedAt: createdAt,
        activeDays28: Math.min(28, Math.round(momentum * 28)),
        ordersLast7,
        ordersThisMonth: ordersLast7 * 4,
        ordersTotal: ordersLast7 * (age / 7 + 1),
        salesMinorThisMonth: BigInt(
          ordersLast7 * 4 * Math.round(4_500 + rand() * 9_000) * 100,
        ),
        currencyCode: "NGN",
        catalogItems: Math.round(products * 50),
        staffCount: momentum > 0.5 ? Math.round(rand() * 3) : 0,
        businessesOwned: momentum > 0.8 && rand() > 0.6 ? 2 : 1,
        moneyAccounts: momentum > 0.4 ? 1 + Math.round(rand() * 2) : 1,
        storefrontPublished: momentum > 0.45 && rand() > 0.4,
        customDomain: momentum > 0.8 && rand() > 0.7,
        whatsappLinked: momentum > 0.35 && rand() > 0.3,
        telegramLinked: rand() > 0.85,
        waRepliesUsed: null,
        waRepliesCap: null,
        limitPressure:
          plan === "free"
            ? {
                products: Math.round(products * 100) / 100,
                staff: Math.min(1, Math.round(rand() * momentum * 100) / 100),
              }
            : {},
        lastActiveAt: ordersLast7 ? new Date(day.getTime() - DAY_MS) : null,
      })
    }
    // Ledger: P04 site setup to most; a 10% holdout; conversions favour treated.
    const sentAt = new Date(
      today.getTime() - (5 + Math.floor(rand() * 20)) * DAY_MS,
    )
    const holdout = rand() < 0.1
    messages.push({
      tenantId: id,
      userId: owner.id,
      playId: "P04_site_setup",
      periodKey: "once",
      variant: holdout ? "control" : "a",
      channel: "email",
      status: holdout ? "holdout" : "sent",
      sentAt: holdout ? null : sentAt,
      deliveredAt: holdout || rand() < 0.04 ? null : sentAt,
      clickedAt: !holdout && rand() < 0.18 ? sentAt : null,
      convertedAt: rand() < (holdout ? 0.12 : 0.22) ? sentAt : null,
      createdAt: sentAt,
    })
    if (rand() < 0.35)
      messages.push({
        tenantId: id,
        userId: owner.id,
        playId: "P06_money_accounts",
        periodKey: "once",
        variant: rand() < 0.1 ? "control" : "a",
        channel: "in_app",
        status: "sent",
        sentAt,
        clickedAt: rand() < 0.3 ? sentAt : null,
        convertedAt: rand() < 0.15 ? sentAt : null,
        createdAt: sentAt,
      })
    if (rand() < 0.25)
      intents.push({
        tenantId: id,
        feature: pick(["staff", "attachments", "payment_alerts", "products"]),
        month: today.toISOString().slice(0, 7),
        taps: 1 + Math.floor(rand() * 4),
      })
  }
  await prisma.businessGrowthSnapshot.createMany({ data: snapshots })
  await prisma.lifecycleMessage.createMany({ data: messages })
  await prisma.growthFeatureIntent.createMany({ data: intents })
  console.log(
    `Growth demo: removed ${removed}, seeded ${BUSINESSES} businesses, ${snapshots.length} snapshots, ${messages.length} messages, ${intents.length} intent rows.`,
  )
}

try {
  if (process.argv.includes("--clean"))
    console.log(`Growth demo: removed ${await clean()} businesses.`)
  else await seed()
} finally {
  await prisma.$disconnect()
}
