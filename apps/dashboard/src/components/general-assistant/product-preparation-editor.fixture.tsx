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
      onChange: (event) => props.onValueChange(event.target.value),
    })
    return null
  },
}))

mock.module(
  new URL("../catalog-item/catalog-illustration-picker", import.meta.url)
    .pathname,
  () => ({ CatalogIllustrationPicker: leaf }),
)
mock.module(
  new URL("../catalog-item/catalog-illustration-preview", import.meta.url)
    .pathname,
  () => ({ CatalogIllustrationPreview: leaf }),
)
mock.module(
  new URL("../catalog-item/catalog-photo-preview", import.meta.url).pathname,
  () => ({ CatalogPhotoPreview: leaf }),
)
mock.module(
  new URL("../../hooks/use-catalog-photo", import.meta.url).pathname,
  () => ({ useCatalogPhoto: () => ({ uploading: false }) }),
)
mock.module(
  new URL("./general-product-picture", import.meta.url).pathname,
  () => ({ useAssistantStoreId: () => "store" }),
)
mock.module(
  new URL("../../hooks/use-catalog-item-params", import.meta.url).pathname,
  () => ({ useCatalogItemParams: () => ({ setParams: async () => {} }) }),
)
const { GeneralProductCreateEditor } = await import(
  "./general-product-create-editor"
)
const { productCreateDraft, productCreateIssues } = await import(
  "@ewatrade/assistant/general/product-create"
)
type Host = {
  textContent: string | null
  getElementsByTagName(name: string): ArrayLike<object>
}
async function mount(
  payload: Extract<GeneralAction, { action: "product_create" }>,
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
        createElement(GeneralProductCreateEditor, {
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

test("blank prices can be saved as an editable draft with a corrected category", async () => {
  const ui = await mount(
    productCreateDraft(
      { action: "product_create", name: "T-shirt", canonicalUnitName: "Piece" },
      "NGN",
    ),
  )
  await ui.type("category", "clothing")
  await ui.submit()
  const result = ui.saved[0]
  expect(result?.action).toBe("product_create")
  if (result?.action !== "product_create") throw Error("Expected product")
  expect(result.categoryKey).toBe("clothing")
  expect(result.categorySuggested).toBe(false)
  expect(result.priceMinor).toBeUndefined()
  expect(productCreateIssues(result).length).toBeGreaterThan(0)
  await ui.close()
})
test("editing a pack count and stated price recalculates stock and keeps derived price provenance", async () => {
  const draft = productCreateDraft(
    {
      action: "product_create",
      name: "Eggs",
      canonicalUnitName: "Piece",
      priceMinor: 20000,
      sellingUnits: [
        { name: "Crate", containsQuantity: "" },
        {
          name: "Carton",
          containsQuantity: "",
          referenceUnitName: "Crate",
          referenceQuantity: "12",
        },
      ],
      variants: [
        {
          selections: [],
          priceMinor: 20000,
          sellingUnitPrices: [{ unitName: "Crate", priceMinor: 600000 }],
          stockByUnit: [
            { unitName: "Carton", quantity: "200" },
            { unitName: "Crate", quantity: "10" },
          ],
        },
      ],
    },
    "NGN",
  )
  const ui = await mount(draft)
  await ui.type("pack-0", "24")
  await ui.type("0-1", "5000")
  await ui.submit()
  const saved = ui.saved[0]
  if (saved?.action !== "product_create") throw Error("Expected product")
  const revised = productCreateDraft(saved, "NGN")
  expect(revised.variants?.[0]?.openingStock).toBe("57840")
  expect(
    revised.variants?.[0]?.sellingUnitPrices?.find(
      (price) => price.unitName === "Carton",
    ),
  ).toEqual({
    unitName: "Carton",
    priceMinor: 6000000,
    derivedFromUnit: "Crate",
  })
  expect(revised.variants?.[0]?.stockByUnit).toEqual(
    draft.variants?.[0]?.stockByUnit,
  )
  await ui.close()
})
