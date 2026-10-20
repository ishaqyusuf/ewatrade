import { expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DOMImplementation } from "@xmldom/xmldom"
import { type ComponentProps, type ReactNode, act, createElement } from "react"
import type { ProductFormResumeState } from "../../../../apps/dashboard/src/components/product-assistant/product-form-resume"
import { catalogChoiceDraftIdentity } from "../../../../apps/dashboard/src/lib/catalog-choice-drafts"
import { workflowConversationAppLink } from "../../src/channels/workflow"
import { productFormSnapshotSchema } from "../../src/product/contracts"

// Actual mounted CatalogItemForm + its real react-hook-form provider, QueryClient,
// resume helpers and command construction. Synthetic RPC/URL/UI boundaries only:
// no authenticated browser, domain execution, storage, model or network acceptance.
const root = new URL("../../../../", import.meta.url)
const at = (path: string) =>
  new URL(`apps/dashboard/src/${path}`, root).pathname
const pass = ({ children }: { children?: ReactNode }) => <>{children}</>
const leaf =
  (tag: string) =>
  ({ children }: { children?: ReactNode }) =>
    createElement(tag, {}, children)
const Button = (props: ComponentProps<"button">) => <button {...props} />
const Input = (props: ComponentProps<"input">) => <input {...props} />
mock.module("@ewatrade/ui", () => ({
  Alert: leaf("aside"),
  AlertDescription: leaf("p"),
  AlertTitle: leaf("h2"),
  Badge: pass,
  Button,
  CurrencyInput: ({
    currencyCode: _currency,
    onValueChange,
    ...props
  }: ComponentProps<"input"> & {
    currencyCode?: string
    onValueChange?: (value: string) => void
  }) => (
    <input
      {...props}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
  ),
  FieldGroup: pass,
  FieldLabel: leaf("label"),
  FieldLegend: pass,
  FieldSet: pass,
  Input,
  SelectControl: pass,
  Separator: () => <hr />,
  SubmitButton: ({
    isSubmitting: _submitting,
    ...props
  }: ComponentProps<"button"> & { isSubmitting?: boolean }) => (
    <Button {...props} />
  ),
  Textarea: (props: ComponentProps<"textarea">) => <textarea {...props} />,
  ToggleGroup: pass,
  ToggleGroupItem: Button,
  Field: pass,
}))
for (const [path, exports] of [
  [
    "components/catalog-item/catalog-appearance.tsx",
    { useCatalogThemeClass: () => "" },
  ],
  [
    "components/catalog-item/product-usage-field.tsx",
    { ProductUsageField: () => null },
  ],
  [
    "components/catalog-item/catalog-category-editor.tsx",
    { CatalogCategoryEditor: () => null },
  ],
  [
    "components/catalog-item/catalog-options-editor.tsx",
    { CatalogOptionsEditor: () => null },
  ],
  [
    "components/catalog-item/catalog-selling-units-editor.tsx",
    { CatalogSellingUnitsEditor: () => null },
  ],
  [
    "components/catalog-item/catalog-image-editor.tsx",
    { CatalogImageEditor: () => null },
  ],
  [
    "components/catalog-item/catalog-guidance-suggestions.tsx",
    { CatalogGuidanceSuggestions: () => null },
  ],
  [
    "components/catalog-item/catalog-setup-helper-picker.tsx",
    { CatalogSetupHelperPicker: () => null },
  ],
  [
    "components/catalog-item/catalog-item-skeleton.tsx",
    { CatalogItemSkeleton: () => <p>Loading product</p> },
  ],
  [
    "components/forms/form-feedback.tsx",
    { FormFeedback: ({ message }: { message?: string }) => <p>{message}</p> },
  ],
  ["components/stores/store-selector.tsx", { StoreSelector: () => null }],
  [
    "components/modals/confirm-draft-modal.tsx",
    { ConfirmDraftModal: () => null },
  ],
  ["components/qa/qa-quick-fill.tsx", { QaDashboardQuickFill: () => null }],
  [
    "components/qa/fixture-recipes.ts",
    {
      createCatalogFixture: () => {
        throw Error("QA quick fill not part of resume")
      },
    },
  ],
] as const)
  mock.module(at(path), () => exports)
