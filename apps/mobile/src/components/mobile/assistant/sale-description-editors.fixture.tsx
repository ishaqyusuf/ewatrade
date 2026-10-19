import { beforeEach, expect, mock, test } from "bun:test"
import type {
  GeneralAction,
  GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import { QUICK_SALE_DESCRIPTION_REQUIRED } from "@ewatrade/utils/catalog-free-lines"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"

// The actual GeneralProposalEditor, its actual record editor and the actual
// simple-sale editor. Only UI leaves, sibling editors and data hooks are
// ports: FormField and ActionButton hand their real props to the probe, so
// typing and pressing go through the editors' own handlers and save().
const source = new URL("../../../", import.meta.url)
const leaf = () => null
const pass = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
type FieldProps = {
  label: string
  helper?: string
  error?: string
  value?: string
  editable?: boolean
  maxLength?: number
  accessibilityHint?: string
  onChangeText?: (value: string) => void
}
let fields: Record<string, FieldProps> = {}
let buttons: Record<string, { disabled?: boolean; onPress?: () => void }> = {}
function port(path: string, exports: Record<string, unknown>) {
  mock.module(new URL(path, source).pathname, () => exports)
}
port("components/mobile/form-field", {
  FormField: (props: FieldProps) => {
    fields[props.label] = props
    return null
  },
})
port("components/mobile/action-button", {
  ActionButton: (props: {
    children: ReactNode
    disabled?: boolean
    onPress?: () => void
  }) => {
    buttons[String(props.children)] = props
    return null
  },
})
port("components/ui/text", { Text: leaf })
port("components/ui/view", { View: pass })
port("components/ui/bottom-sheet-input-context", {
  BottomSheetInputProvider: pass,
})
port("components/ui/bottom-sheet-keyboard-aware-scroll-view", {
  BottomSheetKeyboardAwareScrollView: pass,
})
port("components/mobile/country-select", { CountrySelect: leaf })
port("components/mobile/qa-quick-fill-button", { QaQuickFillButton: leaf })
for (const name of [
  "cash-count",
  "change",
  "money-operation",
  "order-operation",
  "quote-decision",
  "service-intake",
  "service-message",
  "service-work",
  "staff-access",
  "staff-invitation",
  "staff-status",
  "stock",
]) {
  const exportName = `General${name
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("")}Editor`
  port(`components/mobile/assistant/general-${name}-editor`, {
    [exportName]: leaf,
  })
}
port("components/mobile/assistant/general-product-create-rows", {
  GeneralProductCreateRows: leaf,
})
port("components/mobile/assistant/general-product-picture", {
  GeneralProductPictureField: leaf,
  useProductPicture: () => ({ uploading: false, resolve: async () => ({}) }),
})
port("trpc/client", {
  useTRPC: () => ({
    assistant: { saleOptions: { queryOptions: () => ({ queryKey: [] }) } },
  }),
})
mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      accounts: [{ id: "acc_cash", name: "Shop cash", purpose: "CASH" }],
      customers: [{ id: "cus_1", name: "Amina" }],
    },
  }),
}))
const { GeneralProposalEditor } = await import("./general-proposal-editor")

beforeEach(() => {
  fields = {}
  buttons = {}
})

const proposal = (payload: unknown) =>
  ({
    id: "p1",
    revision: 3,
    payload,
    status: "PENDING",
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    receipt: null,
    review: [],
    question: "",
    choices: [],
    approvalToken: "t",
  }) as unknown as GeneralProposal

