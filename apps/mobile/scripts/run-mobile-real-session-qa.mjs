import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { createTRPCProxyClient, httpLink } from "@trpc/client"
import superjson from "superjson"

const DEFAULT_API_URL = "http://127.0.0.1:3095"
const DEFAULT_DEEP_LINK_BASE = "exp://192.168.18.7:3096/--/qa-session"
const SERVICE_QA_ITEMS = [
  {
    premiumPriceMinor: 50_000,
    name: "Standard consultation",
    standardPriceMinor: 40_000,
  },
  {
    premiumPriceMinor: 70_000,
    name: "Document review",
    standardPriceMinor: 55_000,
  },
  {
    premiumPriceMinor: 40_000,
    name: "Installation visit",
    standardPriceMinor: 32_000,
  },
  {
    premiumPriceMinor: 60_000,
    name: "Maintenance package",
    standardPriceMinor: 48_000,
  },
]
const SERVICE_QA_JOBS = [
  {
    customer: {
      email: "aisha-bello@test.com",
      name: "Aisha Bello",
      phone: "+2348010000001",
    },
    dueOffsetDays: 0,
    express: true,
    notes: "Express intake paid upfront.",
    paymentStatus: "paid",
    quantity: 2,
    serviceName: "Standard consultation",
    statuses: ["in_progress", "ready"],
    variantName: "Premium",
  },
  {
    customer: {
      email: "tunde-adebayo@test.com",
      name: "Tunde Adebayo",
      phone: "+2348010000002",
    },
    dueOffsetDays: 1,
    express: false,
    notes: "Customer will pay on collection.",
    paymentStatus: "pay_on_collection",
    quantity: 1,
    serviceName: "Document review",
    statuses: ["in_progress"],
    variantName: "Premium",
  },
  {
    customer: {
      email: "mariam-sanni@test.com",
      name: "Mariam Sanni",
      phone: "+2348010000003",
    },
    dueOffsetDays: 2,
    express: false,
    notes: "Standard drop-off.",
    paymentStatus: "unpaid",
    quantity: 3,
    serviceName: "Installation visit",
    statuses: [],
    variantName: "Standard",
  },
  {
    customer: {
      email: "chinedu-okoro@test.com",
      name: "Chinedu Okoro",
      phone: "+2348010000004",
    },
    dueOffsetDays: 3,
    express: true,
    notes: "Express order for delivery follow-up.",
    paymentStatus: "paid",
    quantity: 1,
    serviceName: "Maintenance package",
    statuses: ["in_progress", "ready"],
    variantName: "Premium",
  },
  {
    customer: {
      email: "fatima-yusuf@test.com",
      name: "Fatima Yusuf",
      phone: "+2348010000005",
    },
    dueOffsetDays: -1,
    express: false,
    notes: "Due work sample for dashboard review.",
    paymentStatus: "partial",
    quantity: 2,
    serviceName: "Document review",
    statuses: ["in_progress"],
    variantName: "Standard",
  },
  {
    customer: {
      email: "segun-cole@test.com",
      name: "Segun Cole",
      phone: "+2348010000006",
    },
    dueOffsetDays: 4,
    express: false,
    notes: "Pay on delivery sample.",
    paymentStatus: "pay_on_delivery",
    quantity: 1,
    serviceName: "Standard consultation",
    statuses: ["cancelled"],
    variantName: "Standard",
  },
]

function requireConfirmation() {
  if (process.env.MOBILE_REAL_SESSION_CONFIRM === "1") return

  console.error(
    "Set MOBILE_REAL_SESSION_CONFIRM=1 to create disposable mobile auth/staff records for QA.",
  )
  process.exit(1)
}

function nowId() {
  return new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14)
}

function normalizeApiUrl(value) {
  return (value || DEFAULT_API_URL).replace(/\/$/, "")
}

function addDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

function createClient({ apiUrl, token }) {
  return createTRPCProxyClient({
    links: [
      httpLink({
        headers() {
          return token
            ? {
                "x-app-authorization": `Bearer ${token}`,
                "x-trpc-source": "mobile-real-session-qa",
              }
            : {
                "x-trpc-source": "mobile-real-session-qa",
              }
        },
        transformer: superjson,
        url: `${apiUrl}/api/trpc`,
      }),
    ],
  })
}

