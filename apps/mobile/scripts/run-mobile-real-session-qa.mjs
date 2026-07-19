import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { createTRPCProxyClient, httpLink } from "@trpc/client"
import superjson from "superjson"

const DEFAULT_API_URL = "http://127.0.0.1:3095"
const DEFAULT_DEEP_LINK_BASE = "ewatrade-dev://qa-session"
const DEFAULT_EVIDENCE_PATH = resolve(
  new URL("../../..", import.meta.url).pathname,
  ".scratch/qa/mobile-five-business-real-session.json",
)

const BUSINESS_MODELS = [
  {
    id: "bulk-packaged-goods",
    businessName: "Kora Bulk Goods",
    next: "/reports-modal",
    seed: seedBulkPackagedGoods,
  },
  {
    id: "fashion-apparel",
    businessName: "Aso Lane Apparel",
    next: "/catalog-items-modal",
    seed: seedFashionApparel,
  },
  {
    id: "garment-care-services",
    businessName: "FreshFold Garment Care",
    next: "/service-jobs-modal",
    seed: seedGarmentCareServices,
  },
  {
    id: "electronics-mixed",
    businessName: "CircuitCare Electronics",
    next: "/dashboard",
    seed: seedElectronicsMixed,
  },
  {
    id: "professional-services",
    businessName: "Northstar Advisory",
    next: "/service-jobs-modal",
    seed: seedProfessionalServices,
  },
]

function requireConfirmation() {
  if (process.env.MOBILE_REAL_SESSION_CONFIRM === "1") return
  console.error(
    "Set MOBILE_REAL_SESSION_CONFIRM=1 to create five disposable local QA businesses.",
  )
  process.exit(1)
}

function runId() {
  return new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)
}

function operationId(prefix, id) {
  return `${prefix}-${id}-${crypto.randomUUID()}`
}

function createClient({ apiUrl, token }) {
  return createTRPCProxyClient({
    links: [
      httpLink({
        headers: () => ({
          ...(token
            ? { "x-app-authorization": `Bearer ${token}` }
            : undefined),
          "x-trpc-source": "mobile-five-business-real-session-qa",
        }),
        transformer: superjson,
        url: `${apiUrl}/api/trpc`,
      }),
    ],
  })
}

async function createBusinessSession(publicClient, model, id, modelIndex) {
  const input = {
    addressLine1: "12 QA Operations Way",
    businessName: `${model.businessName} ${id}`,
    city: "Lagos",
    currencyCode: "NGN",
    email: `mobile-${model.id}-${id}@test.com`,
    mode: "sign_up",
    name: `${model.businessName} Owner`,
    phone: `+234${Date.now()}${modelIndex + 1}`,
  }
  const otp = await publicClient.auth.requestMobileOwnerOtp.mutate(input)
  if (!otp.devCode) {
    throw new Error(
      "The local API did not return an OTP devCode. Never run this harness against production.",
    )
  }
  return publicClient.auth.verifyMobileOwnerOtp.mutate({
    ...input,
    code: otp.devCode,
  })
}

function offering(item, predicate = () => true) {
  const found = item.variants
    .flatMap((variant) =>
      variant.offerings.map((candidate) => ({ candidate, variant })),
    )
    .find(({ candidate, variant }) => predicate(candidate, variant))
  if (!found) throw new Error(`No matching Offering exists for ${item.name}.`)
  return found.candidate
}

function unit(item, key) {
  const found = item.product?.currentUnitConfiguration?.units.find(
    (candidate) => candidate.key === key,
  )
  if (!found) throw new Error(`No ${key} Inventory Unit exists for ${item.name}.`)
  return found
}

async function createAdvancedProduct(client, input) {
  return client.catalog.createItem.mutate({
    clientOperationId: operationId("catalog", input.key),
    kind: "product",
    name: input.name,
    openingStockQuantity: input.openingStockQuantity,
    optionGroups: input.optionGroups,
    unitConfiguration: input.unitConfiguration,
    variants: input.variants,
  })
}

async function createAdvancedService(client, input) {
  return client.catalog.createItem.mutate({
    category: input.category,
    clientOperationId: operationId("catalog", input.key),
    description: input.description,
    kind: "service",
    name: input.name,
    optionGroups: input.optionGroups,
    variants: input.variants,
  })
}

