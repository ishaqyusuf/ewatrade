import { beforeEach, expect, mock, test } from "bun:test"
import { QUICK_SALE_DESCRIPTION_REQUIRED } from "@ewatrade/utils/catalog-free-lines"
import { DOMParser } from "@xmldom/xmldom"
import {
  type ReactElement,
  type ReactNode,
  act,
  cloneElement,
  createElement,
} from "react"

// The actual OrderForm submit path and the actual OrderCatalogFreeLines,
// mounted with react-dom. Ports: design-system leaves hand their real props
// to the probe (ControlField passes its label/error onto the control like the
// real one), and data hooks/router are inert. The create mutation is a spy, so
// "blocked" means the real submit() never reached it.
type ControlProps = {
  "data-label"?: string
  "data-error"?: string
  placeholder?: string
  value?: string
  required?: boolean
  maxLength?: number
  ref?: (input: { focus(): void; scrollIntoView(): void } | null) => void
  onChange?: (event: { target: { value: string } }) => void
}
let controls: ControlProps[] = []
let buttons: Record<string, () => void> = {}
let feedback: string[] = []
let creates: unknown[] = []
let focused: string[] = []
const pass = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
const leaf = () => null
const control = (props: ControlProps) => {
  controls.push(props)
  props.ref?.({
    focus: () => focused.push(`${props["data-label"]}:${props.value ?? ""}`),
    scrollIntoView() {},
  })
  return null
}
mock.module("@ewatrade/ui", () => ({
  Button: (props: { children: ReactNode; onClick?: () => void }) => {
    const text = [props.children]
      .flat()
      .filter((part) => typeof part === "string")
      .join("")
      .trim()
    if (props.onClick) buttons[text] = props.onClick
    return null
  },
  SubmitButton: (props: { children: ReactNode; onClick?: () => void }) => {
    if (props.onClick) buttons[String(props.children)] = props.onClick
    return null
  },
  ControlField: ({
    label,
    error,
    children,
  }: {
    label: ReactNode
    error?: string
    children: ReactElement<ControlProps>
  }) =>
    cloneElement(children, {
      "data-label": String(label),
      "data-error": error,
    }),
  Input: control,
  MoneyInput: control,
  Checkbox: leaf,
  CheckboxField: leaf,
  SelectControl: leaf,
  FieldGroup: pass,
  FormActions: pass,
}))
const port = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, import.meta.url).pathname, () => exports)
port("../forms/form-feedback", {
  FormFeedback: ({ children }: { children: ReactNode }) => {
    feedback.push(String(children))
    return null
  },
})
port("./order-item-picker", { OrderItemPicker: leaf })
port("./order-item-row", { OrderItemRow: leaf })
port("./order-customer-picker", { OrderCustomerPicker: leaf })
port("./order-payment-account", {
  OrderPaymentAccount: leaf,
  useOrderPaymentAccountChoice: () => ({ problem: null }),
})
port("../qa/fixture-recipes", { createOrderFixture: () => ({}) })
port("../qa/qa-quick-fill", { QaDashboardQuickFill: leaf })
port("../../hooks/use-customer-message-params", {
  useCustomerMessageParams: () => ({ setParams() {} }),
})
port("../../hooks/use-order-params", {
  useOrderParams: () => ({ setParams() {} }),
})
// Any trpc.x.y.queryOptions()/mutationOptions()/queryKey()/pathKey() is inert.
const inert: unknown = new Proxy(() => ({}), {
  get: () => inert,
  apply: () => ({}),
})
port("../../trpc/client", { useTRPC: () => inert })
mock.module("@tanstack/react-query", () => ({
  useSuspenseQuery: () => ({ data: [] }),
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({
    isPending: false,
    mutate: (payload: unknown) => creates.push(payload),
  }),
}))
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }))
const { OrderForm } = await import("./order-form")

beforeEach(() => {
  buttons = {}
  creates = []
  focused = []
})

async function mount() {
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
  const run = async (step: () => void) => {
    controls = []
    feedback = []
    await act(async () => step())
  }
  await run(() =>
    root.render(
      createElement(OrderForm, {
        store: { currencyCode: "NGN", id: "store", name: "Store" },
      }),
    ),
  )
  // The latest render's controls for typed-price lines, in line order.
  const lineControls = (placeholder: string) =>
    controls.filter((props) => props.placeholder === placeholder)
  return {
    press: (label: string) =>
      run(() => {
        const click = buttons[label]
        if (!click) throw Error(`No button ${label}: ${Object.keys(buttons)}`)
        click()
      }),
    amounts: () => lineControls("0.00"),
    sold: () => lineControls("What was sold?"),
    costs: () => lineControls("What is this cost for?"),
    type: (props: ControlProps | undefined, value: string) =>
      run(() => props?.onChange?.({ target: { value } })),
    get feedback() {
      return feedback
    },
    close: () => act(async () => root.unmount()),
  }
}