async function createMobileSession(client, input) {
  const otp = await client.auth.requestMobileOwnerOtp.mutate({
    businessName: input.businessName,
    email: input.email,
    mode: input.mode,
    name: input.name,
  })

  if (!otp.devCode) {
    throw new Error(
      "The API did not return devCode. Run this only against non-production API targets.",
    )
  }

  return await client.auth.verifyMobileOwnerOtp.mutate({
    businessName: input.businessName,
    code: otp.devCode,
    email: input.email,
    mode: input.mode,
    name: input.name,
  })
}

function getQaVariant(serviceItem, variantName) {
  return (
    serviceItem.variants.find((variant) => variant.name === variantName) ??
    serviceItem.variants[0] ??
    null
  )
}

async function seedServiceQaData(client, runId) {
  const serviceItems = []

  for (const service of SERVICE_QA_ITEMS) {
    serviceItems.push(
      await client.retailOps.createCatalogItem.mutate({
        category: "Professional services",
        kind: "service",
        name: service.name,
        priceMinor: service.standardPriceMinor,
        primaryUnitName: "Standard",
        service: {
          fulfillmentMode: "tracked",
        },
        variants: [
          {
            openingStockQuantity: 0,
            name: "Premium",
            priceMinor: service.premiumPriceMinor,
          },
        ],
      }),
    )
  }

  const jobs = []

  for (const [index, orderInput] of SERVICE_QA_JOBS.entries()) {
    const serviceItem = serviceItems.find(
      (item) => item.item.name === orderInput.serviceName,
    )

    if (!serviceItem) {
      throw new Error(`Seed service ${orderInput.serviceName} was not created.`)
    }

    const variant = getQaVariant(serviceItem, orderInput.variantName)
    const sale = await client.retailOps.createSale.mutate({
      customerEmail: orderInput.customer.email,
      customerName: orderInput.customer.name,
      customerPhone: orderInput.customer.phone,
      lines: [
        {
          catalogItemVariantId: variant?.id ?? serviceItem.variants[0].id,
          quantity: orderInput.quantity,
        },
      ],
      notes: orderInput.notes,
      paymentMethod: "cash",
      serviceDueAt: addDays(orderInput.dueOffsetDays),
    })
    if (!sale.serviceJob) continue
    let latestJob = sale.serviceJob
    await client.retailOps.addServiceJobEvidence.mutate({
      jobId: latestJob.id,
      label: orderInput.express
        ? "Priority intake evidence"
        : "Intake evidence",
      url: `https://ewatrade.com/qa/evidence/${runId}-${index + 1}.jpg`,
    })

    for (const status of orderInput.statuses) {
      if (
        !["in_progress", "ready", "completed", "cancelled"].includes(status)
      ) {
        continue
      }
      latestJob = await client.retailOps.updateServiceJobStatus.mutate({
        note: `Seeded ${status} status for mobile real-session QA.`,
        jobId: latestJob.id,
        status,
      })
    }

    jobs.push({
      customerName: orderInput.customer.name,
      id: latestJob.id,
      status: latestJob.status,
      totalMinor: sale.order.totalMinor,
    })
  }

  return {
    jobCount: jobs.length,
    jobs,
    serviceItems: serviceItems.map((item) => ({
      id: item.item.id,
      name: item.item.name,
      variantCount: item.variants.length,
    })),
  }
}

