import { randomUUID } from "node:crypto"

import type { Prisma, PrismaClient } from "../generated/prisma/client"
import {
  MembershipRole,
  MembershipStatus,
  StoreStatus,
  TenantMode,
  TenantType,
} from "../generated/prisma/enums"
import {
  type CreatedRetailOpsProduct,
  createRetailOpsProduct,
  updateRetailOpsProductUnitPrice,
} from "../src/queries/retail-ops-products"
import {
  closeRetailOpsSession,
  openRetailOpsSession,
  reviewRetailOpsCloseoutSession,
} from "../src/queries/retail-ops-sessions"
import {
  recordRetailOpsStockAdjustment,
  recordRetailOpsStockIntake,
  recordRetailOpsUnitConversion,
} from "../src/queries/retail-ops-stock"
import {
  createRetailOpsSubscriptionCheckoutIntent,
  processRetailOpsBillingProviderEvent,
} from "../src/queries/retail-ops-subscriptions"
import { recordRetailOpsSyncRun } from "../src/queries/retail-ops-sync"

type WorkflowCheckStatus = "fail" | "pass"

type WorkflowCheck = {
  detail: string
  evidence?: unknown
  name: string
  status: WorkflowCheckStatus
}

type ValidationWorkspace = {
  membershipId: string
  runId: string
  storeId: string
  tenantId: string
  userId: string
}

type WorkflowValidationState = {
  checkoutIntentId?: string
  product?: CreatedRetailOpsProduct
  sessionId?: string
  workspace?: ValidationWorkspace
}

const CONFIRMATION_ENV = "EWATRADE_CONFIRM_RETAIL_OPS_WORKFLOW_VALIDATION"
const KEEP_DATA_ENV = "EWATRADE_KEEP_RETAIL_OPS_WORKFLOW_VALIDATION_DATA"
const REQUIRED_PLAN_KEYS = ["starter", "growth", "pro"]

async function loadDatabaseClient(): Promise<PrismaClient> {
  if (process.env[CONFIRMATION_ENV] !== "1") {
    throw new Error(
      `${CONFIRMATION_ENV}=1 must be set before running Retail Ops workflow validation.`
    )
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must point to an intentional validation database before running Retail Ops workflow validation."
    )
  }

  const { prisma } = await import("../src/client")

  return prisma
}

function validationMetadata(runId: string, kind: string) {
  return {
    retailOpsWorkflowValidation: {
      kind,
      runId
    }
  } as Prisma.InputJsonValue
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function pass(name: string, detail: string, evidence?: unknown): WorkflowCheck {
  return { name, status: "pass", detail, evidence }
}

function fail(name: string, detail: string, evidence?: unknown): WorkflowCheck {
  return { name, status: "fail", detail, evidence }
}

function requireStateValue<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`${label} is missing from the workflow validation state.`)
  }

  return value
}

function requireUnit(product: CreatedRetailOpsProduct, unitName: string) {
  const unit = product.units.find((currentUnit) => currentUnit.name === unitName)

  if (!unit) {
    throw new Error(`Expected product unit "${unitName}" to be created.`)
  }

  return unit
}

async function runWorkflowCheck(
  checks: WorkflowCheck[],
  name: string,
  check: () => Promise<WorkflowCheck>
) {
  try {
    const result = await check()
    checks.push(result)

    return result.status === "pass"
  } catch (error) {
    checks.push(fail(name, formatError(error)))

    return false
  }
}

