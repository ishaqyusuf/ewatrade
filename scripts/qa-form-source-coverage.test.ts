import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  QA_FORM_COVERAGE,
  QA_REACHABLE_RECIPE_IDS,
} from "../packages/utils/src/qa-quick-fill"

type SourceCoverage = {
  formIds: readonly string[]
  source: string
}

type MobileSourceCoverage = {
  formIds?: readonly string[]
  reason?: string
  source: string
}

const MOBILE_FORM_SOURCE_COVERAGE: readonly MobileSourceCoverage[] = [
  {
    formIds: ["mobile.customer.login"],
    source: "apps/mobile/src/app/customer-account-login.tsx",
  },
  { formIds: ["mobile.login"], source: "apps/mobile/src/app/login.tsx" },
  { formIds: ["mobile.signup"], source: "apps/mobile/src/app/sign-up.tsx" },
  {
    formIds: ["mobile.staff.onboarding"],
    source: "apps/mobile/src/app/staff-onboarding.tsx",
  },
  {
    formIds: ["mobile.verify-email"],
    source: "apps/mobile/src/app/verify-email.tsx",
  },
  {
    formIds: ["mobile.order.filter"],
    source:
      "apps/mobile/src/components/mobile/admin-tabs/admin-orders-screen.tsx",
  },
  {
    reason: "Reusable search control; it does not own a submitted draft.",
    source: "apps/mobile/src/components/mobile/bottom-search-footer.tsx",
  },
  {
    formIds: ["mobile.catalog.filter"],
    source: "apps/mobile/src/components/mobile/catalog-items-sheet.tsx",
  },
  {
    formIds: ["mobile.catalog.setup-helper"],
    source: "apps/mobile/src/components/mobile/catalog-setup-helper-picker.tsx",
  },
  {
    formIds: ["mobile.catalog.options"],
    source: "apps/mobile/src/components/mobile/catalog-variant-manager.tsx",
  },
  {
    formIds: ["mobile.closeout"],
    source: "apps/mobile/src/components/mobile/closeout-sheet.tsx",
  },
  {
    formIds: ["mobile.order.payment"],
    source: "apps/mobile/src/components/mobile/commercial-order-screen.tsx",
  },
  {
    formIds: ["mobile.customer.create"],
    source: "apps/mobile/src/components/mobile/create-sale-customer-sheet.tsx",
  },
  {
    formIds: ["mobile.order.create"],
    source: "apps/mobile/src/components/mobile/create-sale-sheet.tsx",
  },
  {
    reason: "Customer-shell account adoption is outside Business QA tooling.",
    source:
      "apps/mobile/src/components/mobile/customer-conversations/customer-account-invitation-message.tsx",
  },
  {
    reason: "Customer-shell messaging is outside Business QA tooling.",
    source:
      "apps/mobile/src/components/mobile/customer-conversations/customer-conversation-composer.tsx",
  },
  {
    reason: "Customer-shell guest notification is outside Business QA tooling.",
    source:
      "apps/mobile/src/components/mobile/customer-conversations/customer-notification-guest-form.tsx",
  },
  {
    reason: "Internal component gallery; it is not a product form.",
    source:
      "apps/mobile/src/components/mobile/design-system-playground/index.tsx",
  },
  {
    reason: "Static design fixture; it is not a reachable product form.",
    source:
      "apps/mobile/src/components/mobile/design-system/designs/design-01/design-01-customers-screen.tsx",
  },
  {
    reason: "Static design fixture; it is not a reachable product form.",
    source:
      "apps/mobile/src/components/mobile/design-system/designs/design-01/design-01-orders-screen.tsx",
  },
  {
    formIds: ["mobile.domain.management"],
    source:
      "apps/mobile/src/components/mobile/domains/domain-management-content.tsx",
  },
  {
    formIds: ["mobile.domain.management"],
    source: "apps/mobile/src/components/mobile/domains/domain-owner-form.tsx",
  },
  {
    reason: "Reusable field primitive; the parent component owns coverage.",
    source: "apps/mobile/src/components/mobile/form-field.tsx",
  },
  {
    reason: "Reusable composer primitive; the parent component owns coverage.",
    source: "apps/mobile/src/components/mobile/keyboard-inline-composer.tsx",
  },
  {
    reason: "Reusable currency input; the parent component owns coverage.",
    source: "apps/mobile/src/components/mobile/money-field.tsx",
  },
  {
    formIds: ["mobile.business.create"],
    source:
      "apps/mobile/src/components/mobile/new-business-onboarding-screen.tsx",
  },
  {
    reason: "Reusable OTP input; verification secrets stay manual.",
    source: "apps/mobile/src/components/mobile/otp-input.tsx",
  },
  {
    reason: "Business chooser search is not a submitted product form.",
    source: "apps/mobile/src/components/mobile/qa-account-chooser.tsx",
  },
  {
    formIds: ["mobile.qa-authorization"],
    source: "apps/mobile/src/components/mobile/qa-authorization-sheet.tsx",
  },
  {
    reason: "Reusable quantity input; the parent component owns coverage.",
    source: "apps/mobile/src/components/mobile/quantity-stepper.tsx",
  },
  {
    formIds: ["mobile.service.job", "mobile.customer.message"],
    source: "apps/mobile/src/components/mobile/service-jobs-sheet.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source: "apps/mobile/src/components/mobile/simple-catalog-item-screen.tsx",
  },
  {
    formIds: ["mobile.staff.invite"],
    source: "apps/mobile/src/components/mobile/staff-invite-sheet.tsx",
  },
  {
    formIds: ["mobile.inventory.stock-intake"],
    source: "apps/mobile/src/components/mobile/stock-intake-sheet.tsx",
  },
  {
    formIds: ["mobile.inventory.unit-conversion"],
    source: "apps/mobile/src/components/mobile/unit-conversion-sheet.tsx",
  },
  {
    reason: "Reusable input primitive; the parent component owns coverage.",
    source: "apps/mobile/src/components/ui/Input.tsx",
  },
  {
    reason: "Reusable input primitive; the parent component owns coverage.",
    source: "apps/mobile/src/components/ui/input-2.tsx",
  },
  {
    reason: "Reusable textarea primitive; the parent component owns coverage.",
    source: "apps/mobile/src/components/ui/textarea.tsx",
  },
]

