import { expect, mock, test } from "bun:test"
import type { ComponentProps, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { WorkJob } from "../../../../apps/mobile/src/components/mobile/service-jobs/service-jobs-model"
import { projectServicePayment } from "../../../../apps/mobile/src/components/mobile/service-jobs/service-payment-model"

// Actual payment sheet and exact projection; native furniture is inert. No
// device, transport, provider or command executes in this isolated fixture.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
for (const [path, name] of [
  ["components/ui/text", "Text"],
  ["components/ui/view", "View"],
  [
    "components/ui/bottom-sheet-keyboard-aware-scroll-view",
    "BottomSheetKeyboardAwareScrollView",
  ],
] as const)
  standIn(path, { [name]: children })
standIn("components/app/bottom-sheet-backdrop", {
  AppBottomSheetBackdrop: children,
})
standIn("components/mobile/appearances/classic/service-jobs", {
  ServiceChoice: () => null,
})
mock.module("nativewind", () => ({ VariableContextProvider: children }))
mock.module("react-native", () => ({
  Keyboard: { dismiss: () => {} },
  useWindowDimensions: () => ({ height: 800 }),
}))
mock.module("@gorhom/bottom-sheet", () => ({ BottomSheetFooter: children }))
standIn("components/ui/modal", {
  Modal: ({
    children,
    footerComponent,
  }: { children: ReactNode; footerComponent: () => ReactNode }) => (
    <div>
      {children}
      {footerComponent()}
    </div>
  ),
  useModal: () => ({
    ref: { current: null },
    present: () => {},
    dismiss: () => {},
  }),
})
// This fixture exercises raw amount and permission boundaries with no Finance
// book. Account selection has its own shared model/hook coverage.
standIn("components/mobile/create-sale/checkout-money-account", {
  CheckoutMoneyAccountField: () => null,
})
standIn("hooks/use-order-payment-account", {
  useOrderPaymentAccount: () => ({
    state: { kind: "not_needed" },
    list: [],
    ready: true,
    chosen: null,
    choose: () => {
      throw Error("No account selection in raw amount fixture")
    },
    retry: () => {
      throw Error("No account transport in raw amount fixture")
    },
  }),
})
let amountField:
  | {
      value: string
      keyboardType?: string
      leadingText?: string
      editable?: boolean
      onChangeText: (value: string) => void
    }
  | undefined
standIn("components/mobile/form-field", {
  FormField: (props: {
    label: string
    value: string
    keyboardType?: string
    leadingText?: string
    editable?: boolean
    onChangeText: (value: string) => void
  }) => {
    if (props.label.startsWith("Amount received")) amountField = props
    return (
      <label>
        {props.label}
        <input value={props.value} readOnly />
      </label>
    )
  },
})
let reviewDisabled: boolean | undefined
standIn("components/mobile/service-jobs/service-action", {
  ServiceAction: ({
    children,
    disabled,
  }: { children: ReactNode; disabled?: boolean }) => {
    if (String(children).includes("Review")) reviewDisabled = disabled
    return (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    )
  },
})
const { ServicePaymentSheet } = await import(
  "../../../../apps/mobile/src/components/mobile/service-jobs/service-payment-sheet"
)
const job: WorkJob = {
  id: "exact-job",
  commercialOrderId: "exact-order",
  orderNumber: "ORD-1042",
  storeId: "store",
  currencyCode: "NGN",
  amountPaidMinor: 0,
  balanceDueMinor: 10000,
  orderTotalMinor: 10000,
  serviceChargeMinor: 0,
  summary: "ready_for_handoff",
  customerMilestone: "ready",
  customerName: "Customer",
  createdAt: new Date("2026-10-15T10:00:00Z"),
  currentAssigneeUserId: null,
  dueCommitmentAt: null,
  handedOffAt: null,
  handoffNote: null,
  paymentStatus: "PENDING",
  priority: "normal",
  revision: 1,
  assignments: [],
  dueHistory: [],
  evidence: [],
  exceptions: [],
  lines: [],
  payments: [],
  notificationIntents: [],
  notes: [],
}
function fixture() {
  const editor: ComponentProps<typeof ServicePaymentSheet>["editor"] = {
    modal: { ref: { current: null }, present: () => {}, dismiss: () => {} },
    draft: {
      job,
      kind: "payment",
      amount: "1.20",
      method: "cash",
      reference: "",
    },
    open: () => {},
    edit: (fields) => {
      if (editor.draft) editor.draft = { ...editor.draft, ...fields }
    },
    review: () => {
      throw Error("No command/review dispatch in fixture")
    },
    afterDismiss: () => {},
    reviewError: false,
  }
  const render = (allowed = true) => {
    amountField = undefined
    reviewDisabled = undefined
    return renderToStaticMarkup(
      <ServicePaymentSheet
        editor={editor}
        allowed={allowed}
        scopeChanged={false}
      />,
    )
  }
  const field = () => {
    if (!amountField) throw Error("Missing actual raw amount field")
    return amountField
  }
  return { editor, render, field }
}
test("actual payment sheet retains malformed paste verbatim and exact projection refuses it", () => {
  const value = fixture()
  for (const amount of [
    "1.001",
    "1e3",
    "-1",
    "₦1.20",
    "1,000.00",
    "NaN",
    "Infinity",
  ]) {
    value.render()
    value.field().onChangeText(amount)
    expect(value.editor.draft?.amount).toBe(amount)
    const html = value.render()
    expect(value.field().value).toBe(amount)
    expect(html).toContain("supported payment amount")
    expect(reviewDisabled).toBe(true)
    const draft = value.editor.draft
    if (!draft) throw Error("Missing retained draft")
    expect(
      projectServicePayment(draft.job, draft.kind, draft).amountMinor,
    ).toBeNull()
  }
})
test("actual payment sheet preserves valid decimals, native keyboard/currency and access control", () => {
  const value = fixture()
  value.render()
  value.field().onChangeText("12.34")
  expect(value.render()).toContain("Amount received (NGN)")
  expect(value.field().value).toBe("12.34")
  expect(value.field().keyboardType).toBe("decimal-pad")
  expect(value.field().leadingText).toBe("₦")
  expect(reviewDisabled).toBe(false)
  const draft = value.editor.draft
  if (!draft) throw Error("Missing draft")
  expect(projectServicePayment(draft.job, draft.kind, draft)).toEqual({
    amountMinor: 1234,
    error: null,
  })
  value.render(false)
  expect(value.field().editable).toBe(false)
  expect(reviewDisabled).toBe(true)
})