async function assertReferenceData(db: PrismaClient) {
  const [activePlans, unitTemplate] = await Promise.all([
    db.subscriptionPlan.findMany({
      where: {
        isActive: true,
        key: {
          in: REQUIRED_PLAN_KEYS
        }
      },
      select: {
        key: true
      }
    }),
    db.productUnitTemplate.findUnique({
      where: {
        key: "bag_fractions"
      },
      select: {
        id: true,
        key: true,
        units: {
          select: {
            key: true
          }
        }
      }
    })
  ])
  const activePlanKeys = new Set(activePlans.map((plan) => plan.key))
  const missingPlans = REQUIRED_PLAN_KEYS.filter((key) => !activePlanKeys.has(key))
  const unitKeys = new Set(unitTemplate?.units.map((unit) => unit.key) ?? [])
  const missingUnitKeys = ["bag", "half_bag", "quarter_bag"].filter(
    (key) => !unitKeys.has(key)
  )

  if (missingPlans.length > 0 || !unitTemplate || missingUnitKeys.length > 0) {
    throw new Error(
      "Retail Ops reference rows are missing. Run EWATRADE_CONFIRM_RETAIL_OPS_REFERENCE_SEED=1 bun run db:seed:retail-ops-reference before workflow validation."
    )
  }

  return pass(
    "reference data preconditions",
    "Active plan rows and the bag-fractions system unit template are present.",
    {
      activePlanKeys: [...activePlanKeys].sort(),
      unitTemplateId: unitTemplate.id,
      unitTemplateKey: unitTemplate.key
    }
  )
}

async function createValidationWorkspace(
  db: PrismaClient,
  runId: string
): Promise<WorkflowCheck & { workspace: ValidationWorkspace }> {
  const workspace = await db.$transaction(async (tx) => {
    const now = new Date()
    const slug = `retail-ops-validation-${runId.slice(0, 8)}`
    const user = await tx.user.create({
      data: {
        displayName: "Retail Ops Validation Owner",
        email: `${slug}@validation.ewatrade.local`,
        emailVerified: true,
        emailVerifiedAt: now,
        metadata: validationMetadata(runId, "user"),
        name: "Retail Ops Validation Owner"
      },
      select: {
        id: true
      }
    })
    const tenant = await tx.tenant.create({
      data: {
        countryCode: "NG",
        currencyCode: "NGN",
        enabledModes: [TenantMode.MERCHANT, TenantMode.STORE],
        metadata: validationMetadata(runId, "tenant"),
        name: "Retail Ops Validation Business",
        slug,
        type: TenantType.MERCHANT
      },
      select: {
        id: true
      }
    })
    const membership = await tx.membership.create({
      data: {
        acceptedAt: now,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
        tenantId: tenant.id,
        userId: user.id
      },
      select: {
        id: true
      }
    })
    const store = await tx.store.create({
      data: {
        currencyCode: "NGN",
        metadata: validationMetadata(runId, "store"),
        name: "Retail Ops Validation Store",
        slug: "main",
        status: StoreStatus.ACTIVE,
        tenantId: tenant.id
      },
      select: {
        id: true
      }
    })

    await tx.retailOpsStaffProfile.create({
      data: {
        acceptedAt: now,
        defaultStoreId: store.id,
        displayName: "Retail Ops Validation Owner",
        membershipId: membership.id,
        metadata: validationMetadata(runId, "staff_profile"),
        roleSnapshot: MembershipRole.OWNER,
        statusSnapshot: MembershipStatus.ACTIVE,
        tenantId: tenant.id,
        userId: user.id
      },
      select: {
        id: true
      }
    })

    return {
      membershipId: membership.id,
      runId,
      storeId: store.id,
      tenantId: tenant.id,
      userId: user.id
    }
  })

  return {
    ...pass(
      "validation workspace",
      "Created an isolated tenant, owner user, membership, store, and staff profile.",
      workspace
    ),
    workspace
  }
}

