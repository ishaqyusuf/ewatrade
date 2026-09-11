import { compareExactDecimals, parseExactDecimal } from "./exact-decimal"
import type { QaFormCoverageDeclaration } from "./qa-accelerator"
import {
  type QaFixtureContext,
  createQaFixtureBusiness,
  createQaFixtureIdentity,
} from "./qa-fixtures"

export function createQaCustomerFixture(
  context: QaFixtureContext,
  sequence = 1,
) {
  const identity = createQaFixtureIdentity(context, {
    formId: "customer.create",
    sequence,
  })
  return {
    address: identity.addressLine1,
    city: identity.city,
    email: identity.email,
    name: identity.fullName,
    notes: identity.note,
    phone: identity.phone,
  }
}

export function createQaStaffFixture(context: QaFixtureContext, sequence = 1) {
  const identity = createQaFixtureIdentity(context, {
    formId: "staff.invite",
    sequence,
  })
  return {
    email: identity.email,
    firstName: identity.firstName,
    lastName: identity.lastName,
    name: identity.fullName,
    role: "STAFF" as const,
  }
}

export function createQaCatalogFixture(
  context: QaFixtureContext,
  sequence = 1,
) {
  const suffix = `${context.invocationId.slice(-6)}-${sequence}`.toUpperCase()
  return {
    description: `QA fixture product ${suffix}. Safe to remove after testing.`,
    name: `QA Test Product ${suffix}`,
    price: "2500.00",
    sku: `QA-${suffix}`,
    unit: "piece",
  }
}

export function createQaInventoryFixture(context: QaFixtureContext) {
  return {
    note: `QA stock fixture ${context.invocationId}`,
    quantity: "12",
    reason: "QA accelerator stock intake",
    unitCost: "1500.00",
  }
}

type QaInventoryConversionRow = {
  availableQuantity: string
  balanceSourceId: string
  configurationVersionId: string
  inventoryUnitFactor: string
  inventoryUnitTransactionScale: number
  kind: string
  productId: string
  variantId: string
}

export function createQaInventoryConversionFixture(
  rows: readonly QaInventoryConversionRow[],
) {
  for (const source of rows) {
    if (source.kind !== "PACKAGED_STOCK") continue
    for (const target of rows) {
      if (
        target.balanceSourceId === source.balanceSourceId ||
        target.kind !== "PACKAGED_STOCK" ||
        target.productId !== source.productId ||
        target.variantId !== source.variantId ||
        target.configurationVersionId !== source.configurationVersionId
      ) {
        continue
      }
      try {
        // Swapping the unit factors makes both sides resolve to the exact same
        // canonical quantity without floating-point arithmetic.
        const sourceQuantity = parseExactDecimal(target.inventoryUnitFactor, {
          allowZero: false,
          maxScale: source.inventoryUnitTransactionScale,
        })
        const targetQuantity = parseExactDecimal(source.inventoryUnitFactor, {
          allowZero: false,
          maxScale: target.inventoryUnitTransactionScale,
        })
        if (
          compareExactDecimals(source.availableQuantity, sourceQuantity) < 0
        ) {
          continue
        }
        return {
          reason: "QA accelerator exact packaged-stock conversion",
          sourceBalanceSourceId: source.balanceSourceId,
          sourceQuantity,
          targetBalanceSourceId: target.balanceSourceId,
          targetQuantity,
        }
      } catch {
        // This pair cannot express exact quantities at the owning unit scales.
      }
    }
  }
  return null
}

export function createQaOrderFixture(context: QaFixtureContext, sequence = 1) {
  const customer = createQaCustomerFixture(context, sequence)
  return {
    customerEmail: customer.email,
    customerName: customer.name,
    customerPhone: customer.phone,
    note: `QA order ${context.invocationId}-${sequence}; manual submission required.`,
    paymentMethod: "cash" as const,
    quantity: 1,
  }
}

export function createQaPaymentFixture(
  context: QaFixtureContext,
  balanceDueMinor: number,
) {
  if (!Number.isSafeInteger(balanceDueMinor) || balanceDueMinor <= 0) {
    throw new Error("An outstanding integer minor-unit balance is required.")
  }
  return {
    amountMinor: Math.min(balanceDueMinor, 250_000),
    method: "cash" as const,
    reference: `QA-${context.invocationId.slice(-8).toUpperCase()}`,
  }
}

export function createQaServiceFixture(
  context: QaFixtureContext,
  sequence = 1,
) {
  const customer = createQaCustomerFixture(context, sequence)
  return {
    customerName: customer.name,
    customerPhone: customer.phone,
    description:
      "QA test service request for a routine, non-regulated product inspection.",
    dueAt: new Date(context.now.getTime() + 2 * 24 * 60 * 60_000),
    title: `QA Routine Service ${context.invocationId.slice(-6).toUpperCase()}`,
  }
}

export function createQaMessageFixture(context: QaFixtureContext) {
  return {
    message: `QA draft ${context.invocationId}: This is a safe test message. Review before sending.`,
  }
}

