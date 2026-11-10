import { expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { act, createElement } from "react"
import type { CreateSaleViewModel } from "./create-sale-presentation"

// Exercise the actual hook with real React state/effects and inert transport.
// No camera, device, provider, database or business fixture is involved.
const source = new URL("../../../", import.meta.url)
const port = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, source).pathname, () => exports)
const match = {
  catalogItemId: "item",
  offeringId: "offering",
  itemName: "QA item",
  offeringName: "Default",
  variantName: "Default",
  unitName: "piece",
  matchedBy: "barcode" as const,
}
const row = { id: "offering", name: "QA item" }
const endpoint = (path: string) => ({ queryOptions: () => ({ path }) })
port("trpc/client", {
  useTRPC: () => ({
    catalog: { findByCode: endpoint("code"), getItem: endpoint("item") },
    tenant: { featureAvailability: endpoint("store") },
  }),
})
mock.module("expo", () => ({ requireOptionalNativeModule: () => ({}) }))
let fetch: (path: string) => Promise<unknown>
mock.module("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    fetchQuery: (options: { path: string }) => fetch(options.path),
  }),
}))
port("components/mobile/create-sale/create-sale-model", {
  saleOfferingChoices: () => [row],
})
const { useSaleScan } = await import("./use-sale-scan")

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
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
  const added: unknown[] = []
  let latest: ReturnType<typeof useSaleScan> | undefined
  // Only this hook's model port is supplied; its callbacks are the actual
  // cancellation/lookup path under test, not a copied scanner implementation.
  const model = {
    allRows: [],
    selectedLines: [],
    itemKind: "product",
    isOffline: false,
    actionsLocked: false,
    productSearch: "",
    addOffering: (value: unknown) => added.push(value),
    updateQuantity: () => {
      throw Error("No existing line in this fixture")
    },
  } as unknown as CreateSaleViewModel
  function Probe() {
    latest = useSaleScan(model)
    return null
  }
  await act(async () => root.render(createElement(Probe)))
  return {
    added,
    get scan() {
      if (!latest) throw Error("Hook not mounted")
      return latest
    },
    async unmount() {
      await act(async () => root.unmount())
    },
  }
}

for (const cancel of ["close", "searchByName", "open", "unmount"] as const)
  test(`a delayed Store read cannot add an item after ${cancel}`, async () => {
    const store = deferred<{ storeId: string }>()
    const enteredStore = deferred<void>()
    fetch = async (path) => {
      if (path === "code") return { status: "found", match }
      if (path === "item") return { id: "item" }
      if (path === "store") {
        enteredStore.resolve()
        return store.promise
      }
      throw Error(`Unexpected read ${path}`)
    }
    const ui = await mount()
    let pending!: Promise<void>
    await act(async () => {
      pending = ui.scan.read("0012")
      await enteredStore.promise
    })
    if (cancel === "unmount") await ui.unmount()
    else await act(async () => ui.scan[cancel]())
    await act(async () => {
      store.resolve({ storeId: "store" })
      await pending
    })
    expect(ui.added).toEqual([])
    if (cancel !== "unmount") {
      expect(ui.scan.added).toBeNull()
      await ui.unmount()
    }
  })

test("the current lookup still adds exactly one identified offering", async () => {
  fetch = async (path) => {
    if (path === "code") return { status: "found", match }
    if (path === "item") return { id: "item" }
    if (path === "store") return { storeId: "store" }
    throw Error(`Unexpected read ${path}`)
  }
  const ui = await mount()
  await act(async () => ui.scan.read("0012"))
  expect(ui.added).toEqual([row])
  expect(ui.scan.added?.quantity).toBe("1")
  await ui.unmount()
})

test("a shared-code selection failure cannot restore a notice after closing", async () => {
  const item = deferred<unknown>()
  fetch = async (path) => {
    if (path === "code")
      return { status: "ambiguous", code: "0012", matches: [match] }
    if (path === "item") return item.promise
    throw Error(`Unexpected read ${path}`)
  }
  const ui = await mount()
  await act(async () => ui.scan.read("0012"))
  expect(ui.scan.choices?.matches).toEqual([match])
  await act(async () => ui.scan.choose(match))
  await act(async () => ui.scan.searchByName())
  await act(async () => {
    item.reject(Error("Read failed after leaving"))
    await item.promise.catch(() => {})
  })
  expect(ui.scan.notice).toBeNull()
  expect(ui.added).toEqual([])
  await ui.unmount()
})

test("a current shared-code selection failure stays visible", async () => {
  fetch = async (path) => {
    if (path === "code")
      return { status: "ambiguous", code: "0012", matches: [match] }
    if (path === "item") throw Error("Current read failed")
    throw Error(`Unexpected read ${path}`)
  }
  const ui = await mount()
  await act(async () => ui.scan.read("0012"))
  await act(async () => ui.scan.choose(match))
  expect(ui.scan.notice).toEqual({ kind: "failed" })
  expect(ui.added).toEqual([])
  await ui.unmount()
})