async function validateProductSetup(
  db: PrismaClient,
  workspace: ValidationWorkspace
): Promise<WorkflowCheck & { product: CreatedRetailOpsProduct }> {
  const product = await createRetailOpsProduct(db, {
    actorUserId: workspace.userId,
    externalId: `${workspace.runId}:product`,
    name: "Validation Feed",
    openingStockQuantity: 20,
    priceMinor: 10000,
    primaryUnitName: "Bag",
    storeId: workspace.storeId,
    tenantId: workspace.tenantId,
    unitTemplateKey: "bag_fractions",
    variants: [
      {
        conversionMultiplier: 0.5,
        name: "Half bag",
        openingStockQuantity: 0,
        priceMinor: 5500
      },
      {
        conversionMultiplier: 0.25,
        name: "Quarter bag",
        openingStockQuantity: 0,
        priceMinor: 3000
      }
    ]
  })
  const durableProduct = await db.product.findFirst({
    where: {
      id: product.product.id,
      storeId: workspace.storeId,
      tenantId: workspace.tenantId
    },
    select: {
      id: true,
      unitTemplateId: true,
      variants: {
        select: {
          id: true,
          unitTemplateUnitId: true
        }
      }
    }
  })

  if (!durableProduct?.unitTemplateId) {
    throw new Error("Product was created without durable unit-template linkage.")
  }

  if (durableProduct.variants.some((variant) => !variant.unitTemplateUnitId)) {
    throw new Error("One or more product units are missing unit-template linkage.")
  }

  return {
    ...pass(
      "product setup workflow",
      "Created a product with durable unit-template linkage, variants, inventory, and opening stock.",
      {
        productId: product.product.id,
        unitCount: product.units.length,
        unitTemplateId: durableProduct.unitTemplateId
      }
    ),
    product
  }
}

async function validatePriceHistory(
  db: PrismaClient,
  input: {
    product: CreatedRetailOpsProduct
    workspace: ValidationWorkspace
  }
) {
  const bagUnit = requireUnit(input.product, "Bag")
  const priceUpdate = await updateRetailOpsProductUnitPrice(db, {
    actorUserId: input.workspace.userId,
    priceMinor: 10500,
    productVariantId: bagUnit.id,
    reason: "Retail Ops workflow validation",
    storeId: input.workspace.storeId,
    tenantId: input.workspace.tenantId
  })
  const priceHistoryCount = await db.productUnitPriceHistory.count({
    where: {
      productVariantId: bagUnit.id,
      storeId: input.workspace.storeId,
      tenantId: input.workspace.tenantId
    }
  })

  if (priceHistoryCount < 2) {
    throw new Error("Durable product-unit price history was not recorded.")
  }

  return pass(
    "price history workflow",
    "Updated a product-unit price and verified durable price-history rows.",
    {
      priceHistoryCount,
      productVariantId: bagUnit.id,
      updatedPriceMinor: priceUpdate.unit.priceMinor
    }
  )
}

async function validateStockWorkflows(
  db: PrismaClient,
  input: {
    product: CreatedRetailOpsProduct
    workspace: ValidationWorkspace
  }
) {
  const bagUnit = requireUnit(input.product, "Bag")
  const halfBagUnit = requireUnit(input.product, "Half bag")

  await recordRetailOpsStockIntake(db, {
    actorUserId: input.workspace.userId,
    externalId: `${input.workspace.runId}:stock-intake`,
    note: "Retail Ops workflow validation intake",
    productVariantId: bagUnit.id,
    quantity: 4,
    sourceName: "Validation supplier",
    storeId: input.workspace.storeId,
    tenantId: input.workspace.tenantId
  })
  await recordRetailOpsUnitConversion(db, {
    actorUserId: input.workspace.userId,
    externalId: `${input.workspace.runId}:unit-conversion`,
    note: "Retail Ops workflow validation conversion",
    sourceProductVariantId: bagUnit.id,
    sourceQuantity: 2,
    storeId: input.workspace.storeId,
    targetProductVariantId: halfBagUnit.id,
    targetQuantity: 4,
    tenantId: input.workspace.tenantId
  })
  await recordRetailOpsStockAdjustment(db, {
    actorUserId: input.workspace.userId,
    direction: "decrease",
    externalId: `${input.workspace.runId}:stock-adjustment`,
    note: "Retail Ops workflow validation damage",
    productVariantId: halfBagUnit.id,
    quantity: 1,
    reason: "damage",
    sourceName: "Validation count",
    storeId: input.workspace.storeId,
    tenantId: input.workspace.tenantId
  })

  const [movementCount, bagInventory, halfBagInventory] = await Promise.all([
    db.inventoryMovement.count({
      where: {
        storeId: input.workspace.storeId,
        tenantId: input.workspace.tenantId
      }
    }),
    db.inventoryItem.findUnique({
      where: {
        productVariantId: bagUnit.id
      },
      select: {
        onHandQuantity: true
      }
    }),
    db.inventoryItem.findUnique({
      where: {
        productVariantId: halfBagUnit.id
      },
      select: {
        onHandQuantity: true
      }
    })
  ])

  if (movementCount < 4) {
    throw new Error("Durable stock movement rows were not recorded.")
  }

  return pass(
    "stock movement workflows",
    "Recorded stock intake, unit conversion, and damage adjustment through durable movement paths.",
    {
      bagOnHandQuantity: bagInventory?.onHandQuantity ?? null,
      halfBagOnHandQuantity: halfBagInventory?.onHandQuantity ?? null,
      movementCount
    }
  )
}

