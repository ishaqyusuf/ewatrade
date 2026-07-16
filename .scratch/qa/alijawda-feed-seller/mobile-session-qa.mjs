import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { createTRPCProxyClient, httpLink } from "../../../apps/mobile/node_modules/@trpc/client/dist/index.mjs"
import superjson from "../../../apps/mobile/node_modules/superjson/dist/index.js"

const apiUrl = process.env.MOBILE_QA_API_URL ?? "http://127.0.0.1:3095"
const deepLinkBase =
  process.env.MOBILE_QA_DEEP_LINK_BASE ??
  "exp://192.168.18.7:3096/--/qa-session"
const outPath = resolve(
  process.cwd(),
  "../../.scratch/qa/alijawda-feed-seller/mobile-session-result.json",
)
const runId = `${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17)}${Math.floor(
  Math.random() * 100,
)
  .toString()
  .padStart(2, "0")}`
const email = `alijawda-mobile-${runId}@test.com`
const businessName = "Alijawda"
const ownerName = "Ali Jawda"

function createClient(token) {
  return createTRPCProxyClient({
    links: [
      httpLink({
        headers() {
          return token
            ? {
                "x-app-authorization": `Bearer ${token}`,
                "x-trpc-source": "alijawda-mobile-qa",
              }
            : { "x-trpc-source": "alijawda-mobile-qa" }
        },
        transformer: superjson,
        url: `${apiUrl}/api/trpc`,
      }),
    ],
  })
}

function toImportLink(session, next, qaSeed) {
  const payload = {
    businessId: session.profile.businessId,
    businessName: session.profile.businessName,
    email: session.profile.email,
    expiresAt:
      session.expiresAt instanceof Date
        ? session.expiresAt.toISOString()
        : session.expiresAt,
    name: session.profile.name,
    next,
    role: session.profile.role,
    status: session.profile.status,
    token: session.token,
    userId: session.profile.id,
    ...(qaSeed ?? {}),
  }

  return `${deepLinkBase}/${encodeURIComponent(JSON.stringify(payload))}`
}

async function createMobileSession() {
  const publicClient = createClient()
  const otp = await publicClient.auth.requestMobileOwnerOtp.mutate({
    businessName,
    email,
    mode: "sign_up",
    name: ownerName,
  })

  if (!otp.devCode) {
    throw new Error("Local API did not return devCode for mobile QA.")
  }

  return await publicClient.auth.verifyMobileOwnerOtp.mutate({
    businessName,
    code: otp.devCode,
    email,
    mode: "sign_up",
    name: ownerName,
  })
}

const session = await createMobileSession()
const client = createClient(session.token)

const products = []
for (const product of [
  {
    name: "Rabbit feed",
    priceMinor: 1800000,
    variants: [
      { conversionMultiplier: 0.5, name: "Half bag", priceMinor: 950000 },
      { conversionMultiplier: 0.25, name: "Quarter bag", priceMinor: 500000 },
      { conversionMultiplier: 0.025, name: "Kilo", priceMinor: 80000 },
    ],
  },
  {
    name: "Chicken feed",
    priceMinor: 2200000,
    variants: [
      { conversionMultiplier: 0.5, name: "Half bag", priceMinor: 1150000 },
      { conversionMultiplier: 0.25, name: "Quarter bag", priceMinor: 600000 },
      { conversionMultiplier: 0.025, name: "Kilo", priceMinor: 95000 },
    ],
  },
]) {
  products.push(
    await client.retailOps.createProduct.mutate({
      externalId: `alijawda-mobile-${runId}-${product.name
        .toLowerCase()
        .replace(/\s+/g, "-")}`,
      name: product.name,
      openingStockQuantity: 5,
      priceMinor: product.priceMinor,
      primaryUnitName: "Bag",
      unitTemplateKey: "bag_fractions",
      variants: product.variants.map((variant) => ({
        ...variant,
        openingStockQuantity: 5,
      })),
    }),
  )
}

const inventory = await client.retailOps.inventory.query({})
const sessionOpen = await client.retailOps.openSession.mutate({
  externalId: `alijawda-mobile-session-${runId}`,
  inventoryLines: inventory.map((item) => ({
    countedQuantity: item.onHandQuantity,
    productVariantId: item.unitId,
  })),
  notes: "Alijawda feed seller mobile screenshot QA.",
  openingFloatMinor: 0,
})

const evidence = {
  apiUrl,
  businessName,
  email,
  importLinks: {},
  inventory: inventory.map((item) => ({
    onHandQuantity: item.onHandQuantity,
    productName: item.productName,
    unitName: item.unitName,
  })),
  openSessionId: sessionOpen.id,
  products: products.map((product) => ({
    id: product.product.id,
    name: product.product.name,
    units: product.units.map((unit) => ({
      id: unit.id,
      isDefault: unit.isDefault,
      name: unit.name,
      openingStockQuantity: unit.openingStockQuantity,
      priceMinor: unit.priceMinor,
    })),
  })),
  runId,
}

const localProducts = evidence.products.map((product) => {
  const primaryUnit = product.units.find((unit) => unit.isDefault) ?? product.units[0]

  return {
    currentStock: primaryUnit?.openingStockQuantity ?? 0,
    name: product.name,
    price: primaryUnit?.priceMinor ?? 0,
    remoteId: product.id,
    remoteVariantId: primaryUnit?.id,
    startingStock: primaryUnit?.openingStockQuantity ?? 0,
    unitName: primaryUnit?.name ?? "Unit",
    variants: product.units
      .filter((unit) => !unit.isDefault)
      .map((unit) => ({
        currentStock: unit.openingStockQuantity,
        name: unit.name,
        price: unit.priceMinor,
        remoteId: unit.id,
        startingStock: unit.openingStockQuantity,
      })),
  }
})
const qaSeed = {
  localOpenSession: {
    remoteId: sessionOpen.id,
  },
  localProducts,
}

evidence.importLinks = {
  createSale: toImportLink(session, "/create-sale-modal", qaSeed),
  dashboard: toImportLink(session, "/admin-home", qaSeed),
  firstProductSetup: toImportLink(
    session,
    "/first-product-setup-modal",
    qaSeed,
  ),
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`)
console.log(JSON.stringify(evidence, null, 2))