async function mount(payload: unknown, disabled = false) {
  const document = new DOMParser().parseFromString(
    "<html><body/></html>",
    "text/html",
  )
  const window = {
    document,
    HTMLIFrameElement: class {},
    HTMLElement: class {},
    addEventListener() {},
    removeEventListener() {},
  }
  Object.assign(globalThis, {
    document,
    window,
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  Object.assign(document, {
    defaultView: window,
    addEventListener() {},
    removeEventListener() {},
  })
  const create = document.createElement.bind(document)
  document.createElement = (name: string) =>
    Object.assign(create(name), {
      style: {},
      addEventListener() {},
      removeEventListener() {},
    })
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  const saved: GeneralAction[] = []
  await act(async () =>
    root.render(
      createElement(GeneralProposalEditor, {
        proposal: proposal(payload),
        currencyCode: "NGN",
        disabled,
        onSave: (value: GeneralAction) => saved.push(value),
      }),
    ),
  )
  const field = (label: string) => {
    const props = fields[label]
    if (!props) throw Error(`No field ${label}: ${Object.keys(fields)}`)
    return props
  }
  return {
    saved,
    field,
    type: async (label: string, value: string) =>
      act(async () => field(label).onChangeText?.(value)),
    press: async (label: string) =>
      act(async () => {
        const button = buttons[label]
        if (!button) throw Error(`No button ${label}: ${Object.keys(buttons)}`)
        if (!button.disabled) button.onPress?.()
        await Promise.resolve()
      }),
    close: async () => act(async () => root.unmount()),
  }
}

const sale = {
  action: "sale_record",
  accountName: "Shop cash",
  moneyAccountId: "acc_cash",
  createAccount: false,
  method: "cash",
  customerName: "Amina",
  customerId: "cus_1",
  receivedMinor: 250_000,
  totalMinor: 400_000,
  partial: true,
  attachmentIds: ["att_1"],
}
const SOLD = "What was sold?"
const SAVE_SALE = "Update order card"

test("Quick sale: a historical draft without a description opens editable with a required hint", async () => {
  const ui = await mount(sale)
  try {
    const props = ui.field(SOLD)
    expect(props.value).toBe("")
    expect(props.editable).toBe(true)
    expect(props.helper).toBe("Required · up to 200 characters")
    expect(props.accessibilityHint).toContain("Required")
    expect(props.error).toBeUndefined()
  } finally {
    await ui.close()
  }
})

test("Quick sale: missing or whitespace description is blocked with field feedback", async () => {
  const ui = await mount(sale)
  try {
    await ui.press(SAVE_SALE)
    expect(ui.saved).toEqual([])
    expect(ui.field(SOLD).error).toBe(QUICK_SALE_DESCRIPTION_REQUIRED)
    await ui.type(SOLD, "    ")
    await ui.press(SAVE_SALE)
    expect(ui.saved).toEqual([])
    expect(ui.field(SOLD).error).toBe(QUICK_SALE_DESCRIPTION_REQUIRED)
    // 201 characters after trimming is refused by the same canonical rule.
    await ui.type(SOLD, `x${"a".repeat(200)}`)
    expect(ui.field(SOLD).error).toContain("at most 200")
    await ui.press(SAVE_SALE)
    expect(ui.saved).toEqual([])
  } finally {
    await ui.close()
  }
})

test("Quick sale: a trimmed 200-character value saves without changing other fields", async () => {
  const ui = await mount(sale)
  try {
    await ui.press(SAVE_SALE)
    const words = "a".repeat(200)
    await ui.type(SOLD, `   ${words}  `)
    // Typing a valid value clears the feedback before saving.
    expect(ui.field(SOLD).error).toBeUndefined()
    await ui.press(SAVE_SALE)
    expect(ui.saved).toEqual([{ ...sale, description: words } as GeneralAction])
  } finally {
    await ui.close()
  }
})

test("Quick sale: other controls keep working and disabled locks the field", async () => {
  const ui = await mount(sale)
  try {
    await ui.press(SAVE_SALE)
    await ui.type("Customer", "Bola")
    await ui.press("Walk-in")
    await ui.type(SOLD, "Two bags of rice")
    await ui.press(SAVE_SALE)
    expect(ui.saved).toHaveLength(1)
    expect(ui.saved[0]).toMatchObject({
      customerChoice: "walk_in",
      customerName: undefined,
      customerId: undefined,
      description: "Two bags of rice",
      receivedMinor: 250_000,
      moneyAccountId: "acc_cash",
    })
  } finally {
    await ui.close()
  }
  const locked = await mount(sale, true)
  try {
    expect(locked.field(SOLD).editable).toBe(false)
  } finally {
    await locked.close()
  }
})

const order = {
  action: "order_create",
  customerId: "cus_1",
  notes: "Deliver Friday",
  initialPayment: {
    amountMinor: 100_000,
    moneyAccountId: "acc_cash",
    method: "cash",
  },
  lines: [
    { offeringId: "off_1", quantity: "2", expectedFixedPriceMinor: 50_000 },
    { custom: "quick_sale", amountMinor: 120_000 },
    { custom: "additional_cost", amountMinor: 5_000 },
  ],
}
const QUICK = "What was sold? · line 2"
const COST = "Additional cost description · line 3"

test("order: a historical generic Quick sale line opens editable; Additional cost stays optional", async () => {
  const ui = await mount(order)
  try {
    expect(ui.field(QUICK).value).toBe("")
    expect(ui.field(QUICK).editable).toBe(true)
    expect(ui.field(QUICK).helper).toStartWith("Required")
    expect(ui.field(COST).helper).toStartWith("Optional")
    expect(ui.field(COST).editable).toBe(true)
    expect(ui.field("Quantity · line 1").value).toBe("2")
  } finally {
    await ui.close()
  }
})

test("order: a missing Quick sale description is blocked per line; Additional cost is not", async () => {
  const ui = await mount(order)
  try {
    await ui.press("Save draft")
    expect(ui.saved).toEqual([])
    expect(ui.field(QUICK).error).toBe(QUICK_SALE_DESCRIPTION_REQUIRED)
    expect(ui.field(COST).error).toBeUndefined()
    await ui.type(QUICK, "   ")
    await ui.press("Save draft")
    expect(ui.saved).toEqual([])
    expect(ui.field(QUICK).error).toBe(QUICK_SALE_DESCRIPTION_REQUIRED)
  } finally {
    await ui.close()
  }
})

test("order: trimmed descriptions save and every other field is unchanged", async () => {
  const ui = await mount(order)
  try {
    await ui.press("Save draft")
    const words = "b".repeat(200)
    await ui.type(QUICK, `  ${words} `)
    expect(ui.field(QUICK).error).toBeUndefined()
    await ui.press("Save draft")
    expect(ui.saved).toEqual([
      {
        ...order,
        lines: [
          order.lines[0],
          { custom: "quick_sale", amountMinor: 120_000, description: words },
          { custom: "additional_cost", amountMinor: 5_000 },
        ],
      } as GeneralAction,
    ])
    // An Additional cost description is trimmed too, and blank stays absent.
    await ui.type(COST, "  Delivery  ")
    await ui.type("Quantity · line 1", "3")
    await ui.press("Save draft")
    expect(ui.saved[1]).toMatchObject({
      customerId: "cus_1",
      notes: "Deliver Friday",
      initialPayment: order.initialPayment,
      lines: [
        { offeringId: "off_1", quantity: "3", expectedFixedPriceMinor: 50_000 },
        { custom: "quick_sale", amountMinor: 120_000, description: words },
        {
          custom: "additional_cost",
          amountMinor: 5_000,
          description: "Delivery",
        },
      ],
    })
  } finally {
    await ui.close()
  }
})

test("order: a disabled editor locks custom-line descriptions and Save", async () => {
  const ui = await mount(order, true)
  try {
    expect(ui.field(QUICK).editable).toBe(false)
    expect(ui.field(COST).editable).toBe(false)
    await ui.press("Save draft")
    expect(ui.saved).toEqual([])
  } finally {
    await ui.close()
  }
})
