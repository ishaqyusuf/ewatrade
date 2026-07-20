import helperFile from "./catalog-setup-helpers.json"
import { parseExactDecimal } from "./exact-decimal"

export type CatalogSetupHelperKind = "product" | "service"
export type CatalogSetupHelperClassification = "example" | "pattern"
export type CatalogSetupStockBehavior =
  | "alternate_transaction"
  | "canonical_shared"
  | "packaged_stock"

export type CatalogSetupOptionGroup = {
  name: string
  values: string[]
}

export type CatalogSetupUnit = {
  factor: string
  name: string
  stockBehavior: CatalogSetupStockBehavior
  symbol?: string
  transactionScale: number
}

type CatalogSetupHelperFields = {
  classification: CatalogSetupHelperClassification
  description: string
  key: string
  recommended?: boolean
  suggestedName?: string
  tags: string[]
  title: string
}

export type ProductCatalogSetupHelper = CatalogSetupHelperFields & {
  kind: "product"
  setup: {
    optionGroups: CatalogSetupOptionGroup[]
    units: CatalogSetupUnit[]
  }
}

export type ServiceCatalogSetupHelper = CatalogSetupHelperFields & {
  kind: "service"
  setup: {
    authorizationPolicy:
      | "after_required_payment"
      | "manual_release"
      | "on_order_confirmation"
    optionGroups: CatalogSetupOptionGroup[]
    pricingPolicy: "fixed" | "quote_required"
    quantityScale: number
    workPolicy: "charge_only" | "tracked"
  }
}

export type CatalogSetupHelper =
  | ProductCatalogSetupHelper
  | ServiceCatalogSetupHelper

export type CatalogSetupHelperApplication =
  | {
      additionalUnits: readonly CatalogSetupUnit[]
      canonicalUnit: CatalogSetupUnit
      kind: "product"
      optionGroups: readonly CatalogSetupOptionGroup[]
      suggestedName?: string
    }
  | {
      authorizationPolicy: ServiceCatalogSetupHelper["setup"]["authorizationPolicy"]
      kind: "service"
      optionGroups: readonly CatalogSetupOptionGroup[]
      pricingPolicy: ServiceCatalogSetupHelper["setup"]["pricingPolicy"]
      quantityScale: number
      suggestedName?: string
      workPolicy: ServiceCatalogSetupHelper["setup"]["workPolicy"]
    }

export type CatalogSetupReplacementAction = "apply" | "close" | "confirm"

type CatalogSetupHelperFile = {
  helpers: CatalogSetupHelper[]
  schemaVersion: 1
}

const STOCK_BEHAVIORS = new Set<CatalogSetupStockBehavior>([
  "alternate_transaction",
  "canonical_shared",
  "packaged_stock",
])
const AUTHORIZATION_POLICIES = new Set([
  "after_required_payment",
  "manual_release",
  "on_order_confirmation",
])
const PRICING_POLICIES = new Set(["fixed", "quote_required"])
const WORK_POLICIES = new Set(["charge_only", "tracked"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  field: string,
) {
  const allowed = new Set(allowedKeys)
  const unexpectedKey = Object.keys(value).find((key) => !allowed.has(key))
  if (unexpectedKey) {
    throw new Error(
      `Catalog setup helper ${field} contains unsupported field ${unexpectedKey}.`,
    )
  }
}

function assertStringArray(
  value: unknown,
  field: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    throw new Error(`Catalog setup helper ${field} must be non-empty strings.`)
  }
}

function assertOptionGroups(
  value: unknown,
  helperKey: string,
): asserts value is CatalogSetupOptionGroup[] {
  if (!Array.isArray(value) || value.length > 12) {
    throw new Error(
      `Catalog setup helper ${helperKey} has invalid option groups.`,
    )
  }

  let combinations = 1
  for (const group of value) {
    if (
      !isRecord(group) ||
      typeof group.name !== "string" ||
      !group.name.trim()
    ) {
      throw new Error(
        `Catalog setup helper ${helperKey} has an invalid option group.`,
      )
    }
    assertOnlyKeys(group, ["name", "values"], `${helperKey} option group`)
    assertStringArray(group.values, `${helperKey} option values`)
    combinations *= group.values.length
  }

  if (combinations > 96) {
    throw new Error(
      `Catalog setup helper ${helperKey} exceeds 96 combinations.`,
    )
  }
}

