import { expect, mock, test } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"

// Actual product editor and save handlers; only design-system leaves and photo hooks are ports.
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
const buttons: Record<string, { disabled?: boolean; onClick?: () => void }> = {}
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
  SelectControl: (props: {
    id: string
    value: string
    disabled: boolean
    onValueChange: (value: string) => void
  }) => {
    inputs.push({
      ...props,
      id: props.id ?? "payment-method",
      onChange: (event) => props.onValueChange(event.target.value),
    })
    return null
  },
}))

mock.module(
  new URL("./open-missing-catalog-item", import.meta.url).pathname,
  () => ({ OpenMissingCatalogItem: () => null }),
)
mock.module(
  new URL("../open-assistant-read-record", import.meta.url).pathname,
  () => ({ OpenAssistantReadRecord: () => null }),
)
mock.module(
  new URL("../orders/order-payment-account", import.meta.url).pathname,
  () => ({
    OrderPaymentAccount: () => null,
    useOrderPaymentAccountChoice: () => ({ payloadAccountId: "account" }),
  }),
)
const { GeneralOrderPreparationEditor } = await import(
  "./general-order-preparation-editor"
)
const { orderPreparationRequestSchema } = await import(
  "@ewatrade/assistant/general/order-preparation"
)
type Host = {
  textContent: string | null
  getElementsByTagName(name: string): ArrayLike<object>
}
async function mount(
  payload: Extract<GeneralAction, { action: "order_create" }>,
  disabled = false,
) {
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
        createElement(GeneralOrderPreparationEditor, {
          initial: payload,
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

test("partial order editing preserves every item and leaves unknown payment method/account unset", async () => {
  const preparation = orderPreparationRequestSchema.parse({
    lines: [
      {
        name: "Eggs",
        quantity: "10",
        unitName: "Crate",
        choices: [{ optionName: "Size", value: "Big" }],
      },
      { name: "Blue shirt", quantity: "20" },
    ],
    payment: { paid: true },
    delivered: true,
    extraCharges: [{ name: "Delivery" }],
  })
  const ui = await mount({ action: "order_create", lines: [], preparation })
  await ui.type("order-qty-0", "12")
  await ui.submit()
  const value = ui.saved[0]
  if (value?.action !== "order_create") throw Error("Order expected")
  expect(value.preparation?.lines).toHaveLength(2)
  expect(value.preparation?.lines[0]?.quantity).toBe("12")
  expect(value.preparation?.lines[1]?.quantity).toBe("20")
  expect(value.preparation?.payment?.method).toBeUndefined()
  expect(value.preparation?.payment?.moneyAccountId).toBeUndefined()
  expect(value.preparation?.delivered).toBe(true)
  expect(value.preparation?.extraCharges?.[0]?.amount).toBeUndefined()
  await ui.close()
})