function fixedServiceOffering(key, name, priceMinor, overrides = {}) {
  return {
    authorizationPolicy: "on_order_confirmation",
    fixedPriceMinor: priceMinor,
    key,
    name,
    pricingPolicy: "fixed",
    quantityScale: 0,
    workPolicy: "tracked",
    ...overrides,
  }
}

async function seedBulkPackagedGoods(client, id) {
  const item = await createAdvancedProduct(client, {
    key: "bulk",
    name: "Premium Grower Mix",
    unitConfiguration: {
      canonicalBalanceScale: 3,
      units: [
        {
          factor: "1",
          key: "kilogram",
          name: "Kilogram",
          stockBehavior: "canonical_shared",
          symbol: "kg",
          transactionScale: 3,
        },
        {
          factor: "25",
          key: "full-package",
          name: "Full package",
          stockBehavior: "packaged_stock",
          transactionScale: 0,
        },
        {
          factor: "12.5",
          key: "half-package",
          name: "Half package",
          stockBehavior: "packaged_stock",
          transactionScale: 0,
        },
        {
          factor: "6.25",
          key: "quarter-package",
          name: "Quarter package",
          stockBehavior: "packaged_stock",
          transactionScale: 0,
        },
      ],
    },
    variants: [
      {
        isDefault: true,
        key: "default",
        name: "Premium Grower Mix",
        offerings: [
          {
            fixedPriceMinor: 38_000,
            inventoryUnitKey: "full-package",
            key: "full-package",
            name: "Full package",
            pricingPolicy: "fixed",
          },
          {
            fixedPriceMinor: 19_500,
            inventoryUnitKey: "half-package",
            key: "half-package",
            name: "Half package",
            pricingPolicy: "fixed",
          },
          {
            fixedPriceMinor: 10_000,
            inventoryUnitKey: "quarter-package",
            key: "quarter-package",
            name: "Quarter package",
            pricingPolicy: "fixed",
          },
          {
            fixedPriceMinor: 1_700,
            inventoryUnitKey: "kilogram",
            key: "kilogram",
            name: "Kilogram",
            pricingPolicy: "fixed",
          },
        ],
      },
    ],
  })
  const fullOffering = offering(item, (candidate) => candidate.key === "full-package")
  const halfOffering = offering(item, (candidate) => candidate.key === "half-package")
  const fullAvailability = await client.inventory.offeringAvailability.query({
    offeringId: fullOffering.id,
  })
  await client.inventory.postBalanceOperation.mutate({
    balanceSourceId: fullAvailability.balanceSourceId,
    clientOperationId: operationId("receipt", id),
    direction: "increase",
    enteredInventoryUnitId: fullAvailability.enteredInventoryUnitId,
    enteredQuantity: "1000",
    expectedBalanceRevision: fullAvailability.revision,
    expectedConfigurationVersionId: fullAvailability.configurationVersionId,
    reason: "Opening receipt of 1000 full packages",
    schemaVersion: 1,
    source: "five_business_qa",
    type: "receipt",
  })
  const source = await client.inventory.offeringAvailability.query({
    offeringId: fullOffering.id,
  })
  const target = await client.inventory.offeringAvailability.query({
    offeringId: halfOffering.id,
  })
  await client.inventory.transformPackagedStock.mutate({
    clientOperationId: operationId("transform", id),
    expectedConfigurationVersionId: source.configurationVersionId,
    reason: "Repackage 50 full packages into 100 half packages",
    schemaVersion: 1,
    source: "five_business_qa",
    sourceBalanceRevision: source.revision,
    sourceBalanceSourceId: source.balanceSourceId,
    sourceQuantity: "50",
    targetBalanceRevision: target.revision,
    targetBalanceSourceId: target.balanceSourceId,
    targetQuantity: "100",
  })
  const report = await client.inventory.balanceReport.query({
    includeCompatibleTotals: true,
  })
  const rows = report.rows.filter((row) => row.productId === item.product?.id)
  return {
    assertion: {
      fullPackages: rows.find((row) => row.inventoryUnitName === "Full package")
        ?.onHandQuantity,
      halfPackages: rows.find((row) => row.inventoryUnitName === "Half package")
        ?.onHandQuantity,
    },
    catalogItemId: item.id,
    units: item.product?.currentUnitConfiguration?.units.map((entry) => ({
      factor: entry.factor,
      name: entry.name,
      stockBehavior: entry.stockBehavior,
    })),
  }
}