mock.module(at("components/catalog-item/catalog-detail-editor.tsx"), () => ({
  CatalogDetailEditor: pass,
  CatalogDetailRow: pass,
  CatalogEditorPanel: pass,
  CatalogFooterLabel: pass,
  useCatalogEditorStack: () => ({
    active: "main",
    parent: "main",
    containerRef: { current: null },
    open() {},
    back() {},
  }),
}))
mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, push() {} }),
}))
let backToForm: (() => unknown) | undefined
mock.module(at("components/product-assistant/product-chat.tsx"), () => ({
  ProductChat: ({ onBack }: { onBack: () => unknown }) => {
    backToForm = onBack
    return <p>Saved Product chat</p>
  },
}))
const storeId = "original-store"
const conversationId = "saved-rich-product"
const groups = [{ id: "quality", name: "Quality", values: "Premium, Standard" }]
const identity = (value: string) =>
  catalogChoiceDraftIdentity(
    [{ groupKey: "group-1", valueKey: value }],
    [
      {
        id: "quality",
        key: "group-1",
        values: [
          { key: "value-1", label: "Premium" },
          { key: "value-2", label: "Standard" },
        ],
      },
    ],
  )
const rich = productFormSnapshotSchema.parse({
  form: {
    kind: "product",
    name: "Rice",
    description: "Owner rich description",
    unitName: "Kg",
    price: "120.50",
    openingStockQuantity: "0",
    usage: "BOTH",
  },
  storeId,
  category: "Staples",
  illustrationId: "rice",
  photoAssetIds: ["owned-original-photo"],
  sku: "RICE-EXACT",
  barcode: "0000123456",
  showAdvanced: true,
  showUnits: true,
  showDescription: true,
  showOpeningStock: true,
  selectedHelperKey: null,
  canonicalTransactionScale: 3,
  optionGroups: groups,
  variantDrafts: Object.fromEntries(
    [
      ["value-1", "130.75", "2.125", "PREMIUM", "0000001"],
      ["value-2", "120.50", "1.125", "STANDARD", "0000002"],
    ].map(([key, price, quantity, sku, barcode]) => [
      identity(key ?? ""),
      {
        barcode,
        enabled: true,
        price,
        quantity,
        quoteRequired: false,
        sku,
        storeIds: [storeId],
        unitPrices: { sack: "6500" },
      },
    ]),
  ),
  additionalUnits: [
    {
      id: "sack",
      name: "Sack",
      price: "6000",
      referenceId: "canonical",
      relationCount: "50",
      relationDirection: "canonical_per_unit",
      stockBehavior: "packaged_stock",
      transactionScale: 0,
    },
    {
      id: "pallet",
      name: "Pallet",
      price: "120000",
      referenceId: "sack",
      relationCount: "20",
      relationDirection: "canonical_per_unit",
      stockBehavior: "packaged_stock",
      transactionScale: 0,
    },
  ],
})
let saved: ProductFormResumeState = {
  conversation: { id: conversationId, status: "ACTIVE" },
  snapshot: rich,
  running: false,
  receipt: null,
  draft: {
    revision: 7,
    entities: [
      {
        key: "product",
        payload: {
          kind: "product",
          name: "Corrected rice",
          unitName: "Kg",
          priceMinor: 12575,
          openingStock: "0",
          sellingUnits: [
            { name: "Do not flatten rich units", containsQuantity: "10" },
          ],
        },
      },
    ],
  },
}
let mode = "chat"
let selected: string | null = conversationId
let generation = 1
let reads = 0
const commands: unknown[] = []
let ordinaryCreates = 0
let starts = 0
const stateKey = ["product", "state", conversationId]
const changed: string[] = []
const closed: (string | null)[] = []
const mutation = (fn: (input: unknown) => Promise<unknown>) => ({
  mutationOptions: (options: Record<string, unknown> = {}) => ({
    mutationFn: fn,
    ...options,
  }),
})
const key = (path: string[]) => ({ queryKey: () => path, pathKey: () => path })
const client = {
  productAssistant: {
    state: {
      query: async (input: { conversationId: string }) => {
        expect(input.conversationId).toBe(conversationId)
        reads++
        return structuredClone(saved)
      },
    },
  },
}
const trpc = {
  productAssistant: {
    pathKey: () => ["product"],
    state: { queryKey: () => stateKey },
    capabilities: {
      queryOptions: () => ({
        queryKey: ["capabilities"],
        queryFn: async () => ({ enabled: true }),
      }),
    },
    start: mutation(async () => {
      starts++
      throw Error("Resume must not start another chat")
    }),
    updateSnapshot: mutation(async () => {
      throw Error("This case uses explicit saved draft reload")
    }),
    createFromForm: mutation(async (input) => {
      commands.push(structuredClone(input))
      if (commands.length < 3)
        throw Error("Synthetic save failure; no domain effect")
      return {
        recordId: "synthetic-response-only-product",
        name: "Saved revision eight",
      }
    }),
  },
  tenant: {
    stores: {
      queryOptions: () => ({
        queryKey: ["stores"],
        queryFn: async () => [{ id: storeId, name: "Original Store" }],
      }),
    },
    featureAvailability: key(["tenant", "availability"]),
  },
  catalog: {
    pathKey: () => ["catalog"],
    listItems: key(["catalog", "items"]),
    listItemsPage: key(["catalog", "page"]),
    createItem: mutation(async () => {
      ordinaryCreates++
      throw Error("Ordinary create forbidden for saved chat")
    }),
    createSimpleItem: mutation(async () => {
      ordinaryCreates++
      throw Error("Ordinary create forbidden for saved chat")
    }),
    photos: {
      createIntent: mutation(async () => {
        throw Error("Original photo reuse must not upload")
      }),
    },
  },
}
mock.module(at("trpc/client.tsx"), () => ({
  useTRPC: () => trpc,
  useTRPCClient: () => client,
  getDataCacheGeneration: () => generation,
}))
mock.module(at("hooks/use-catalog-item-params.ts"), () => ({
  useCatalogItemParams: () => ({
    catalogCreateMode: mode,
    catalogConversation: selected,
    setCatalogItemMode: async (next: string | null) => {
      closed.push(next)
    },
    setParams: async (next: {
      catalogCreateMode?: string
      catalogConversation?: string | null
    }) => {
      if (next.catalogCreateMode) mode = next.catalogCreateMode
      if (next.catalogConversation !== undefined)
        selected = next.catalogConversation
    },
  }),
}))
const { CatalogItemForm } = await import(
  "../../../../apps/dashboard/src/components/catalog-item/form"
)
const { CatalogItemFormProvider } = await import(
  "../../../../apps/dashboard/src/components/catalog-item/form-context"
)