function toSessionImportLink(input) {
  const payload = {
    email: input.session.profile.email,
    name: input.session.profile.name,
    next: input.next,
    token: input.session.token,
    userId: input.session.profile.id,
  }
  const optionalEntries = {
    businessId: input.session.profile.businessId,
    businessName: input.session.profile.businessName,
    expiresAt:
      input.session.expiresAt instanceof Date
        ? input.session.expiresAt.toISOString()
        : input.session.expiresAt,
    role: input.session.profile.role,
    status: input.session.profile.status,
  }

  for (const [key, value] of Object.entries(optionalEntries)) {
    if (value) payload[key] = String(value)
  }

  return `${input.deepLinkBase}/${encodeURIComponent(JSON.stringify(payload))}`
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
  if (!path) return

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.link`, evidence.importLink, "utf8")
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        ...evidence,
        importLink: "[written beside this file as .link]",
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
}

function openOnAndroid(importLink) {
  if (process.env.MOBILE_REAL_SESSION_OPEN !== "1") return false

  const adb = process.env.ADB_PATH || "adb"
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
    { stdio: "pipe" },
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.toString() || "Failed to open mobile QA import link.",
    )
  }

  return true
}

async function main() {
  requireConfirmation()

  const runId = nowId()
  const apiUrl = normalizeApiUrl(
    process.env.MOBILE_REAL_SESSION_API_URL ||
      process.env.EXPO_PUBLIC_API_URL ||
      process.env.API_URL,
  )
  const profile = (
    process.env.MOBILE_REAL_SESSION_PROFILE || "owner"
  ).toLowerCase()
  const deepLinkBase =
    process.env.MOBILE_REAL_SESSION_DEEP_LINK_BASE || DEFAULT_DEEP_LINK_BASE
  const ownerEmail =
    process.env.MOBILE_REAL_SESSION_OWNER_EMAIL ||
    `mobile-owner-${runId}@test.com`
  const ownerName = process.env.MOBILE_REAL_SESSION_OWNER_NAME || "Mobile Owner"
  const businessName =
    process.env.MOBILE_REAL_SESSION_BUSINESS_NAME ||
    `Mobile Service QA ${runId}`
  const publicClient = createClient({ apiUrl })
  const ownerSession = await createMobileSession(publicClient, {
    businessName,
    email: ownerEmail,
    mode: "sign_up",
    name: ownerName,
  })
  const ownerClient = createClient({
    apiUrl,
    token: ownerSession.token,
  })
  const serviceSeed =
    process.env.MOBILE_REAL_SESSION_SEED_SERVICES === "1"
      ? await seedServiceQaData(ownerClient, runId)
      : null
  let selectedSession = ownerSession
  let next = process.env.MOBILE_REAL_SESSION_NEXT || "/service-jobs-modal"
  let staffInvite = null
  let staffCompletion = null

  if (profile === "staff-invited" || profile === "staff-active") {
    const staffEmail =
      process.env.MOBILE_REAL_SESSION_STAFF_EMAIL ||
      `mobile-staff-${runId}@test.com`
    const staffName =
      process.env.MOBILE_REAL_SESSION_STAFF_NAME || "Mobile Staff"

    staffInvite = await ownerClient.retailOps.inviteStaff.mutate({
      email: staffEmail,
      name: staffName,
      role: "cashier",
    })

    const staffSession = await createMobileSession(publicClient, {
      email: staffEmail,
      mode: "login",
      name: staffName,
    })

    selectedSession = staffSession
    next = process.env.MOBILE_REAL_SESSION_NEXT || "/staff-onboarding"

    if (profile === "staff-active") {
      const staffClient = createClient({
        apiUrl,
        token: staffSession.token,
      })

      staffCompletion =
        await staffClient.retailOps.completeStaffOnboarding.mutate({
          displayName: staffName,
          name: staffName,
        })
      selectedSession = {
        ...staffSession,
        profile: {
          ...staffSession.profile,
          businessId: staffCompletion.tenant.id,
          businessName: staffCompletion.tenant.name,
          email: staffCompletion.user.email,
          id: staffCompletion.user.id,
          name: staffCompletion.user.displayName || staffCompletion.user.name,
          role: staffCompletion.role,
          status: staffCompletion.status,
        },
      }
      next = process.env.MOBILE_REAL_SESSION_NEXT || "/sales-rep-home"
    }
  }

  const importLink = toSessionImportLink({
    deepLinkBase,
    next,
    session: selectedSession,
  })
  const evidence = {
    apiUrl,
    createdAt: new Date().toISOString(),
    serviceSeed,
    importLink,
    next,
    ownerSession: redactSession(ownerSession),
    profile,
    selectedSession: redactSession(selectedSession),
    staffCompletion: staffCompletion
      ? {
          role: staffCompletion.role,
          status: staffCompletion.status,
          tenant: staffCompletion.tenant,
          user: staffCompletion.user,
        }
      : null,
    staffInvite: staffInvite
      ? {
          role: staffInvite.invite.role,
          staff: staffInvite.staff,
          status: staffInvite.invite.status,
          tenantId: staffInvite.tenantId,
        }
      : null,
  }

  writeEvidence(process.env.MOBILE_REAL_SESSION_EVIDENCE_PATH, evidence)
  const opened = openOnAndroid(importLink)

  console.log(
    opened
      ? "Created real mobile session and opened the guarded QA import route."
      : "Created real mobile session. Set MOBILE_REAL_SESSION_OPEN=1 to open it on Android.",
  )
  console.log(
    `Profile=${profile}; next=${next}; tokenPrefix=${selectedSession.token.slice(
      0,
      8,
    )}`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