async function seedFashionApparel(client) {
  const sizes = [
    ["sm", "Small", 18_000],
    ["md", "Medium", 19_000],
    ["lg", "Large", 20_000],
  ]
  const item = await createAdvancedProduct(client, {
    key: "apparel",
    name: "Classic Linen Shirt",
    openingStockQuantity: "24",
    optionGroups: [
      {
        key: "size",
        name: "Size",
        values: sizes.map(([key, label]) => ({ key, label })),
      },
    ],
    unitConfiguration: {
      canonicalBalanceScale: 0,
      units: [
        {
          factor: "1",
          key: "piece",
          name: "Piece",
          stockBehavior: "canonical_shared",
          symbol: "pc",
          transactionScale: 0,
        },
      ],
    },
    variants: sizes.map(([key, label, priceMinor], index) => ({
      isDefault: index === 0,
      key,
      name: `Classic Linen Shirt · ${label}`,
      offerings: [
        {
          barcode: `QA-SHIRT-${String(key).toUpperCase()}`,
          fixedPriceMinor: Number(priceMinor),
          inventoryUnitKey: "piece",
          key: `piece-${key}`,
          name: `${label} shirt`,
          pricingPolicy: "fixed",
          sku: `SHIRT-${String(key).toUpperCase()}`,
        },
      ],
      selections: [{ groupKey: "size", valueKey: String(key) }],
    })),
  })
  const smallOffering = offering(
    item,
    (candidate) => candidate.key === "piece-sm",
  )
  const availability = await client.inventory.offeringAvailability.query({
    offeringId: smallOffering.id,
  })
  const order = await client.orders.create.mutate({
    clientOrderId: operationId("order", "apparel"),
    customerName: "Ada Apparel Customer",
    lines: [
      {
        expectedBalanceRevision: availability.revision,
        expectedConfigurationVersionId: availability.configurationVersionId,
        expectedFixedPriceMinor: 18_000,
        offeringId: smallOffering.id,
        quantity: "2",
      },
    ],
    schemaVersion: 1,
  })
  return {
    catalogItemId: item.id,
    orderId: order.id,
    variantCount: item.variants.length,
  }
}

async function seedGarmentCareServices(client, id) {
  const definitions = [
    ["agbada", "Agbada", 40_000, 70_000],
    ["shirt", "Shirt", 20_000, 30_000],
    ["trouser", "Trouser", 20_000, 20_000],
    ["suit", "Suit", 70_000, 90_000],
  ]
  const items = []
  for (const [key, name, smallPrice, largePrice] of definitions) {
    items.push(
      await createAdvancedService(client, {
        category: "Garment care",
        key,
        name,
        optionGroups: [
          {
            key: "size",
            name: "Size",
            values: [
              { key: "sm", label: "SM" },
              { key: "lg", label: "L" },
            ],
          },
        ],
        variants: [
          {
            isDefault: true,
            key: "sm",
            name: `${name} · SM`,
            offerings: [
              fixedServiceOffering("sm", `${name} · SM`, Number(smallPrice)),
            ],
            selections: [{ groupKey: "size", valueKey: "sm" }],
          },
          {
            isDefault: false,
            key: "lg",
            name: `${name} · L`,
            offerings: [
              fixedServiceOffering("lg", `${name} · L`, Number(largePrice)),
            ],
            selections: [{ groupKey: "size", valueKey: "lg" }],
          },
        ],
      }),
    )
  }
  const intake = await client.services.createAndConfirmIntake.mutate({
    clientIntakeId: operationId("intake", id),
    conditionNote: "Photo and video package captured at intake.",
    customerName: "Amaka Dry Cleaning Customer",
    customerPhone: "+2348098765432",
    dueCommitmentAt: new Date(Date.now() + 2 * 86_400_000),
    instructions: "Use mild detergent and package each garment separately.",
    lines: [
      {
        expectedFixedPriceMinor: 70_000,
        offeringId: offering(items[0], (candidate) => candidate.key === "lg").id,
        quantity: "1",
      },
      {
        expectedFixedPriceMinor: 20_000,
        offeringId: offering(items[2], (candidate) => candidate.key === "sm").id,
        quantity: "2",
      },
    ],
    priority: "normal",
    schemaVersion: 1,
  })
  const job = intake.jobs[0]
  const evidence = job
    ? await client.services.captureEvidence.mutate({
        assetReference: `local://five-business/${id}/garment-intake.jpg`,
        clientEvidenceId: operationId("evidence", id),
        jobId: job.id,
        label: "Intake condition",
        mediaType: "photo",
        purpose: "intake_condition",
        uploadStatus: "local",
      })
    : null
  return {
    catalogItemIds: items.map((item) => item.id),
    evidenceId: evidence?.id ?? null,
    jobIds: intake.jobs.map((entry) => entry.id),
    orderId: intake.orderId,
  }
}