const RECIPE_SOURCE_OWNERS: Record<
  (typeof QA_REACHABLE_RECIPE_IDS)[number],
  string
> = {
  "dashboard.catalog.item":
    "apps/dashboard/src/components/catalog-item/form.tsx",
  "dashboard.inventory.operation":
    "apps/dashboard/src/components/inventory/inventory-operation-form.tsx",
  "dashboard.order.create":
    "apps/dashboard/src/components/orders/order-form.tsx",
  "dashboard.service.intake":
    "apps/dashboard/src/components/service-work/service-intake-form.tsx",
  "dashboard.service.message":
    "apps/dashboard/src/components/tables/service-work/data-table.tsx",
  "dashboard.staff.invite":
    "apps/dashboard/src/components/dashboard/staff-page.tsx",
  "dashboard.store-conversation.assignment":
    "apps/dashboard/src/components/sheets/store-conversation-sheet.tsx",
  "dashboard.store-conversation.reply":
    "apps/dashboard/src/components/sheets/store-conversation-sheet.tsx",
  "marketing.lead": "apps/marketing/src/components/lead-capture-form.tsx",
  "mobile.business.create":
    "apps/mobile/src/components/mobile/new-business-onboarding-screen.tsx",
  "mobile.catalog.item":
    "apps/mobile/src/components/mobile/simple-catalog-item-screen.tsx",
  "mobile.catalog.options":
    "apps/mobile/src/components/mobile/catalog-variant-manager.tsx",
  "mobile.closeout": "apps/mobile/src/components/mobile/closeout-sheet.tsx",
  "mobile.customer.create":
    "apps/mobile/src/components/mobile/create-sale-customer-sheet.tsx",
  "mobile.customer.message":
    "apps/mobile/src/components/mobile/service-jobs-sheet.tsx",
  "mobile.inventory.stock-intake":
    "apps/mobile/src/components/mobile/stock-intake-sheet.tsx",
  "mobile.inventory.unit-conversion":
    "apps/mobile/src/components/mobile/unit-conversion-sheet.tsx",
  "mobile.order.create":
    "apps/mobile/src/components/mobile/create-sale-sheet.tsx",
  "mobile.order.payment":
    "apps/mobile/src/components/mobile/commercial-order-screen.tsx",
  "mobile.order.reminder-settings":
    "apps/mobile/src/app/order-reminder-settings-modal.tsx",
  "mobile.service.job":
    "apps/mobile/src/components/mobile/service-jobs-sheet.tsx",
  "mobile.signup": "apps/mobile/src/app/sign-up.tsx",
  "mobile.staff.invite":
    "apps/mobile/src/components/mobile/staff-invite-sheet.tsx",
  "signup.business": "apps/marketing/src/components/signup/step-business.tsx",
  "signup.owner": "apps/marketing/src/components/signup/step-owner.tsx",
  "signup.workspace": "apps/marketing/src/components/signup/step-workspace.tsx",
}