async function validateCloseoutWorkflow(
  db: PrismaClient,
  input: {
    product: CreatedRetailOpsProduct
    workspace: ValidationWorkspace
  }
): Promise<WorkflowCheck & { sessionId: string }> {
  const bagUnit = requireUnit(input.product, "Bag")
  const bagInventory = await db.inventoryItem.findUnique({
    where: {
      productVariantId: bagUnit.id
    },
    select: {
      onHandQuantity: true
    }
  })
  const countedQuantity = bagInventory?.onHandQuantity ?? 0
  const openedSession = await openRetailOpsSession(db, {
    actorUserId: input.workspace.userId,
    externalId: `${input.workspace.runId}:session-open`,
    inventoryLines: [
      {
        countedQuantity,
        note: "Retail Ops workflow validation opening count",
        productVariantId: bagUnit.id
      }
    ],
    notes: "Retail Ops workflow validation session",
    openedAt: new Date(),
    openingFloatMinor: 0,
    storeId: input.workspace.storeId,
    tenantId: input.workspace.tenantId
  })

  await closeRetailOpsSession(db, {
    actorUserId: input.workspace.userId,
    cashierSessionId: openedSession.id,
    closingFloatMinor: 0,
    externalId: `${input.workspace.runId}:session-close`,
    inventoryLines: [
      {
        countedQuantity,
        note: "Retail Ops workflow validation closing count",
        productVariantId: bagUnit.id
      }
    ],
    notes: "Retail Ops workflow validation closeout",
    storeId: input.workspace.storeId,
    tenantId: input.workspace.tenantId
  })
  await reviewRetailOpsCloseoutSession(db, {
    actorUserId: input.workspace.userId,
    cashierSessionId: openedSession.id,
    note: "Retail Ops workflow validation approval",
    status: "approved",
    storeId: input.workspace.storeId,
    tenantId: input.workspace.tenantId
  })

  const [closeoutCount, paymentDeclarationCount, stockDeclarationCount] =
    await Promise.all([
      db.retailOpsCloseout.count({
        where: {
          cashierSessionId: openedSession.id,
          tenantId: input.workspace.tenantId
        }
      }),
      db.retailOpsPaymentDeclaration.count({
        where: {
          cashierSessionId: openedSession.id,
          tenantId: input.workspace.tenantId
        }
      }),
      db.retailOpsStockDeclaration.count({
        where: {
          cashierSessionId: openedSession.id,
          tenantId: input.workspace.tenantId
        }
      })
    ])

  if (closeoutCount < 1 || paymentDeclarationCount < 1 || stockDeclarationCount < 1) {
    throw new Error("Durable closeout declaration rows were not recorded.")
  }

  return {
    ...pass(
      "closeout workflow",
      "Opened, closed, and approved a session with durable closeout declarations.",
      {
        cashierSessionId: openedSession.id,
        closeoutCount,
        paymentDeclarationCount,
        stockDeclarationCount
      }
    ),
    sessionId: openedSession.id
  }
}