async function seedElectronicsMixed(client) {
  const accessory = await client.catalog.createSimpleItem.mutate({
    canonicalUnitName: "Piece",
    clientOperationId: operationId("catalog", "cable"),
    kind: "product",
    name: "USB-C Cable",
    openingStockQuantity: "30",
    priceMinor: 8_500,
  })
  const repair = await createAdvancedService(client, {
    category: "Device repair",
    key: "repair",
    name: "Phone Diagnostic and Repair",
    variants: [
      {
        isDefault: true,
        key: "standard",
        name: "Standard repair",
        offerings: [
          fixedServiceOffering("standard", "Standard repair", 25_000, {
            authorizationPolicy: "manual_release",
            guidance: "Diagnose first. Obtain approval before replacement work.",
          }),
        ],
      },
    ],
  })
  const accessoryOffering = offering(accessory)
  const repairOffering = offering(repair)
  const accessoryAvailability =
    await client.inventory.offeringAvailability.query({
      offeringId: accessoryOffering.id,
    })
  const order = await client.orders.create.mutate({
    clientOrderId: operationId("order", "electronics"),
    customerName: "Tunde Device Customer",
    customerPhone: "+2348080000100",
    lines: [
      {
        expectedBalanceRevision: accessoryAvailability.revision,
        expectedConfigurationVersionId:
          accessoryAvailability.configurationVersionId,
        expectedFixedPriceMinor: accessoryOffering.fixedPriceMinor,
        offeringId: accessoryOffering.id,
        quantity: "1",
      },
      {
        expectedFixedPriceMinor: repairOffering.fixedPriceMinor,
        offeringId: repairOffering.id,
        quantity: "1",
      },
    ],
    notes: "Mixed accessory sale and tracked repair.",
    schemaVersion: 1,
  })
  return {
    orderId: order.id,
    productItemId: accessory.id,
    serviceItemId: repair.id,
  }
}

async function seedProfessionalServices(client, id) {
  const consultation = await client.catalog.createSimpleItem.mutate({
    authorizationPolicy: "on_order_confirmation",
    clientOperationId: operationId("catalog", "consultation"),
    kind: "service",
    name: "Strategy Consultation",
    priceMinor: 75_000,
    quantityScale: 0,
    workPolicy: "charge_only",
  })
  const project = await createAdvancedService(client, {
    category: "Advisory",
    description: "A scoped engagement priced after customer requirements.",
    key: "advisory-project",
    name: "Advisory Project",
    variants: [
      {
        isDefault: true,
        key: "custom",
        name: "Custom project",
        offerings: [
          {
            authorizationPolicy: "manual_release",
            guidance: "Start only after the customer accepts the quote.",
            key: "custom",
            name: "Custom project",
            pricingPolicy: "quote_required",
            quantityScale: 0,
            workPolicy: "tracked",
          },
        ],
      },
    ],
  })
  const consultationOffering = offering(consultation)
  const projectOffering = offering(project)
  const requestForm = await client.serviceAccess.createRequestForm.mutate({
    label: "Advisory request",
    offeringIds: [consultationOffering.id, projectOffering.id],
  })
  const publicClient = createClient({
    apiUrl:
      process.env.MOBILE_REAL_SESSION_API_URL ||
      process.env.EXPO_PUBLIC_API_URL ||
      DEFAULT_API_URL,
  })
  const request = await publicClient.serviceAccess.submitRequest.mutate({
    clientRequestId: operationId("request", id),
    customerEmail: "customer.advisory@test.com",
    customerName: "Ife Advisory Customer",
    details: "Review operations and recommend a 90-day implementation plan.",
    formToken: requestForm.token,
    lines: [
      {
        details: "One scoped advisory engagement.",
        offeringId: projectOffering.id,
        quantity: "1",
      },
    ],
  })
  const quote = await client.serviceAccess.issueQuote.mutate({
    clientQuoteId: operationId("quote", id),
    clientVersionId: operationId("quote-version", id),
    lines: [
      {
        offeringId: projectOffering.id,
        quantity: "1",
        unitPriceMinor: 450_000,
      },
    ],
    requestId: request.id,
  })
  const publicQuote = await publicClient.serviceAccess.quote.query({
    acceptanceToken: quote.token,
  })
  const acceptance = await publicClient.serviceAccess.acceptQuote.mutate({
    acceptanceToken: quote.token,
    clientAcceptanceId: operationId("acceptance", id),
  })
  return {
    acceptedQuoteId: quote.quoteId,
    acceptedOrderId: acceptance.orderId,
    jobId: acceptance.jobId,
    publicQuoteTotalMinor: publicQuote.totalMinor,
    requestFormToken: requestForm.token,
    requestId: request.id,
  }
}

