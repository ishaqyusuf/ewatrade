import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  QA_FORM_COVERAGE,
  QA_REACHABLE_RECIPE_IDS,
} from "../packages/utils/src/qa-quick-fill"

type SourceCoverage = {
  formIds?: readonly string[]
  reason?: string
  source: string
}

const MOBILE_FORM_SOURCE_COVERAGE: readonly SourceCoverage[] = [
  {
    reason:
      "QA auth preview modal; credentials and verification codes stay manual.",
    source: "apps/mobile/src/app/qa-auth-onboarding-modal.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source:
      "apps/mobile/src/components/mobile/appearances/classic/catalog-setup.tsx",
  },
  {
    formIds: ["mobile.closeout"],
    source:
      "apps/mobile/src/components/mobile/appearances/classic/closeout-screen.tsx",
  },
  {
    formIds: ["mobile.order.create"],
    source:
      "apps/mobile/src/components/mobile/appearances/classic/create-sale.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source:
      "apps/mobile/src/components/mobile/appearances/classic/selling-unit-editor.tsx",
  },
  {
    formIds: ["mobile.staff.onboarding"],
    source:
      "apps/mobile/src/components/mobile/appearances/classic/staff-onboarding-screen.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source:
      "apps/mobile/src/components/mobile/appearances/market-day/catalog-setup.tsx",
  },
  {
    formIds: ["mobile.closeout"],
    source:
      "apps/mobile/src/components/mobile/appearances/market-day/closeout-screen.tsx",
  },
  {
    formIds: ["mobile.order.create"],
    source:
      "apps/mobile/src/components/mobile/appearances/market-day/create-sale.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source:
      "apps/mobile/src/components/mobile/appearances/market-day/selling-unit-editor.tsx",
  },
  {
    formIds: ["mobile.staff.onboarding"],
    source:
      "apps/mobile/src/components/mobile/appearances/market-day/staff-onboarding-screen.tsx",
  },
  {
    reason: "Reusable barcode input; the parent component owns coverage.",
    source: "apps/mobile/src/components/mobile/barcode-field.tsx",
  },
  {
    reason: "Reusable search control; it does not own a submitted draft.",
    source: "apps/mobile/src/components/mobile/bottom-search-footer.tsx",
  },
  {
    reason: "Business switcher search is not a submitted product form.",
    source:
      "apps/mobile/src/components/mobile/business-switch/business-switch-sheet-footer.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source:
      "apps/mobile/src/components/mobile/catalog-setup/catalog-category-editor.tsx",
  },
  {
    formIds: ["mobile.catalog.setup-helper"],
    source:
      "apps/mobile/src/components/mobile/catalog-setup/catalog-helper-picker.tsx",
  },
  {
    reason: "Illustration library search; it does not own a submitted draft.",
    source:
      "apps/mobile/src/components/mobile/catalog-setup/catalog-illustration-library.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source:
      "apps/mobile/src/components/mobile/catalog-setup/catalog-inventory-codes.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source:
      "apps/mobile/src/components/mobile/catalog-setup/catalog-setup-details.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source:
      "apps/mobile/src/components/mobile/catalog-setup/catalog-setup-essentials.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source:
      "apps/mobile/src/components/mobile/catalog-setup/catalog-setup-service.tsx",
  },
  {
    formIds: ["mobile.catalog.item"],
    source:
      "apps/mobile/src/components/mobile/catalog-setup/catalog-setup-view.tsx",
  },
  {
    formIds: ["mobile.catalog.options"],
    source:
      "apps/mobile/src/components/mobile/catalog-setup/catalog-variant-basics.tsx",
  },
  {
    formIds: ["mobile.catalog.options"],
    source:
      "apps/mobile/src/components/mobile/catalog-setup/catalog-variant-details.tsx",
  },
  {
    formIds: ["mobile.catalog.filter"],
    source: "apps/mobile/src/components/mobile/catalog/catalog-screen.tsx",
  },
  {
    formIds: ["mobile.closeout"],
    source: "apps/mobile/src/components/mobile/closeout/closeout-screen.tsx",
  },
  {
    reason:
      "Reusable country picker search; the parent component owns coverage.",
    source: "apps/mobile/src/components/mobile/country-select.tsx",
  },
  {
    formIds: ["mobile.customer.create"],
    source: "apps/mobile/src/components/mobile/create-sale-customer-sheet.tsx",
  },
  {
    formIds: ["mobile.order.create"],
    source:
      "apps/mobile/src/components/mobile/create-sale/create-sale-review.tsx",
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
    formIds: ["mobile.customer-ledger.entry"],
    source:
      "apps/mobile/src/components/mobile/customer-ledger/customer-ledger-command-form.tsx",
  },
  {
    reason: "Customer directory search is not a submitted product form.",
    source:
      "apps/mobile/src/components/mobile/customer-ledger/customer-ledger-directory.tsx",
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
    reason:
      "Finance report date scope is a read filter, not a submitted draft.",
    source:
      "apps/mobile/src/components/mobile/finance-reports/finance-reports-screen.tsx",
  },
  {
    reason:
      "Finance account date scope is a read filter, not a submitted draft.",
    source:
      "apps/mobile/src/components/mobile/finance/finance-account-screen.tsx",
  },
  {
    reason: "Reusable date field; the parent component owns coverage.",
    source:
      "apps/mobile/src/components/mobile/finance/finance-bank-date-field.tsx",
  },
  {
    formIds: ["mobile.finance.bank-import"],
    source:
      "apps/mobile/src/components/mobile/finance/finance-bank-import-screen.tsx",
  },
  {
    formIds: ["mobile.finance.correction"],
    source:
      "apps/mobile/src/components/mobile/finance/finance-cash-action-form.tsx",
  },
  {
    formIds: ["mobile.finance.cash-count"],
    source:
      "apps/mobile/src/components/mobile/finance/finance-cash-count-form.tsx",
  },
  {
    formIds: ["mobile.finance.bill-payment", "mobile.finance.correction"],
    source:
      "apps/mobile/src/components/mobile/finance/finance-expense-forms.tsx",
  },
  {
    formIds: ["mobile.finance.money"],
    source: "apps/mobile/src/components/mobile/finance/finance-money-form.tsx",
  },
  {
    formIds: ["mobile.finance.correction"],
    source:
      "apps/mobile/src/components/mobile/finance/finance-movement-screen.tsx",
  },
  {
    formIds: ["mobile.finance.period"],
    source:
      "apps/mobile/src/components/mobile/finance/finance-period-screen.tsx",
  },
  {
    formIds: ["mobile.finance.expense"],
    source: "apps/mobile/src/components/mobile/finance/finance-screen.tsx",
  },
  {
    formIds: [
      "mobile.finance.supplier",
      "mobile.finance.supplier-entry",
      "mobile.finance.correction",
    ],
    source:
      "apps/mobile/src/components/mobile/finance/supplier-command-form.tsx",
  },
  {
    reason:
      "Supplier balance as-of date is a read filter, not a submitted draft.",
    source:
      "apps/mobile/src/components/mobile/finance/supplier-finance-screen.tsx",
  },
  {
    formIds: ["mobile.finance.supplier-purchase"],
    source:
      "apps/mobile/src/components/mobile/finance/supplier-purchase-recognition.tsx",
  },
  {
    formIds: ["mobile.finance.supplier-purchase"],
    source:
      "apps/mobile/src/components/mobile/finance/supplier-purchase-settlement-form.tsx",
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
    formIds: ["mobile.login"],
    source: "apps/mobile/src/components/mobile/login/login-screen.tsx",
  },
  {
    reason: "Reusable currency input; the parent component owns coverage.",
    source: "apps/mobile/src/components/mobile/money-field.tsx",
  },
  {
    formIds: ["mobile.business.create"],
    source:
      "apps/mobile/src/components/mobile/new-business/new-business-fields.tsx",
  },
  {
    formIds: ["mobile.order.payment"],
    source:
      "apps/mobile/src/components/mobile/order-detail/order-action-sheets.tsx",
  },
  {
    formIds: ["mobile.order.filter"],
    source: "apps/mobile/src/components/mobile/orders/orders-screen.tsx",
  },
  {
    formIds: ["mobile.order.filter"],
    source:
      "apps/mobile/src/components/mobile/orders/sales-rep-orders-screen.tsx",
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
    formIds: ["mobile.receipt.settings"],
    source:
      "apps/mobile/src/components/mobile/receipts/receipt-settings-screen.tsx",
  },
  {
    formIds: ["mobile.service.job"],
    source:
      "apps/mobile/src/components/mobile/service-jobs/service-intake-form.tsx",
  },
  {
    formIds: ["mobile.service.job", "mobile.customer.message"],
    source:
      "apps/mobile/src/components/mobile/service-jobs/service-job-workspace.tsx",
  },
  {
    formIds: ["mobile.service.job"],
    source:
      "apps/mobile/src/components/mobile/service-jobs/service-offering-choices.tsx",
  },
  {
    formIds: ["mobile.service.job"],
    source:
      "apps/mobile/src/components/mobile/service-jobs/service-payment-sheet.tsx",
  },
  {
    formIds: ["mobile.service.job"],
    source:
      "apps/mobile/src/components/mobile/service-jobs/service-status-sheet.tsx",
  },
  {
    formIds: ["mobile.customer.message"],
    source:
      "apps/mobile/src/components/mobile/service-jobs/service-text-sheet.tsx",
  },
  {
    formIds: ["mobile.service.job"],
    source:
      "apps/mobile/src/components/mobile/service-jobs/service-work-lines.tsx",
  },
  {
    formIds: ["mobile.signup"],
    source: "apps/mobile/src/components/mobile/sign-up/sign-up-screen.tsx",
  },
  {
    formIds: ["mobile.staff.invite"],
    source:
      "apps/mobile/src/components/mobile/staff/staff-invitation-sheet.tsx",
  },
  {
    formIds: ["mobile.inventory.stock-intake"],
    source:
      "apps/mobile/src/components/mobile/stock-intake/stock-categories-input.tsx",
  },
  {
    formIds: ["mobile.inventory.stock-intake"],
    source:
      "apps/mobile/src/components/mobile/stock-intake/stock-intake-fields.tsx",
  },
  {
    formIds: ["mobile.inventory.unit-conversion"],
    source:
      "apps/mobile/src/components/mobile/unit-conversion/conversion-balance-choices.tsx",
  },
  {
    formIds: ["mobile.inventory.unit-conversion"],
    source:
      "apps/mobile/src/components/mobile/unit-conversion/unit-conversion-screen.tsx",
  },
  {
    formIds: ["mobile.verify-email"],
    source:
      "apps/mobile/src/components/mobile/verify-email/verify-email-screen.tsx",
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
  "dashboard.finance.expense":
    "apps/dashboard/src/components/finance/expense-form.tsx",
  "dashboard.finance.supplier":
    "apps/dashboard/src/components/finance/supplier-form.tsx",
  "dashboard.inventory.operation":
    "apps/dashboard/src/components/inventory/inventory-operation-form.tsx",
  "dashboard.order.create":
    "apps/dashboard/src/components/orders/order-form.tsx",
  "dashboard.service.intake":
    "apps/dashboard/src/components/service-work/service-intake-form.tsx",
  "dashboard.service.message":
    "apps/dashboard/src/components/tables/service-work/bottom-bar.tsx",
  "dashboard.staff.invite":
    "apps/dashboard/src/components/staff/staff-invite-content.tsx",
  "dashboard.store-conversation.assignment":
    "apps/dashboard/src/components/store-conversations/store-conversation-sheet-content.tsx",
  "dashboard.store-conversation.reply":
    "apps/dashboard/src/components/store-conversations/store-conversation-sheet-content.tsx",
  "marketing.lead": "apps/marketing/src/components/lead-capture-form.tsx",
  "mobile.business.create":
    "apps/mobile/src/components/mobile/new-business/new-business-screen.tsx",
  "mobile.catalog.item":
    "apps/mobile/src/components/mobile/catalog-setup/catalog-setup-view.tsx",
  "mobile.catalog.options":
    "apps/mobile/src/components/mobile/catalog-setup/catalog-variant-fields.tsx",
  "mobile.closeout":
    "apps/mobile/src/components/mobile/closeout/closeout-screen.tsx",
  "mobile.customer.create":
    "apps/mobile/src/components/mobile/create-sale-customer-sheet.tsx",
  "mobile.customer.message":
    "apps/mobile/src/components/mobile/service-jobs/service-text-sheet.tsx",
  "mobile.finance.expense":
    "apps/mobile/src/components/mobile/finance/finance-screen.tsx",
  "mobile.finance.supplier":
    "apps/mobile/src/components/mobile/finance/supplier-command-form.tsx",
  "mobile.inventory.stock-intake":
    "apps/mobile/src/components/mobile/stock-intake/stock-intake-screen.tsx",
  "mobile.inventory.unit-conversion":
    "apps/mobile/src/components/mobile/unit-conversion/unit-conversion-screen.tsx",
  "mobile.order.create":
    "apps/mobile/src/components/mobile/create-sale/create-sale-items.tsx",
  "mobile.order.payment":
    "apps/mobile/src/components/mobile/order-detail/order-detail-screen.tsx",
  "mobile.order.reminder-settings":
    "apps/mobile/src/app/order-reminder-settings-modal.tsx",
  "mobile.service.job":
    "apps/mobile/src/components/mobile/service-jobs/service-intake-form.tsx",
  "mobile.signup":
    "apps/mobile/src/components/mobile/sign-up/sign-up-screen.tsx",
  "mobile.staff.invite":
    "apps/mobile/src/components/mobile/staff/staff-invitation-sheet.tsx",
  "signup.business":
    "packages/onboarding/src/components/signup/step-business.tsx",
  "signup.owner": "packages/onboarding/src/components/signup/step-owner.tsx",
  "signup.workspace":
    "packages/onboarding/src/components/signup/step-workspace.tsx",
}

const WEB_FORM_SOURCE_COVERAGE: readonly SourceCoverage[] = [
  {
    formIds: ["marketing.login"],
    source: "apps/dashboard/src/components/auth/login-form.tsx",
  },
  {
    reason: "Staff activation verifies identity with a code; it stays manual.",
    source: "apps/dashboard/src/components/auth/staff-onboarding-form.tsx",
  },
  {
    formIds: ["dashboard.store.setup"],
    source: "apps/dashboard/src/components/auth/store-setup-form.tsx",
  },
  {
    formIds: ["dashboard.catalog.item"],
    source: "apps/dashboard/src/components/catalog-item/form.tsx",
  },
  {
    reason:
      "Single usage choice on an existing item; not inventoried for QA Quick Fill.",
    source: "apps/dashboard/src/components/catalog-item/product-usage-form.tsx",
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
    formIds: ["dashboard.customer-ledger.entry"],
    source:
      "apps/dashboard/src/components/customer-ledger/forms/command-form.tsx",
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
    formIds: ["dashboard.finance.account"],
    source: "apps/dashboard/src/components/finance/account-form.tsx",
  },
  {
    formIds: ["dashboard.finance.bank-import"],
    source: "apps/dashboard/src/components/finance/bank-import-form.tsx",
  },
  {
    formIds: ["dashboard.finance.bank-match"],
    source: "apps/dashboard/src/components/finance/bank-match-form.tsx",
  },
  {
    formIds: ["dashboard.finance.bank-correction"],
    source:
      "apps/dashboard/src/components/finance/bank-owned-correction-form.tsx",
  },
  {
    formIds: ["dashboard.finance.bill-correction"],
    source: "apps/dashboard/src/components/finance/bill-correction-form.tsx",
  },
  {
    formIds: ["dashboard.finance.bill-payment"],
    source: "apps/dashboard/src/components/finance/bill-payment-form.tsx",
  },
  {
    formIds: ["dashboard.finance.cash-adjustment"],
    source: "apps/dashboard/src/components/finance/cash-adjustment-form.tsx",
  },
  {
    formIds: ["dashboard.finance.cash-adjustment-reversal"],
    source:
      "apps/dashboard/src/components/finance/cash-adjustment-reversal-form.tsx",
  },
  {
    formIds: ["dashboard.finance.cash-count"],
    source: "apps/dashboard/src/components/finance/cash-count-form.tsx",
  },
  {
    formIds: ["dashboard.finance.expense"],
    source: "apps/dashboard/src/components/finance/expense-form.tsx",
  },
  {
    formIds: ["dashboard.finance.money"],
    source: "apps/dashboard/src/components/finance/money-form.tsx",
  },
  {
    formIds: ["dashboard.finance.money-reversal"],
    source: "apps/dashboard/src/components/finance/money-reversal-form.tsx",
  },
  {
    formIds: ["dashboard.finance.period"],
    source: "apps/dashboard/src/components/finance/period-form.tsx",
  },
  {
    formIds: ["dashboard.finance.setup"],
    source: "apps/dashboard/src/components/finance/setup-form.tsx",
  },
  {
    formIds: ["dashboard.finance.supplier-entry"],
    source: "apps/dashboard/src/components/finance/supplier-entry-form.tsx",
  },
  {
    formIds: ["dashboard.finance.supplier"],
    source: "apps/dashboard/src/components/finance/supplier-form.tsx",
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
    formIds: ["dashboard.prescription.whatsapp"],
    source:
      "apps/dashboard/src/components/prescriptions/whatsapp-connection-setup.tsx",
  },
  {
    reason:
      "QA profile chooser; the QA domain and credentials are never fixture data.",
    source: "apps/dashboard/src/components/qa/qa-login-entry.tsx",
  },
  {
    formIds: ["dashboard.receipt.settings"],
    source: "apps/dashboard/src/components/receipts/settings-form.tsx",
  },
  {
    reason:
      "Reusable search form; parent filters such as dashboard.prescription.search and dashboard.store-conversation.filter own coverage.",
    source: "apps/dashboard/src/components/search-field.tsx",
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
    formIds: ["dashboard.service.setup"],
    source:
      "apps/dashboard/src/components/service-commerce/service-commerce-setup.tsx",
  },
  {
    reason:
      "Setup assistant chat is free-form AI input, not a fixture-backed form.",
    source: "apps/dashboard/src/components/setup-assistant/setup-chat.tsx",
  },
  {
    reason:
      "Reviews an assistant-generated draft; values come from the assistant.",
    source:
      "apps/dashboard/src/components/setup-assistant/setup-draft-card.tsx",
  },
  {
    reason:
      "Staff access changes are authorization decisions; they stay manual.",
    source: "apps/dashboard/src/components/staff/manage-staff-access-modal.tsx",
  },
  {
    formIds: ["dashboard.staff.invite"],
    source: "apps/dashboard/src/components/staff/staff-invite-content.tsx",
  },
  {
    formIds: ["dashboard.store-conversation.moderation"],
    source:
      "apps/dashboard/src/components/store-conversations/conversation-moderation-form.tsx",
  },
  {
    reason:
      "Abuse reports describe real conversations; they are never Quick Filled.",
    source:
      "apps/dashboard/src/components/store-conversations/conversation-report-form.tsx",
  },
  {
    formIds: [
      "dashboard.store-conversation.reply",
      "dashboard.store-conversation.assignment",
    ],
    source:
      "apps/dashboard/src/components/store-conversations/store-conversation-sheet-content.tsx",
  },
  {
    reason: "Additional-store creation is not inventoried for QA Quick Fill.",
    source: "apps/dashboard/src/components/stores/create-store-form.tsx",
  },
  {
    formIds: ["marketing.lead"],
    source: "apps/marketing/src/components/lead-capture-form.tsx",
  },
  {
    reason:
      "Account deletion requests are irreversible and code-verified; they stay manual.",
    source:
      "apps/marketing/src/components/legal/external-deletion-request-form.tsx",
  },
  {
    formIds: ["marketing.qa-authorization"],
    source: "packages/onboarding/src/components/qa/qa-web-accelerator.tsx",
  },
  {
    formIds: ["signup.business"],
    source: "packages/onboarding/src/components/signup/step-business.tsx",
  },
  {
    reason:
      "Legal acceptance must be given by the account owner; it stays manual.",
    source: "packages/onboarding/src/components/signup/step-legal.tsx",
  },
  {
    formIds: ["signup.owner"],
    source: "packages/onboarding/src/components/signup/step-owner.tsx",
  },
  {
    formIds: ["signup.workspace"],
    source: "packages/onboarding/src/components/signup/step-workspace.tsx",
  },
]

const repoRoot = resolve(import.meta.dir, "..")

function countHtmlForms(source: string) {
  return source.match(/<form\b/g)?.length ?? 0
}

function discoverWebFormSources() {
  // Marketing signup and QA entry forms now live in the shared onboarding
  // package; the marketing app only re-exports them.
  const globs = [
    new Bun.Glob("apps/{dashboard,marketing}/src/**/*.tsx"),
    new Bun.Glob("packages/onboarding/src/**/*.tsx"),
  ]
  return globs
    .flatMap((glob) => [...glob.scanSync({ cwd: repoRoot })])
    .filter((source) =>
      readFileSync(resolve(repoRoot, source), "utf8").includes("<form"),
    )
    .sort()
}

function discoverMobileFormSources() {
  const glob = new Bun.Glob("apps/mobile/src/**/*.tsx")
  const fieldPattern =
    /<(?:FormField|Input|KeyboardInlineComposer|MoneyField|OtpInput|QuantityStepper|TextInput|Textarea)\b/
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
      expect(Boolean(entry.reason) !== Boolean(entry.formIds?.length)).toBe(
        true,
      )
      if (!entry.formIds) continue
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