async function validateSyncWorkflow(
  db: PrismaClient,
  workspace: ValidationWorkspace
) {
  const device = await import("../src/queries/retail-ops-subscriptions").then(
    ({ registerRetailOpsOfflineDevice }) =>
      registerRetailOpsOfflineDevice(db, {
        actorUserId: workspace.userId,
        appVersion: "validation",
        deviceId: `${workspace.runId}:offline-device`,
        deviceName: "Workflow validation device",
        platform: "web",
        storeId: workspace.storeId,
        tenantId: workspace.tenantId
      })
  )

  await recordRetailOpsSyncRun(db, {
    actorUserId: workspace.userId,
    deviceId: device.deviceId,
    results: [
      {
        eventId: `${workspace.runId}:sync-applied`,
        status: "applied",
        type: "product_setup_created"
      },
      {
        error: {
          code: "VALIDATION_CONFLICT",
          message: "Validation stock conflict"
        },
        eventId: `${workspace.runId}:sync-conflict`,
        status: "failed",
        type: "sale_created"
      }
    ],
    tenantId: workspace.tenantId
  })

  const [deviceCount, syncRunCount, failedEventCount] = await Promise.all([
    db.offlineDevice.count({
      where: {
        deviceId: device.deviceId,
        tenantId: workspace.tenantId
      }
    }),
    db.retailOpsSyncRun.count({
      where: {
        tenantId: workspace.tenantId
      }
    }),
    db.retailOpsSyncEvent.count({
      where: {
        status: "FAILED",
        tenantId: workspace.tenantId
      }
    })
  ])

  if (deviceCount < 1 || syncRunCount < 1 || failedEventCount < 1) {
    throw new Error("Durable offline-device or sync-run rows were not recorded.")
  }

  return pass(
    "offline sync workflow",
    "Registered an offline device and recorded a durable sync run with conflict evidence.",
    {
      deviceId: device.deviceId,
      failedEventCount,
      syncRunCount
    }
  )
}

async function validateBillingWorkflow(
  db: PrismaClient,
  workspace: ValidationWorkspace
): Promise<WorkflowCheck & { checkoutIntentId: string }> {
  const checkoutIntent = await createRetailOpsSubscriptionCheckoutIntent(db, {
    planId: "growth",
    requestedByUserId: workspace.userId,
    surface: "dashboard",
    tenantId: workspace.tenantId
  })
  const providerEvent = await processRetailOpsBillingProviderEvent(db, {
    checkout: {
      completedAt: new Date(),
      externalId: checkoutIntent.intent.id,
      status: "completed",
      tenantId: workspace.tenantId
    },
    eventId: `${workspace.runId}:billing-provider-event`,
    invoice: {
      amountDueMinor: 0,
      amountPaidMinor: 0,
      currencyCode: "NGN",
      paidAt: new Date(),
      planId: "growth",
      providerInvoiceId: `${workspace.runId}:invoice`,
      status: "paid",
      tenantId: workspace.tenantId
    },
    payload: {
      validationRunId: workspace.runId
    },
    provider: "manual",
    subscription: {
      billingCustomerId: `${workspace.runId}:customer`,
      billingSubscriptionId: `${workspace.runId}:subscription`,
      currentPeriodEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currentPeriodStartsAt: new Date(),
      planId: "growth",
      status: "active",
      tenantId: workspace.tenantId
    },
    tenantId: workspace.tenantId,
    type: "checkout_completed"
  })
  const [checkoutSessionCount, subscriptionCount, invoiceCount, eventCount] =
    await Promise.all([
      db.billingCheckoutSession.count({
        where: {
          tenantId: workspace.tenantId
        }
      }),
      db.tenantSubscription.count({
        where: {
          tenantId: workspace.tenantId
        }
      }),
      db.billingInvoice.count({
        where: {
          tenantId: workspace.tenantId
        }
      }),
      db.billingProviderEvent.count({
        where: {
          eventId: `${workspace.runId}:billing-provider-event`,
          tenantId: workspace.tenantId
        }
      })
    ])

  if (
    checkoutSessionCount < 1 ||
    subscriptionCount < 1 ||
    invoiceCount < 1 ||
    eventCount < 1
  ) {
    throw new Error("Durable billing checkout/provider rows were not recorded.")
  }

  return {
    ...pass(
      "billing provider workflow",
      "Created a checkout intent and processed a normalized provider event into durable billing rows.",
      {
        checkoutIntentId: checkoutIntent.intent.id,
        checkoutSessionCount,
        eventStatus: providerEvent.providerEvent.status,
        invoiceCount,
        subscriptionCount
      }
    ),
    checkoutIntentId: checkoutIntent.intent.id
  }
}