function toImportLink(session, next, deepLinkBase) {
  const payload = {
    expiresAt:
      session.expiresAt instanceof Date
        ? session.expiresAt.toISOString()
        : session.expiresAt,
    next,
    profile: session.profile,
    token: session.token,
  }
  return `${deepLinkBase}/${encodeURIComponent(JSON.stringify(payload))}`
}

function redactSession(session) {
  return {
    expiresAt:
      session.expiresAt instanceof Date
        ? session.expiresAt.toISOString()
        : session.expiresAt,
    profile: session.profile,
    tokenPrefix: session.token.slice(0, 8),
  }
}

function writeEvidence(path, evidence) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        ...evidence,
        businesses: evidence.businesses.map((business) => ({
          ...business,
          importLink: "[written to the adjacent links file]",
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  writeFileSync(
    `${path}.links`,
    `${evidence.businesses
      .map((business) => `${business.modelId}\t${business.importLink}`)
      .join("\n")}\n`,
    "utf8",
  )
}

function openOnAndroid(importLink) {
  if (process.env.MOBILE_REAL_SESSION_OPEN !== "1") return false
  const adb =
    process.env.ADB_PATH ||
    "/Users/M1PRO/Library/Android/sdk/platform-tools/adb"
  const result = spawnSync(
    adb,
    [
      "shell",
      "am",
      "start",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      importLink,
    ],
    { encoding: "utf8" },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to open the mobile QA import link.")
  }
  return true
}

async function main() {
  requireConfirmation()
  const id = runId()
  const apiUrl = (
    process.env.MOBILE_REAL_SESSION_API_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    DEFAULT_API_URL
  ).replace(/\/$/, "")
  const deepLinkBase =
    process.env.MOBILE_REAL_SESSION_DEEP_LINK_BASE || DEFAULT_DEEP_LINK_BASE
  const publicClient = createClient({ apiUrl })
  const businesses = []

  for (const [modelIndex, model] of BUSINESS_MODELS.entries()) {
    const session = await createBusinessSession(
      publicClient,
      model,
      id,
      modelIndex,
    )
    const client = createClient({ apiUrl, token: session.token })
    const seed = await model.seed(client, id)
    businesses.push({
      importLink: toImportLink(session, model.next, deepLinkBase),
      modelId: model.id,
      seed,
      session: redactSession(session),
    })
    console.log(`Seeded ${model.id}.`)
  }

  const evidence = {
    apiUrl,
    businesses,
    createdAt: new Date().toISOString(),
    runId: id,
  }
  const evidencePath =
    process.env.MOBILE_REAL_SESSION_EVIDENCE_PATH || DEFAULT_EVIDENCE_PATH
  writeEvidence(evidencePath, evidence)
  const requestedModel =
    process.env.MOBILE_REAL_SESSION_MODEL || BUSINESS_MODELS[0].id
  const selected =
    businesses.find((business) => business.modelId === requestedModel) ??
    businesses[0]
  const opened = openOnAndroid(selected.importLink)

  console.log(`Evidence=${evidencePath}`)
  console.log(
    opened
      ? `Opened ${selected.modelId} in the Android development build.`
      : "Set MOBILE_REAL_SESSION_OPEN=1 to import one seeded session into Android.",
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
