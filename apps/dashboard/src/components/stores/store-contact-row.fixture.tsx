import { expect, mock, test } from "bun:test"
import { type ReactNode, StrictMode, act, useEffect } from "react"

// The actual component owns all callbacks/effects. Only visual and query/transport
// boundaries stand in; this isolated fixture has no browser, DB or provider.
const source = new URL("../../", import.meta.url)
const standIn = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, source).pathname, () => exports)
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
const buttons = new Map<string, () => unknown>()
let phoneChange: ((event: { target: { value: string } }) => void) | undefined
let dismiss: ((open: boolean) => void) | undefined
standIn("components/forms/form-feedback", { FormFeedback: children })
standIn("components/settings/settings-page", { SettingsRow: children })
mock.module("@ewatrade/ui", () => ({
  Button: ({
    children,
    onClick,
  }: { children: ReactNode; onClick?: () => unknown }) => {
    if (onClick && typeof children === "string") buttons.set(children, onClick)
    return <button type="button">{children}</button>
  },
  Dialog: ({
    children,
    onOpenChange,
  }: { children: ReactNode; onOpenChange: (open: boolean) => void }) => {
    dismiss = onOpenChange
    return <div>{children}</div>
  },
  Input: ({
    onChange,
    value,
  }: { onChange: typeof phoneChange; value: string }) => {
    phoneChange = onChange
    return <span>{value}</span>
  },
  SelectControl: children,
  DialogContent: children,
  DialogDescription: children,
  DialogHeader: children,
  DialogTitle: children,
  Field: children,
  FieldDescription: children,
  FieldError: children,
  FieldGroup: children,
  FieldLabel: children,
  FormActions: children,
  Skeleton: children,
}))

let generation = 0
const initial = {
  id: "store-a",
  name: "Store A",
  countryCode: "NG",
  supportPhone: null,
}
const writes: unknown[] = []
const fetches: unknown[] = []
const cacheWrites: unknown[] = []
const invalidations: unknown[] = []
let failSave = false
let settleSave: (() => void) | undefined
let deferSave = false
const contactQuery = {
  queryOptions: (input: unknown) => ({ queryKey: ["contact", input] }),
  queryKey: (input: unknown) => ["contact", input],
}
standIn("trpc/client", {
  getDataCacheGeneration: () => generation,
  useTRPC: () => ({
    stores: {
      contact: contactQuery,
      updateContact: { mutationOptions: () => ({}) },
    },
    tenant: {
      stores: { queryKey: () => ["stores"] },
      current: { queryKey: () => ["current"] },
    },
  }),
})
mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({
    isSuccess: true,
    isError: false,
    isPending: false,
    data: initial,
  }),
  useMutation: () => ({
    isPending: false,
    mutateAsync: async (input: unknown) => {
      writes.push(input)
      if (failSave) throw new Error("Contact changed. Reload before saving.")
      if (deferSave)
        await new Promise<void>((resolve) => {
          settleSave = resolve
        })
      return { ...initial, supportPhone: "+2348031234567" }
    },
  }),
  useQueryClient: () => ({
    setQueryData: (...input: unknown[]) => cacheWrites.push(input),
    invalidateQueries: async (input: unknown) => {
      invalidations.push(input)
    },
    fetchQuery: async (input: unknown) => {
      fetches.push(input)
      return initial
    },
  }),
}))

const { StoreContactRow } = await import("./store-contact-row")
type Submit = (event: { preventDefault(): void }) => Promise<void>
const submitEvent = { preventDefault() {} }

function reset() {
  buttons.clear()
  phoneChange = undefined
  dismiss = undefined
  generation = 0
  failSave = false
  deferSave = false
  settleSave = undefined
  for (const array of [writes, fetches, cacheWrites, invalidations])
    array.length = 0
}