async function mounted() {
  const document = new DOMImplementation().createDocument(
    "http://www.w3.org/1999/xhtml",
    "html",
    null,
  )
  const window = {
    document,
    HTMLIFrameElement: class {},
    HTMLElement: class {},
    addEventListener() {},
    removeEventListener() {},
  }
  Object.assign(globalThis, {
    window,
    document,
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
      focus() {},
      addEventListener() {},
      removeEventListener() {},
    })
  const text = document.createTextNode.bind(document)
  document.createTextNode = (value: string) => {
    const node = text(value)
    Object.defineProperty(node, "nodeValue", {
      get: () => node.data,
      set: (next: string) => {
        node.data = next
      },
    })
    return node
  }
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const render = () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <CatalogItemFormProvider initialKind="product">
          <CatalogItemForm
            currencyCode="NGN"
            storeId={storeId}
            businessProfileKey={null}
            onCreated={(name) => changed.push(name)}
          />
        </CatalogItemFormProvider>
      </QueryClientProvider>,
    )
  const settle = async () => {
    await act(async () => {
      render()
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  const node = (tag: string, id?: string) => {
    const found = Array.from(host.getElementsByTagName(tag)).find(
      (entry) => !id || entry.getAttribute("id") === id,
    )
    if (!found) throw Error(`Missing mounted ${tag}:${id}`)
    return found
  }
  const invoke = async (element: object, event: string, value?: unknown) => {
    const props = Object.entries(element).find(([key]) =>
      key.startsWith("__reactProps$"),
    )?.[1]
    if (!props || typeof props[event] !== "function")
      throw Error(`Mounted ${event} callback unavailable`)
    await act(async () => {
      await props[event](value)
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
    await settle()
  }
  return {
    host,
    node,
    settle,
    invoke,
    queryClient,
    close: async () => {
      await act(async () => root.unmount())
      queryClient.clear()
    },
  }
}

test("mounted rich Product resume restores owner facts, submits only same-chat commands and refuses stale local edits until explicit reload", async () => {
  const href = workflowConversationAppLink(
    {
      purpose: "PRODUCT_CREATE",
      conversationId,
      origin: { tenantId: "business", storeId },
    },
    {
      trustedAppOrigin: "https://dashboard.example.test",
      currentScope: { tenantId: "business", storeId },
    },
  )
  if (!href) throw Error("Exact saved Product link required")
  const params = new URL(href).searchParams
  expect(params.get("catalogConversation")).toBe(conversationId)
  expect(params.get("catalogCreateMode")).toBe("chat")
  const originalFetch = globalThis.fetch
  let external = 0
  globalThis.fetch = Object.assign(
    async () => {
      external++
      throw Error("Network forbidden in mounted Product fixture")
    },
    {
      preconnect: () => {
        external++
        throw Error("Network forbidden")
      },
    },
  )
  try {
    const fixture = await mounted()
    try {
      await fixture.settle()
      await fixture.settle()
      expect(fixture.host.toString()).toContain("Saved Product chat")
      expect(backToForm).toBeFunction()
      await act(async () => {
        await backToForm?.()
      })
      await fixture.settle()
      expect(mode).toBe("form")
      expect(fixture.node("form").hasAttribute("hidden")).toBe(false)
      const name = fixture.node("input", "catalog-item-name")
      expect(Reflect.get(name, "value")).toBe("Corrected rice")
      await fixture.invoke(name, "onChange", {
        target: { value: "Locally edited rice" },
      })
      const submit = () =>
        fixture.invoke(fixture.node("form"), "onSubmit", {
          preventDefault() {},
        })
      await submit()
      expect(commands).toHaveLength(1)
      const first = commands[0]
      expect(first).toMatchObject({
        conversationId,
        expectedRevision: 7,
        command: {
          mode: "advanced",
          input: {
            kind: "product",
            name: "Locally edited rice",
            category: "Staples",
            description: "Owner rich description",
            photoAssetIds: ["owned-original-photo"],
            storeId,
            usage: "BOTH",
          },
        },
      })
      const encoded = JSON.stringify(first)
      for (const exact of [
        "0000001",
        "0000002",
        "2.125",
        "1.125",
        "PREMIUM",
        "STANDARD",
        "Sack",
        "Pallet",
        '"factor":"50"',
        '"factor":"1000"',
        '"fixedPriceMinor":13075',
        '"fixedPriceMinor":650000',
      ])
        expect(encoded).toContain(exact)
      expect(encoded).not.toContain("Do not flatten rich units")
      expect(ordinaryCreates).toBe(0)
      expect(starts).toBe(0)
      expect(changed).toEqual([])
      await submit()
      expect(commands).toHaveLength(2)
      expect(commands[1]).toEqual(first)
      saved = {
        ...saved,
        draft: {
          ...saved.draft,
          revision: 8,
          entities: [
            {
              key: "product",
              payload: {
                kind: "product",
                name: "Saved revision eight",
                unitName: "Kg",
                priceMinor: 12675,
                openingStock: "0",
              },
            },
          ],
        },
      }
      await act(async () => {
        await fixture.queryClient.invalidateQueries({ queryKey: stateKey })
      })
      await fixture.settle()
      expect(fixture.host.toString()).toContain(
        "The saved product draft changed",
      )
      expect(
        Reflect.get(fixture.node("input", "catalog-item-name"), "value"),
      ).toBe("Locally edited rice")
      await submit()
      expect(commands).toHaveLength(2)
      const reload = Array.from(
        fixture.host.getElementsByTagName("button"),
      ).find((button) => button.textContent?.includes("Reload saved draft"))
      if (!reload)
        throw Error("Actual explicit saved-draft reload control required")
      await fixture.invoke(reload, "onClick")
      expect(
        Reflect.get(fixture.node("input", "catalog-item-name"), "value"),
      ).toBe("Saved revision eight")
      await submit()
      expect(commands).toHaveLength(3)
      expect(commands[2]).toMatchObject({
        conversationId,
        expectedRevision: 8,
        command: {
          mode: "advanced",
          input: {
            name: "Saved revision eight",
            photoAssetIds: ["owned-original-photo"],
          },
        },
      })
      expect(changed).toEqual(["Saved revision eight"])
      expect(closed).toEqual([null])
      generation++
      await fixture.settle()
      await submit()
      expect(commands).toHaveLength(3)
      expect(ordinaryCreates).toBe(0)
      expect(starts).toBe(0)
      expect(reads).toBeGreaterThanOrEqual(3)
      expect(selected).toBe(conversationId)
    } finally {
      await fixture.close()
    }
  } finally {
    globalThis.fetch = originalFetch
    expect(external).toBe(0)
  }
}, 10_000)