export function createQaBusinessFixture(
  context: QaFixtureContext,
  sequence = 1,
) {
  return createQaFixtureBusiness(context, {
    formId: "business.create",
    sequence,
  })
}

export const QA_MARKETING_FORM_INVENTORY = [
  "marketing.lead",
  "marketing.login",
  "marketing.qa-authorization",
  "signup.business",
  "signup.owner",
  "signup.workspace",
] as const

export const QA_MOBILE_FORM_INVENTORY = [
  "mobile.app-lock-pin",
  "mobile.business.create",
  "mobile.catalog.item",
  "mobile.catalog.filter",
  "mobile.catalog.options",
  "mobile.catalog.setup-helper",
  "mobile.closeout",
  "mobile.customer.create",
  "mobile.customer.guest-notification",
  "mobile.customer.login",
  "mobile.customer.message",
  "mobile.domain.management",
  "mobile.inventory.stock-intake",
  "mobile.inventory.unit-conversion",
  "mobile.login",
  "mobile.order.create",
  "mobile.order.filter",
  "mobile.order.payment",
  "mobile.order.reminder-settings",
  "mobile.qa-authorization",
  "mobile.service.job",
  "mobile.signup",
  "mobile.staff.invite",
  "mobile.staff.onboarding",
  "mobile.subscription",
  "mobile.verify-email",
] as const

export const QA_DASHBOARD_FORM_INVENTORY = [
  "dashboard.booking.workspace",
  "dashboard.booking.availability",
  "dashboard.booking.resources",
  "dashboard.catalog.item",
  "dashboard.catalog.promotion",
  "dashboard.compliance.pharmacy",
  "dashboard.compliance.pharmacy.role",
  "dashboard.compliance.pharmacy.settings",
  "dashboard.customer.channel-availability",
  "dashboard.customer.channel-connection",
  "dashboard.customer.channel-mode",
  "dashboard.customer.quote-approval",
  "dashboard.customer.quote-release",
  "dashboard.customer.store-binding",
  "dashboard.customer.team-routing",
  "dashboard.domain.external",
  "dashboard.domain.purchase",
  "dashboard.domain.purchase.owner",
  "dashboard.domain.purchase.search",
  "dashboard.inventory.operation",
  "dashboard.order.create",
  "dashboard.prescription.fulfillment",
  "dashboard.prescription.fulfillment.delivery-courier",
  "dashboard.prescription.fulfillment.delivery-outcome",
  "dashboard.prescription.fulfillment.delivery-pack",
  "dashboard.prescription.fulfillment.delivery-reassignment",
  "dashboard.prescription.fulfillment.pickup-collect",
  "dashboard.prescription.fulfillment.pickup-exception",
  "dashboard.prescription.fulfillment.pickup-ready",
  "dashboard.prescription.intake",
  "dashboard.prescription.operations",
  "dashboard.prescription.operations.delivery-zone",
  "dashboard.prescription.operations.incident-control",
  "dashboard.prescription.operations.incident-resolution",
  "dashboard.prescription.operations.manual-fee-review",
  "dashboard.prescription.operations.privacy-request",
  "dashboard.prescription.operations.privacy-retention",
  "dashboard.prescription.search",
  "dashboard.prescription.whatsapp",
  "dashboard.service.catalog-draft",
  "dashboard.service.catalog-graduation",
  "dashboard.service.intake",
  "dashboard.service.media-observation",
  "dashboard.service.message",
  "dashboard.service.report-scope",
  "dashboard.service.setup",
  "dashboard.staff.invite",
  "dashboard.store-conversation.moderation",
  "dashboard.store-conversation.assignment",
  "dashboard.store-conversation.filter",
  "dashboard.store-conversation.reply",
  "dashboard.store.setup",
] as const