async function mount() {
  const { DOMImplementation } = await import("@xmldom/xmldom")
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
      addEventListener() {},
      removeEventListener() {},
    })
  const createText = document.createTextNode.bind(document)
  document.createTextNode = (value: string) => {
    const node = createText(value)
    Object.defineProperty(node, "nodeValue", {
      get: () => node.data,
      set: (value: string) => {
        node.data = value
      },
    })
    return node
  }
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  let closed = false
  let effectStarts = 0
  let effectStops = 0
  function Probe() {
    useEffect(() => {
      effectStarts++
      return () => {
        effectStops++
      }
    }, [])
    return null
  }
  await act(async () =>
    root.render(
      <StrictMode>
        <Probe />
        <StoreContactRow storeId="store-a" storeName="Store A" />
      </StrictMode>,
    ),
  )
  await act(async () => {
    buttons.get("Edit contact")?.()
  })
  const submit = () => {
    const form = host.getElementsByTagName("form")[0]
    if (!form) throw new Error("Contact form is not mounted")
    const key = Object.keys(form).find((key) => key.startsWith("__reactProps$"))
    if (!key) throw new Error("Missing actual form props")
    const props = Reflect.get(form, key) as { onSubmit: Submit }
    return props.onSubmit
  }
  return {
    submit,
    effects: () => ({ starts: effectStarts, stops: effectStops }),
    html: () => host.toString(),
    close: async () => {
      if (closed) return
      closed = true
      await act(async () => root.unmount())
    },
  }
}

test("retained actual submit is inert after dialog dismissal and whole-row unmount", async () => {
  for (const mode of ["dismiss", "unmount"] as const) {
    reset()
    const f = await mount()
    try {
      const oldSubmit = f.submit()
      if (mode === "dismiss") await act(async () => dismiss?.(false))
      else await f.close()
      await act(async () => oldSubmit(submitEvent))
      expect(writes).toHaveLength(0)
      expect(cacheWrites).toHaveLength(0)
      expect(invalidations).toHaveLength(0)
    } finally {
      await f.close()
    }
  }
})

test("StrictMode cleanup/reentry retains a working current submit with exact original contact", async () => {
  reset()
  const f = await mount()
  try {
    expect(f.effects()).toEqual({ starts: 2, stops: 1 })
    await act(async () => phoneChange?.({ target: { value: "0803 123 4567" } }))
    await act(async () => f.submit()(submitEvent))
    expect(writes).toEqual([
      {
        storeId: "store-a",
        expected: { supportPhone: null, countryCode: "NG" },
        supportPhone: "0803 123 4567",
        countryCode: "NG",
      },
    ])
    expect(cacheWrites).toHaveLength(1)
    expect(invalidations).toHaveLength(3)
    expect(f.html()).not.toContain("<form")
  } finally {
    await f.close()
  }
})

test("retained submit and Reload callbacks are inert after data-cache generation changes", async () => {
  reset()
  failSave = true
  const f = await mount()
  try {
    await act(async () => f.submit()(submitEvent))
    const oldSubmit = f.submit()
    const oldReload = buttons.get("Reload contact")
    expect(oldReload).toBeDefined()
    generation++
    await act(async () => {
      await oldSubmit(submitEvent)
      await oldReload?.()
    })
    expect(writes).toHaveLength(1)
    expect(fetches).toHaveLength(0)
    expect(cacheWrites).toHaveLength(0)
  } finally {
    await f.close()
  }
})

test("retained actual Reload is inert after dismissal or unmount", async () => {
  for (const mode of ["dismiss", "unmount"] as const) {
    reset()
    failSave = true
    const f = await mount()
    try {
      await act(async () => f.submit()(submitEvent))
      const oldReload = buttons.get("Reload contact")
      expect(oldReload).toBeDefined()
      if (mode === "dismiss") await act(async () => dismiss?.(false))
      else await f.close()
      await act(async () => {
        await oldReload?.()
      })
      expect(fetches).toHaveLength(0)
    } finally {
      await f.close()
    }
  }
})

test("a pending save from an old cache generation cannot write into the new workspace", async () => {
  reset()
  deferSave = true
  const f = await mount()
  try {
    let pending: Promise<void> | undefined
    await act(async () => {
      pending = f.submit()(submitEvent)
    })
    generation++
    await act(async () => {
      settleSave?.()
      await pending
    })
    expect(writes).toHaveLength(1)
    expect(cacheWrites).toHaveLength(0)
    expect(invalidations).toHaveLength(0)
    expect(f.html()).toContain("<form")
  } finally {
    await f.close()
  }
})