function assertCommonHelper(
  helper: Record<string, unknown>,
): asserts helper is Record<string, unknown> & CatalogSetupHelperFields {
  assertOnlyKeys(
    helper,
    [
      "classification",
      "description",
      "key",
      "kind",
      "recommended",
      "setup",
      "suggestedName",
      "tags",
      "title",
    ],
    "entry",
  )
  for (const field of ["description", "key", "title"] as const) {
    if (typeof helper[field] !== "string" || !helper[field].trim()) {
      throw new Error(`Catalog setup helper ${field} is required.`)
    }
  }
  if (
    helper.classification !== "pattern" &&
    helper.classification !== "example"
  ) {
    throw new Error(
      `Catalog setup helper ${helper.key} has an invalid classification.`,
    )
  }
  assertStringArray(helper.tags, `${helper.key} tags`)
  if (
    helper.suggestedName !== undefined &&
    (typeof helper.suggestedName !== "string" || !helper.suggestedName.trim())
  ) {
    throw new Error(
      `Catalog setup helper ${helper.key} has an invalid suggested name.`,
    )
  }
  if (
    helper.recommended !== undefined &&
    typeof helper.recommended !== "boolean"
  ) {
    throw new Error(
      `Catalog setup helper ${helper.key} has an invalid recommendation.`,
    )
  }
}

function assertProductSetup(
  setup: unknown,
  helperKey: string,
): asserts setup is ProductCatalogSetupHelper["setup"] {
  if (!isRecord(setup) || !Array.isArray(setup.units)) {
    throw new Error(`Product setup helper ${helperKey} requires units.`)
  }
  assertOnlyKeys(setup, ["optionGroups", "units"], `${helperKey} Product setup`)
  if (setup.units.length === 0 || setup.units.length > 48) {
    throw new Error(
      `Product setup helper ${helperKey} has an invalid unit count.`,
    )
  }

  let canonicalCount = 0
  for (const unit of setup.units) {
    if (
      !isRecord(unit) ||
      typeof unit.name !== "string" ||
      !unit.name.trim() ||
      typeof unit.factor !== "string" ||
      (unit.symbol !== undefined &&
        (typeof unit.symbol !== "string" || !unit.symbol.trim())) ||
      !STOCK_BEHAVIORS.has(unit.stockBehavior as CatalogSetupStockBehavior) ||
      !Number.isInteger(unit.transactionScale) ||
      Number(unit.transactionScale) < 0 ||
      Number(unit.transactionScale) > 6
    ) {
      throw new Error(`Product setup helper ${helperKey} has an invalid unit.`)
    }
    assertOnlyKeys(
      unit,
      ["factor", "name", "stockBehavior", "symbol", "transactionScale"],
      `${helperKey} Product unit`,
    )
    parseExactDecimal(unit.factor, { allowZero: false, maxScale: 12 })
    if (unit.stockBehavior === "canonical_shared") {
      canonicalCount += 1
      if (unit.factor !== "1") {
        throw new Error(
          `Product setup helper ${helperKey} canonical factor must be 1.`,
        )
      }
    }
  }
  if (canonicalCount !== 1) {
    throw new Error(
      `Product setup helper ${helperKey} requires one canonical unit.`,
    )
  }
  if (setup.units[0]?.stockBehavior !== "canonical_shared") {
    throw new Error(
      `Product setup helper ${helperKey} must list its canonical unit first.`,
    )
  }
  assertOptionGroups(setup.optionGroups, helperKey)
}

function assertServiceSetup(
  setup: unknown,
  helperKey: string,
): asserts setup is ServiceCatalogSetupHelper["setup"] {
  if (
    !isRecord(setup) ||
    !AUTHORIZATION_POLICIES.has(String(setup.authorizationPolicy)) ||
    !PRICING_POLICIES.has(String(setup.pricingPolicy)) ||
    !WORK_POLICIES.has(String(setup.workPolicy)) ||
    !Number.isInteger(setup.quantityScale) ||
    Number(setup.quantityScale) < 0 ||
    Number(setup.quantityScale) > 6
  ) {
    throw new Error(`Service setup helper ${helperKey} is invalid.`)
  }
  assertOnlyKeys(
    setup,
    [
      "authorizationPolicy",
      "optionGroups",
      "pricingPolicy",
      "quantityScale",
      "workPolicy",
    ],
    `${helperKey} Service setup`,
  )
  assertOptionGroups(setup.optionGroups, helperKey)
}