const WEB_FORM_SOURCE_COVERAGE: readonly SourceCoverage[] = [
  {
    formIds: ["dashboard.store.setup"],
    source: "apps/dashboard/src/app/setup/page.tsx",
  },
  {
    formIds: ["dashboard.catalog.item"],
    source: "apps/dashboard/src/components/catalog-item/form.tsx",
  },
  {
    formIds: [
      "dashboard.compliance.pharmacy.settings",
      "dashboard.compliance.pharmacy.role",
    ],
    source:
      "apps/dashboard/src/components/compliance/pharmacy-compliance-setup.tsx",
  },
  {
    formIds: ["dashboard.customer.channel-connection"],
    source:
      "apps/dashboard/src/components/customer-channels/connection-form.tsx",
  },
  {
    formIds: ["dashboard.customer.channel-availability"],
    source:
      "apps/dashboard/src/components/customer-channels/conversation-availability-form.tsx",
  },
  {
    formIds: ["dashboard.customer.channel-mode"],
    source:
      "apps/dashboard/src/components/customer-channels/conversation-mode-form.tsx",
  },
  {
    formIds: ["dashboard.customer.quote-approval"],
    source:
      "apps/dashboard/src/components/customer-channels/quote-approval-form.tsx",
  },
  {
    formIds: ["dashboard.customer.quote-release"],
    source:
      "apps/dashboard/src/components/customer-channels/quote-release-policy-form.tsx",
  },
  {
    formIds: ["dashboard.customer.store-binding"],
    source:
      "apps/dashboard/src/components/customer-channels/store-binding-form.tsx",
  },
  {
    formIds: ["dashboard.customer.team-routing"],
    source:
      "apps/dashboard/src/components/customer-channels/team-routing-form.tsx",
  },
  {
    formIds: ["dashboard.staff.invite"],
    source: "apps/dashboard/src/components/dashboard/staff-page.tsx",
  },
  {
    formIds: [
      "dashboard.domain.purchase.owner",
      "dashboard.domain.purchase.search",
    ],
    source: "apps/dashboard/src/components/domains/domain-purchase-flow.tsx",
  },
  {
    formIds: ["dashboard.domain.external"],
    source: "apps/dashboard/src/components/domains/external-domain-flow.tsx",
  },
  {
    formIds: [
      "dashboard.prescription.fulfillment.pickup-ready",
      "dashboard.prescription.fulfillment.pickup-collect",
      "dashboard.prescription.fulfillment.pickup-exception",
      "dashboard.prescription.fulfillment.delivery-pack",
      "dashboard.prescription.fulfillment.delivery-courier",
      "dashboard.prescription.fulfillment.delivery-outcome",
      "dashboard.prescription.fulfillment.delivery-reassignment",
    ],
    source:
      "apps/dashboard/src/components/prescriptions/prescription-fulfillment-panel.tsx",
  },
  {
    formIds: ["dashboard.prescription.intake"],
    source:
      "apps/dashboard/src/components/prescriptions/prescription-intake-form.tsx",
  },
  {
    formIds: [
      "dashboard.prescription.operations.delivery-zone",
      "dashboard.prescription.operations.manual-fee-review",
      "dashboard.prescription.operations.privacy-retention",
      "dashboard.prescription.operations.privacy-request",
      "dashboard.prescription.operations.incident-control",
      "dashboard.prescription.operations.incident-resolution",
    ],
    source:
      "apps/dashboard/src/components/prescriptions/prescription-operations-setup.tsx",
  },
  {
    formIds: ["dashboard.prescription.search"],
    source:
      "apps/dashboard/src/components/prescriptions/prescription-search-filter.tsx",
  },
  {
    formIds: ["dashboard.prescription.whatsapp"],
    source:
      "apps/dashboard/src/components/prescriptions/whatsapp-connection-setup.tsx",
  },
  {
    formIds: ["dashboard.booking.availability", "dashboard.booking.resources"],
    source:
      "apps/dashboard/src/components/service-commerce/booking/booking-workspace.tsx",
  },
  {
    formIds: ["dashboard.service.catalog-draft"],
    source:
      "apps/dashboard/src/components/service-commerce/catalog-adoption/catalog-draft-form.tsx",
  },
  {
    formIds: ["dashboard.service.catalog-graduation"],
    source:
      "apps/dashboard/src/components/service-commerce/catalog-adoption/catalog-graduation-form.tsx",
  },
  {
    formIds: ["dashboard.catalog.promotion"],
    source:
      "apps/dashboard/src/components/service-commerce/catalog-adoption/catalog-price-promotion-form.tsx",
  },
  {
    formIds: ["dashboard.service.media-observation"],
    source:
      "apps/dashboard/src/components/service-commerce/media/observation-form.tsx",
  },
  {
    formIds: ["dashboard.service.report-scope"],
    source:
      "apps/dashboard/src/components/service-commerce/reports/service-commerce-report-workspace.tsx",
  },
  {
    formIds: ["dashboard.service.setup"],
    source:
      "apps/dashboard/src/components/service-commerce/service-commerce-setup.tsx",
  },
  {
    formIds: [
      "dashboard.store-conversation.reply",
      "dashboard.store-conversation.assignment",
    ],
    source: "apps/dashboard/src/components/sheets/store-conversation-sheet.tsx",
  },
  {
    formIds: ["dashboard.store-conversation.moderation"],
    source:
      "apps/dashboard/src/components/store-conversations/conversation-moderation-form.tsx",
  },
  {
    formIds: ["dashboard.store-conversation.filter"],
    source:
      "apps/dashboard/src/components/tables/store-conversations/table-header.tsx",
  },
  {
    formIds: ["marketing.login"],
    source: "apps/marketing/src/app/login/page.tsx",
  },
  {
    formIds: ["marketing.lead"],
    source: "apps/marketing/src/components/lead-capture-form.tsx",
  },
  {
    formIds: ["marketing.qa-authorization"],
    source: "apps/marketing/src/components/qa/qa-web-accelerator.tsx",
  },
  {
    formIds: ["signup.business"],
    source: "apps/marketing/src/components/signup/step-business.tsx",
  },
  {
    formIds: ["signup.owner"],
    source: "apps/marketing/src/components/signup/step-owner.tsx",
  },
  {
    formIds: ["signup.workspace"],
    source: "apps/marketing/src/components/signup/step-workspace.tsx",
  },
]