async function cleanupValidationWorkspace(
  db: PrismaClient,
  workspace: ValidationWorkspace | undefined
) {
  if (!workspace || process.env[KEEP_DATA_ENV] === "1") {
    return {
      kept: Boolean(workspace),
      tenantDeleted: false,
      userDeleted: false
    }
  }

  const result = {
    kept: false,
    tenantDeleted: false,
    userDeleted: false
  }

  await db.tenant.delete({
    where: {
      id: workspace.tenantId
    }
  })
  result.tenantDeleted = true

  await db.user.delete({
    where: {
      id: workspace.userId
    }
  })
  result.userDeleted = true

  return result
}

async function buildValidationReport(db: PrismaClient) {
  const runId = randomUUID()
  const state: WorkflowValidationState = {}
  const checks: WorkflowCheck[] = []

  if (
    !(await runWorkflowCheck(checks, "reference data preconditions", () =>
      assertReferenceData(db)
    ))
  ) {
    return { checks, cleanup: null, ok: false, runId }
  }

  if (
    !(await runWorkflowCheck(checks, "validation workspace", async () => {
      const result = await createValidationWorkspace(db, runId)

      state.workspace = result.workspace

      return result
    }))
  ) {
    return { checks, cleanup: null, ok: false, runId }
  }

  const workflowSteps: Array<{
    name: string
    run: () => Promise<WorkflowCheck>
  }> = [
    {
      name: "product setup workflow",
      run: async () => {
        const result = await validateProductSetup(
          db,
          requireStateValue(state.workspace, "workspace")
        )

        state.product = result.product

        return result
      }
    },
    {
      name: "price history workflow",
      run: () =>
        validatePriceHistory(db, {
          product: requireStateValue(state.product, "product"),
          workspace: requireStateValue(state.workspace, "workspace")
        })
    },
    {
      name: "stock movement workflows",
      run: () =>
        validateStockWorkflows(db, {
          product: requireStateValue(state.product, "product"),
          workspace: requireStateValue(state.workspace, "workspace")
        })
    },
    {
      name: "closeout workflow",
      run: async () => {
        const result = await validateCloseoutWorkflow(db, {
          product: requireStateValue(state.product, "product"),
          workspace: requireStateValue(state.workspace, "workspace")
        })

        state.sessionId = result.sessionId

        return result
      }
    },
    {
      name: "offline sync workflow",
      run: () =>
        validateSyncWorkflow(db, requireStateValue(state.workspace, "workspace"))
    },
    {
      name: "billing provider workflow",
      run: async () => {
        const result = await validateBillingWorkflow(
          db,
          requireStateValue(state.workspace, "workspace")
        )

        state.checkoutIntentId = result.checkoutIntentId

        return result
      }
    }
  ]

  for (const step of workflowSteps) {
    const passed = await runWorkflowCheck(checks, step.name, step.run)

    if (!passed) break
  }

  const cleanup = await cleanupValidationWorkspace(db, state.workspace)

  return {
    checks,
    cleanup,
    ok: checks.every((check) => check.status === "pass"),
    runId
  }
}

async function main() {
  const db = await loadDatabaseClient()

  try {
    const report = await buildValidationReport(db)

    console.log(
      JSON.stringify(
        {
          ...report,
          generatedAt: new Date().toISOString(),
          writesValidationData: true
        },
        null,
        2
      )
    )

    if (!report.ok) {
      process.exitCode = 1
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: formatError(error),
        generatedAt: new Date().toISOString(),
        ok: false,
        writesValidationData: true
      },
      null,
      2
    )
  )
  process.exitCode = 1
})
