import type { Prisma, PrismaClient } from "../generated/prisma/client"
import { RETAIL_OPS_SUBSCRIPTION_PLANS } from "../src/queries/retail-ops-subscriptions"

type SeededPlan = {
  id: string
  isActive: boolean
  key: string
  name: string
}

type SeededUnitTemplate = {
  id: string
  key: string
  name: string
  units: Array<{
    id: string
    key: string
    name: string
  }>
}

const CONFIRMATION_ENV = "CONFIRM_RETAIL_OPS_REFERENCE_SEED"

const RETAIL_OPS_UNIT_TEMPLATES = [
  {
    baseUnitName: "Bag",
    description: "Common bag, half-bag, and quarter-bag selling units.",
    key: "bag_fractions",
    name: "Bag fractions",
    sortOrder: 10,
    units: [
      {
        isBase: true,
        key: "bag",
        name: "Bag",
        ratioDenominator: 1,
        ratioNumerator: 1,
        sortOrder: 10,
      },
      {
        isBase: false,
        key: "half_bag",
        name: "Half bag",
        ratioDenominator: 2,
        ratioNumerator: 1,
        sortOrder: 20,
      },
      {
        isBase: false,
        key: "quarter_bag",
        name: "Quarter bag",
        ratioDenominator: 4,
        ratioNumerator: 1,
        sortOrder: 30,
      },
    ],
  },
  {
    baseUnitName: "Kilogram",
    description: "Common kilogram, half-kilogram, and quarter-kilogram units.",
    key: "kilogram_fractions",
    name: "Kilogram fractions",
    sortOrder: 20,
    units: [
      {
        isBase: true,
        key: "kilogram",
        name: "Kilogram",
        ratioDenominator: 1,
        ratioNumerator: 1,
        sortOrder: 10,
      },
      {
        isBase: false,
        key: "half_kilogram",
        name: "Half kilogram",
        ratioDenominator: 2,
        ratioNumerator: 1,
        sortOrder: 20,
      },
      {
        isBase: false,
        key: "quarter_kilogram",
        name: "Quarter kilogram",
        ratioDenominator: 4,
        ratioNumerator: 1,
        sortOrder: 30,
      },
    ],
  },
]

function referenceMetadata(kind: "plan" | "unit_template" | "unit") {
  return {
    retailOpsReferenceData: {
      kind,
      source: "seed-retail-ops-reference-data",
      version: 1,
    },
  } as Prisma.InputJsonValue
}

async function loadDatabaseClient(): Promise<PrismaClient> {
  if (process.env[CONFIRMATION_ENV] !== "1") {
    throw new Error(
      `${CONFIRMATION_ENV}=1 must be set before seeding Retail Ops reference data.`,
    )
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must point to an intentional validation database before seeding Retail Ops reference data.",
    )
  }

  const { prisma } = await import("../src/client")

  return prisma
}

async function seedSubscriptionPlans(db: PrismaClient): Promise<SeededPlan[]> {
  const seededPlans: SeededPlan[] = []

  for (const [index, plan] of RETAIL_OPS_SUBSCRIPTION_PLANS.entries()) {
    const seededPlan = await db.subscriptionPlan.upsert({
      where: {
        key: plan.id,
      },
      create: {
        currencyCode: "NGN",
        description: plan.description,
        isActive: true,
        key: plan.id,
        limits: plan.limits as Prisma.InputJsonValue,
        metadata: referenceMetadata("plan"),
        monthlyPriceMinor: null,
        name: plan.name,
        priceLabel: plan.priceLabel,
        sortOrder: (index + 1) * 10,
        supportLabel: plan.supportLabel,
        yearlyPriceMinor: null,
      },
      update: {
        currencyCode: "NGN",
        description: plan.description,
        isActive: true,
        limits: plan.limits as Prisma.InputJsonValue,
        metadata: referenceMetadata("plan"),
        monthlyPriceMinor: null,
        name: plan.name,
        priceLabel: plan.priceLabel,
        sortOrder: (index + 1) * 10,
        supportLabel: plan.supportLabel,
        yearlyPriceMinor: null,
      },
      select: {
        id: true,
        isActive: true,
        key: true,
        name: true,
      },
    })

    seededPlans.push(seededPlan)
  }

  return seededPlans
}

async function seedUnitTemplates(
  db: PrismaClient,
): Promise<SeededUnitTemplate[]> {
  const seededTemplates: SeededUnitTemplate[] = []

  for (const template of RETAIL_OPS_UNIT_TEMPLATES) {
    const seededTemplate = await db.productUnitTemplate.upsert({
      where: {
        key: template.key,
      },
      create: {
        baseUnitName: template.baseUnitName,
        description: template.description,
        isActive: true,
        isSystem: true,
        key: template.key,
        metadata: referenceMetadata("unit_template"),
        name: template.name,
        sortOrder: template.sortOrder,
        tenantId: null,
      },
      update: {
        baseUnitName: template.baseUnitName,
        description: template.description,
        isActive: true,
        isSystem: true,
        metadata: referenceMetadata("unit_template"),
        name: template.name,
        sortOrder: template.sortOrder,
        tenantId: null,
      },
      select: {
        id: true,
        key: true,
        name: true,
      },
    })
    const seededUnits = []

    for (const unit of template.units) {
      const seededUnit = await db.productUnitTemplateUnit.upsert({
        where: {
          templateId_key: {
            key: unit.key,
            templateId: seededTemplate.id,
          },
        },
        create: {
          isBase: unit.isBase,
          key: unit.key,
          metadata: referenceMetadata("unit"),
          name: unit.name,
          ratioDenominator: unit.ratioDenominator,
          ratioNumerator: unit.ratioNumerator,
          sortOrder: unit.sortOrder,
          templateId: seededTemplate.id,
        },
        update: {
          isBase: unit.isBase,
          metadata: referenceMetadata("unit"),
          name: unit.name,
          ratioDenominator: unit.ratioDenominator,
          ratioNumerator: unit.ratioNumerator,
          sortOrder: unit.sortOrder,
        },
        select: {
          id: true,
          key: true,
          name: true,
        },
      })

      seededUnits.push(seededUnit)
    }

    seededTemplates.push({
      ...seededTemplate,
      units: seededUnits,
    })
  }

  return seededTemplates
}

async function main() {
  const db = await loadDatabaseClient()

  try {
    const plans = await seedSubscriptionPlans(db)
    const unitTemplates = await seedUnitTemplates(db)

    console.log(
      JSON.stringify(
        {
          ok: true,
          generatedAt: new Date().toISOString(),
          seeded: {
            plans,
            unitTemplates,
          },
        },
        null,
        2,
      ),
    )
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)

  console.error(
    JSON.stringify(
      {
        ok: false,
        error: message,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
})