const CONFIRM = "Confirm order"

test("Quick sale description is labelled required; blank is blocked with an error at the field and focus", async () => {
  const ui = await mount()
  try {
    await ui.press("Type a price")
    const [field] = ui.sold()
    expect(field?.["data-label"]).toBe("What was sold? (required)")
    expect(field?.required).toBe(true)
    expect(field?.["data-error"]).toBeUndefined()
    await ui.type(ui.amounts()[0], "1000")
    await ui.press(CONFIRM)
    expect(creates).toEqual([])
    expect(ui.sold()[0]?.["data-error"]).toBe(QUICK_SALE_DESCRIPTION_REQUIRED)
    expect(ui.feedback).toContain(QUICK_SALE_DESCRIPTION_REQUIRED)
    expect(focused).toEqual(["What was sold? (required):"])
  } finally {
    await ui.close()
  }
})

test("whitespace and over-200 descriptions are blocked; typing a valid value clears the field error", async () => {
  const ui = await mount()
  try {
    await ui.press("Type a price")
    await ui.type(ui.amounts()[0], "1000")
    await ui.type(ui.sold()[0], "   ")
    await ui.press(CONFIRM)
    expect(creates).toEqual([])
    expect(ui.sold()[0]?.["data-error"]).toBe(QUICK_SALE_DESCRIPTION_REQUIRED)
    await ui.type(ui.sold()[0], `x${"a".repeat(200)}`)
    expect(ui.sold()[0]?.["data-error"]).toContain("at most 200")
    await ui.press(CONFIRM)
    expect(creates).toEqual([])
    await ui.type(ui.sold()[0], "Two bags of rice")
    expect(ui.sold()[0]?.["data-error"]).toBeUndefined()
  } finally {
    await ui.close()
  }
})

test("a padded 200-character description is accepted and sent trimmed", async () => {
  const ui = await mount()
  try {
    await ui.press("Type a price")
    await ui.type(ui.amounts()[0], "1000")
    // The field leaves room for padding; the canonical check trims.
    expect(ui.sold()[0]?.maxLength).toBeGreaterThan(200)
    const words = "b".repeat(200)
    await ui.type(ui.sold()[0], `  ${words}   `)
    await ui.press(CONFIRM)
    expect(creates).toHaveLength(1)
    const sent = JSON.stringify(creates[0])
    expect(sent).toContain(`"${words}"`)
    expect(sent).not.toContain(` ${words}`)
  } finally {
    await ui.close()
  }
})

test("Additional cost stays optional and focus goes to the first invalid Quick sale", async () => {
  const ui = await mount()
  try {
    await ui.press("Additional cost")
    await ui.press("Type a price")
    await ui.press("Type a price")
    expect(ui.costs()[0]?.["data-label"]).toBe("Description (optional)")
    expect(ui.costs()[0]?.required).toBe(false)
    // Re-read controls after each change: handlers close over current lines.
    await ui.type(ui.amounts()[0], "50")
    await ui.type(ui.amounts()[1], "1000")
    await ui.type(ui.amounts()[2], "2000")
    await ui.type(ui.sold()[0], "Eggs")
    await ui.press(CONFIRM)
    expect(creates).toEqual([])
    // Blocked only by the blank second Quick sale, not by amounts.
    expect(ui.feedback).toEqual([QUICK_SALE_DESCRIPTION_REQUIRED])
    expect(ui.costs()[0]?.["data-error"]).toBeUndefined()
    expect(ui.sold()[0]?.["data-error"]).toBeUndefined()
    expect(ui.sold()[1]?.["data-error"]).toBe(QUICK_SALE_DESCRIPTION_REQUIRED)
    // Only the invalid (second, still blank) line's input took focus.
    expect(focused).toEqual(["What was sold? (required):"])
    await ui.type(ui.sold()[1], "Feed")
    await ui.press(CONFIRM)
    expect(creates).toHaveLength(1)
  } finally {
    await ui.close()
  }
})

test("no field errors show before the first submit attempt", async () => {
  const ui = await mount()
  try {
    await ui.press("Type a price")
    await ui.type(ui.sold()[0], "   ")
    expect(ui.sold()[0]?.["data-error"]).toBeUndefined()
    expect(focused).toEqual([])
  } finally {
    await ui.close()
  }
})