const repoRoot = resolve(import.meta.dir, "..")

function countHtmlForms(source: string) {
  return source.match(/<form\b/g)?.length ?? 0
}

function discoverWebFormSources() {
  const glob = new Bun.Glob("apps/{dashboard,marketing}/src/**/*.tsx")
  return [...glob.scanSync({ cwd: repoRoot })]
    .filter((source) =>
      readFileSync(resolve(repoRoot, source), "utf8").includes("<form"),
    )
    .sort()
}

function discoverMobileFormSources() {
  const glob = new Bun.Glob("apps/mobile/src/**/*.tsx")
  const fieldPattern =
    /<(?:FormField|Input|MoneyField|OtpInput|QuantityStepper|TextInput|Textarea)\b/
  return [...glob.scanSync({ cwd: repoRoot })]
    .filter((source) =>
      fieldPattern.test(readFileSync(resolve(repoRoot, source), "utf8")),
    )
    .sort()
}

describe("QA website source-form coverage", () => {
  test("requires every current form-bearing source file to be classified", () => {
    expect(
      WEB_FORM_SOURCE_COVERAGE.map((entry) => entry.source).sort(),
    ).toEqual(discoverWebFormSources())
  })

  test("requires every physical form and mapped logical form to stay declared", () => {
    const declared = new Set(QA_FORM_COVERAGE.map((entry) => entry.formId))
    for (const entry of WEB_FORM_SOURCE_COVERAGE) {
      const source = readFileSync(resolve(repoRoot, entry.source), "utf8")
      expect(countHtmlForms(source)).toBe(entry.formIds.length)
      expect(entry.formIds.every((formId) => declared.has(formId))).toBe(true)
    }
  })
})

describe("QA mobile source-form coverage", () => {
  test("requires every current field-bearing source file to be classified", () => {
    expect(
      MOBILE_FORM_SOURCE_COVERAGE.map((entry) => entry.source).sort(),
    ).toEqual(discoverMobileFormSources())
  })

  test("requires an inventoried form or an explicit non-form boundary", () => {
    const declared = new Set(QA_FORM_COVERAGE.map((entry) => entry.formId))
    for (const entry of MOBILE_FORM_SOURCE_COVERAGE) {
      expect(Boolean(entry.reason) !== Boolean(entry.formIds?.length)).toBe(
        true,
      )
      expect(
        entry.formIds?.every((formId) => declared.has(formId)) ?? true,
      ).toBe(true)
    }
  })
})

describe("QA recipe source reachability", () => {
  test("requires every declared recipe id in exactly one client source file", () => {
    expect(Object.keys(RECIPE_SOURCE_OWNERS).sort()).toEqual(
      [...QA_REACHABLE_RECIPE_IDS].sort(),
    )
    for (const formId of QA_REACHABLE_RECIPE_IDS) {
      const source = RECIPE_SOURCE_OWNERS[formId]
      const content = readFileSync(resolve(repoRoot, source), "utf8")
      expect(content).toMatch(/Qa(?:Dashboard)?QuickFill/)
    }
  })

  test("keeps marker-bearing labels inside production-aliased controls", () => {
    for (const source of new Set(Object.values(RECIPE_SOURCE_OWNERS))) {
      const content = readFileSync(resolve(repoRoot, source), "utf8")
      expect(content).not.toMatch(/label=["']Quick Fill|["']QA accelerator/)
    }
  })
})