const mobileRecipes = new Set([
  "mobile.business.create",
  "mobile.catalog.item",
  "mobile.catalog.options",
  "mobile.closeout",
  "mobile.customer.create",
  "mobile.customer.message",
  "mobile.inventory.stock-intake",
  "mobile.inventory.unit-conversion",
  "mobile.order.create",
  "mobile.order.payment",
  "mobile.order.reminder-settings",
  "mobile.service.job",
  "mobile.signup",
  "mobile.staff.invite",
])
const prerequisiteMobile = new Set([
  "mobile.catalog.setup-helper",
  "mobile.customer.guest-notification",
  "mobile.staff.onboarding",
])
const excludedMobile = new Set([
  "mobile.app-lock-pin",
  "mobile.domain.management",
  "mobile.catalog.filter",
  "mobile.customer.login",
  "mobile.login",
  "mobile.order.filter",
  "mobile.qa-authorization",
  "mobile.subscription",
  "mobile.verify-email",
])
const dashboardRecipes = new Set([
  "dashboard.catalog.item",
  "dashboard.inventory.operation",
  "dashboard.order.create",
  "dashboard.service.intake",
  "dashboard.service.message",
  "dashboard.staff.invite",
  "dashboard.store-conversation.assignment",
  "dashboard.store-conversation.reply",
])
const prerequisiteDashboard = new Set([
  "dashboard.booking.workspace",
  "dashboard.booking.availability",
  "dashboard.booking.resources",
  "dashboard.catalog.promotion",
  "dashboard.customer.channel-availability",
  "dashboard.customer.channel-connection",
  "dashboard.customer.channel-mode",
  "dashboard.customer.quote-approval",
  "dashboard.customer.quote-release",
  "dashboard.customer.store-binding",
  "dashboard.customer.team-routing",
  "dashboard.domain.external",
  "dashboard.service.catalog-draft",
  "dashboard.service.catalog-graduation",
  "dashboard.service.setup",
  "dashboard.store.setup",
  "dashboard.store-conversation.moderation",
])
const excludedDashboard = new Set([
  "dashboard.compliance.pharmacy",
  "dashboard.compliance.pharmacy.role",
  "dashboard.compliance.pharmacy.settings",
  "dashboard.domain.purchase",
  "dashboard.domain.purchase.owner",
  "dashboard.domain.purchase.search",
  "dashboard.prescription.fulfillment",
  "dashboard.prescription.fulfillment.delivery-courier",
  "dashboard.prescription.fulfillment.delivery-outcome",
  "dashboard.prescription.fulfillment.delivery-pack",
  "dashboard.prescription.fulfillment.delivery-reassignment",
  "dashboard.prescription.fulfillment.pickup-collect",
  "dashboard.prescription.fulfillment.pickup-exception",
  "dashboard.prescription.fulfillment.pickup-ready",
  "dashboard.prescription.intake",
  "dashboard.prescription.operations",
  "dashboard.prescription.operations.delivery-zone",
  "dashboard.prescription.operations.incident-control",
  "dashboard.prescription.operations.incident-resolution",
  "dashboard.prescription.operations.manual-fee-review",
  "dashboard.prescription.operations.privacy-request",
  "dashboard.prescription.operations.privacy-retention",
  "dashboard.prescription.search",
  "dashboard.prescription.whatsapp",
  "dashboard.service.media-observation",
  "dashboard.service.report-scope",
  "dashboard.store-conversation.filter",
])

export const QA_REACHABLE_RECIPE_IDS = [
  "marketing.lead",
  "signup.business",
  "signup.owner",
  "signup.workspace",
  ...mobileRecipes,
  ...dashboardRecipes,
] as const

export const QA_FORM_COVERAGE: readonly QaFormCoverageDeclaration[] = [
  { formId: "marketing.lead", kind: "recipe", surface: "marketing" },
  {
    formId: "marketing.login",
    kind: "excluded",
    reason: "Authentication secrets remain manual; use the QA profile chooser.",
    surface: "marketing",
  },
  {
    formId: "marketing.qa-authorization",
    kind: "excluded",
    reason:
      "The QA Domain and tester credential are authorization inputs, never fixtures.",
    surface: "marketing",
  },
  { formId: "signup.business", kind: "recipe", surface: "marketing" },
  {
    formId: "signup.owner",
    kind: "recipe",
    reason: "Identity only; password remains manual.",
    surface: "marketing",
  },
  { formId: "signup.workspace", kind: "recipe", surface: "marketing" },
  ...QA_MOBILE_FORM_INVENTORY.map(
    (formId): QaFormCoverageDeclaration => ({
      formId,
      kind: mobileRecipes.has(formId)
        ? "recipe"
        : prerequisiteMobile.has(formId)
          ? "prerequisite"
          : "excluded",
      reason: excludedMobile.has(formId)
        ? "Security, provider, or authorization inputs remain manual."
        : prerequisiteMobile.has(formId)
          ? "Requires an eligible parent record or workflow before fixture values can change."
          : undefined,
      surface: "mobile",
    }),
  ),
  ...QA_DASHBOARD_FORM_INVENTORY.map(
    (formId): QaFormCoverageDeclaration => ({
      formId,
      kind: dashboardRecipes.has(formId)
        ? "recipe"
        : prerequisiteDashboard.has(formId)
          ? "prerequisite"
          : "excluded",
      reason: excludedDashboard.has(formId)
        ? "Provider credentials, regulated decisions, private media, and irreversible effects are not Quick Filled."
        : prerequisiteDashboard.has(formId)
          ? "Requires an eligible server-backed record before draft values can change."
          : undefined,
      surface: "dashboard",
    }),
  ),
]

export function assertQaRecipeReachability(
  declarations: readonly QaFormCoverageDeclaration[] = QA_FORM_COVERAGE,
  reachableIds: readonly string[] = QA_REACHABLE_RECIPE_IDS,
) {
  const declaredRecipes = declarations
    .filter((entry) => entry.kind === "recipe")
    .map((entry) => entry.formId)
    .sort()
  const reachable = [...reachableIds].sort()
  if (JSON.stringify(declaredRecipes) !== JSON.stringify(reachable)) {
    throw new Error(
      `Invalid QA recipe reachability: ${JSON.stringify({ declaredRecipes, reachable })}`,
    )
  }
  return { recipes: reachable.length }
}
