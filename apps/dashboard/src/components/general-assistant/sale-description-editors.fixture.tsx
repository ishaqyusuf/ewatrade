import { beforeEach, expect, mock, test } from "bun:test"
import { readFileSync } from "node:fs"
import type {
  GeneralAction,
  GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import { QUICK_SALE_DESCRIPTION_REQUIRED } from "@ewatrade/utils/catalog-free-lines"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"

// The actual GeneralProposalEditor, its actual order fields and the actual
// simple-sale editor, mounted with react-dom. Only design-system leaves,
// sibling editors and data hooks are ports: Input and Button hand their real
// props to the probe, so typing, pressing and submitting go through the
// editors' own handlers and save().
type InputProps = {
  id?: string
  value?: string
  disabled?: boolean
  required?: boolean
  maxLength?: number
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  onChange?: (event: { target: { value: string } }) => void
}
let inputs: InputProps[] = []
let buttons: Record<string, { disabled?: boolean; onClick?: () => void }> = {}
const tag =
  (name: string) =>
  ({ children, htmlFor }: { children?: ReactNode; htmlFor?: string }) =>
    createElement(name, htmlFor ? { htmlFor } : null, children)
const leaf = () => null
mock.module("@ewatrade/ui", () => ({
  Input: (props: InputProps) => {
    inputs.push(props)
    return null
  },
  MoneyInput: (props: InputProps) => {
    inputs.push(props)
    return null
  },
  Textarea: (props: InputProps) => {
    inputs.push(props)
    return null
  },
  Button: (props: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => {
    buttons[String(props.children)] = props
    return null
  },
  Field: tag("div"),
  FieldGroup: tag("div"),
  FieldLabel: tag("label"),
  SelectControl: leaf,
}))
// Every sibling editor the proposal editor imports, except the simple sale.
const editorSource = readFileSync(
  new URL("./general-proposal-editor.tsx", import.meta.url),
  "utf8",
)
for (const [, name, path] of editorSource.matchAll(
  /import \{ (\w+) \} from "\.\/(general-[\w-]+)"/g,
))
  if (path !== "general-simple-sale-editor")
    mock.module(new URL(`./${path}`, import.meta.url).pathname, () => ({
      [name as string]: leaf,
    }))
mock.module(
  new URL("../orders/order-payment-account", import.meta.url).pathname,
  () => ({
    OrderPaymentAccount: leaf,
    useOrderPaymentAccountChoice: () => ({
      problem: null,
      payloadAccountId: "acc_cash",
    }),
  }),
)
mock.module(new URL("../../trpc/client", import.meta.url).pathname, () => ({
  useTRPC: () => ({
    assistant: { saleOptions: { queryOptions: () => ({ queryKey: [] }) } },
  }),
}))
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

type Host = {
  textContent: string | null
  getElementsByTagName(name: string): ArrayLike<object>
}
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
  const host = document.createElement("div") as unknown as Host
  document.documentElement?.appendChild(host as never)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  const saved: GeneralAction[] = []
  const render = async () => {
    inputs = []
    await act(async () =>
      root.render(
        createElement(GeneralProposalEditor, {
          proposal: proposal(payload),
          currencyCode: "NGN",
          disabled,
          onSave: (value: GeneralAction) => saved.push(value),
          onCancel() {},
        }),
      ),
    )
  }
  await render()
  // The latest render's props for the input whose id ends with `suffix`.
  const input = (suffix: string) => {
    const found = inputs.findLast((props) => props.id?.endsWith(suffix))
    if (!found) throw Error(`No input *${suffix}`)
    return found
  }
  const act_ = async (run: () => void) =>
    act(async () => {
      run()
      await Promise.resolve()
    })
  return {
    saved,
    input,
    text: () => host.textContent ?? "",
    type: (suffix: string, value: string) =>
      act_(() => input(suffix).onChange?.({ target: { value } })),
    press: (label: string) =>
      act_(() => {
        const button = buttons[label]
        if (!button) throw Error(`No button ${label}: ${Object.keys(buttons)}`)
        if (!button.disabled) button.onClick?.()
      }),
    // The actual <form onSubmit> React rendered for the order editor.
    submit: () =>
      act_(() => {
        const form = host.getElementsByTagName("form")[0] as Record<
          string,
          unknown
        >
        const key = Object.keys(form).find((name) =>
          name.startsWith("__reactProps$"),
        )
        const props = form[key as string] as {
          onSubmit: (event: { preventDefault(): void }) => void
        }
        props.onSubmit({ preventDefault() {} })
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
const SAVE_SALE = "Update order card"

test("Quick sale: a historical draft without a description opens editable and marked Required", async () => {
  const ui = await mount(sale)
  try {
    const field = ui.input("-description")
    expect(field.value).toBe("")
    expect(field.disabled).toBe(false)
    expect(field.required).toBe(true)
    expect(field["aria-invalid"]).toBeUndefined()
    expect(ui.text()).toContain("What was sold?")
    expect(ui.text()).toContain("Required")
  } finally {
    await ui.close()
  }
})

test("Quick sale: missing or whitespace description is blocked with field feedback", async () => {
  const ui = await mount(sale)
  try {
    await ui.press(SAVE_SALE)
    expect(ui.saved).toEqual([])
    expect(ui.input("-description")["aria-invalid"]).toBe(true)
    expect(ui.input("-description")["aria-describedby"]).toEndWith(
      "-description-error",
    )
    expect(ui.text()).toContain(QUICK_SALE_DESCRIPTION_REQUIRED)
    await ui.type("-description", "   ")
    await ui.press(SAVE_SALE)
    expect(ui.saved).toEqual([])
    expect(ui.text()).toContain(QUICK_SALE_DESCRIPTION_REQUIRED)
    await ui.type("-description", `x${"a".repeat(200)}`)
    expect(ui.text()).toContain("at most 200")
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
    await ui.type("-description", `  ${words}   `)
    expect(ui.input("-description")["aria-invalid"]).toBeUndefined()
    expect(ui.text()).not.toContain(QUICK_SALE_DESCRIPTION_REQUIRED)
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
    await ui.type("-customer", "Bola")
    await ui.press("Walk-in")
    await ui.type("-description", "Two bags of rice")
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
    expect(locked.input("-description").disabled).toBe(true)
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
const QUICK = "-description-1"
const COST = "-description-2"

test("order: a historical generic Quick sale line opens editable; Additional cost stays optional", async () => {
  const ui = await mount(order)
  try {
    expect(ui.input(QUICK).value).toBe("")
    expect(ui.input(QUICK).disabled).toBe(false)
    expect(ui.input(QUICK).required).toBe(true)
    expect(ui.input(COST).required).toBe(false)
    expect(ui.input(COST).disabled).toBe(false)
    expect(ui.text()).toContain("What was sold? (required)")
    expect(ui.text()).toContain("Description (optional)")
  } finally {
    await ui.close()
  }
})

test("order: a missing Quick sale description is blocked per line; Additional cost is not", async () => {
  const ui = await mount(order)
  try {
    await ui.submit()
    expect(ui.saved).toEqual([])
    expect(ui.input(QUICK)["aria-invalid"]).toBe(true)
    expect(ui.input(QUICK)["aria-describedby"]).toEndWith(
      "-description-1-error",
    )
    expect(ui.input(COST)["aria-invalid"]).toBeUndefined()
    expect(ui.text()).toContain(QUICK_SALE_DESCRIPTION_REQUIRED)
    await ui.type(QUICK, "   ")
    await ui.submit()
    expect(ui.saved).toEqual([])
    expect(ui.text()).toContain(QUICK_SALE_DESCRIPTION_REQUIRED)
  } finally {
    await ui.close()
  }
})

test("order: trimmed descriptions save and every other field is unchanged", async () => {
  const ui = await mount(order)
  try {
    await ui.submit()
    const words = "b".repeat(200)
    await ui.type(QUICK, ` ${words}  `)
    expect(ui.input(QUICK)["aria-invalid"]).toBeUndefined()
    await ui.submit()
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
    await ui.type(COST, "  Delivery  ")
    await ui.submit()
    expect(ui.saved[1]).toMatchObject({
      customerId: "cus_1",
      notes: "Deliver Friday",
      initialPayment: order.initialPayment,
      lines: [
        order.lines[0],
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

test("order: a disabled editor locks custom-line descriptions and saving", async () => {
  const ui = await mount(order, true)
  try {
    expect(ui.input(QUICK).disabled).toBe(true)
    expect(ui.input(COST).disabled).toBe(true)
    await ui.submit()
    expect(ui.saved).toEqual([])
  } finally {
    await ui.close()
  }
})