function assertCatalogSetupHelperFile(
  value: unknown,
): asserts value is CatalogSetupHelperFile {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.helpers)
  ) {
    throw new Error("Catalog setup helper file must use schema version 1.")
  }

  const keys = new Set<string>()
  for (const helper of value.helpers) {
    if (!isRecord(helper)) {
      throw new Error("Catalog setup helper entries must be objects.")
    }
    assertCommonHelper(helper)
    if (keys.has(helper.key)) {
      throw new Error(`Catalog setup helper key ${helper.key} is duplicated.`)
    }
    keys.add(helper.key)

    if (helper.kind === "product") {
      assertProductSetup(helper.setup, helper.key)
    } else if (helper.kind === "service") {
      assertServiceSetup(helper.setup, helper.key)
    } else {
      throw new Error(`Catalog setup helper ${helper.key} has an invalid kind.`)
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry)
  } else if (isRecord(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry)
  }
  return Object.freeze(value)
}

assertCatalogSetupHelperFile(helperFile)

export const CATALOG_SETUP_HELPER_SCHEMA_VERSION = helperFile.schemaVersion
export const CATALOG_SETUP_HELPERS: readonly CatalogSetupHelper[] = deepFreeze(
  helperFile.helpers,
)

export function findCatalogSetupHelper(key: string) {
  return CATALOG_SETUP_HELPERS.find((helper) => helper.key === key)
}

export function buildCatalogSetupHelperApplication(
  helper: CatalogSetupHelper,
): CatalogSetupHelperApplication {
  if (helper.kind === "product") {
    const [canonicalUnit, ...additionalUnits] = helper.setup.units
    if (!canonicalUnit) {
      throw new Error(`Product setup helper ${helper.key} requires units.`)
    }
    return {
      additionalUnits,
      canonicalUnit,
      kind: "product",
      optionGroups: helper.setup.optionGroups,
      suggestedName: helper.suggestedName,
    }
  }

  return {
    authorizationPolicy: helper.setup.authorizationPolicy,
    kind: "service",
    optionGroups: helper.setup.optionGroups,
    pricingPolicy: helper.setup.pricingPolicy,
    quantityScale: helper.setup.quantityScale,
    suggestedName: helper.suggestedName,
    workPolicy: helper.setup.workPolicy,
  }
}

export function getCatalogSetupReplacementAction({
  currentKey,
  hasStructuralDraft,
  nextKey,
}: {
  currentKey: string | null
  hasStructuralDraft: boolean
  nextKey: string | null
}): CatalogSetupReplacementAction {
  if (currentKey === nextKey) {
    return currentKey === null && hasStructuralDraft ? "confirm" : "close"
  }
  return hasStructuralDraft ? "confirm" : "apply"
}

export function isCatalogFixedPriceMissing({
  enabled,
  hasBasePrice,
  hasOverridePrice,
  quoteRequired,
}: {
  enabled: boolean
  hasBasePrice: boolean
  hasOverridePrice: boolean
  quoteRequired: boolean
}) {
  return enabled && !quoteRequired && !hasBasePrice && !hasOverridePrice
}

export function listCatalogSetupHelpers(options: {
  kind: "product"
  query?: string
}): ProductCatalogSetupHelper[]
export function listCatalogSetupHelpers(options: {
  kind: "service"
  query?: string
}): ServiceCatalogSetupHelper[]
export function listCatalogSetupHelpers(options?: {
  kind?: CatalogSetupHelperKind
  query?: string
}): CatalogSetupHelper[]
export function listCatalogSetupHelpers({
  kind,
  query,
}: {
  kind?: CatalogSetupHelperKind
  query?: string
} = {}) {
  const normalizedQuery = query?.trim().toLowerCase()

  return CATALOG_SETUP_HELPERS.filter((helper) => {
    if (kind && helper.kind !== kind) return false
    if (!normalizedQuery) return true

    return [
      helper.title,
      helper.description,
      helper.suggestedName,
      ...helper.tags,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedQuery))
  })
}
