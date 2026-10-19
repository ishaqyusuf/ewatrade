import { expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import {
  type ReactNode,
  act,
  createContext,
  createElement,
  useContext,
} from "react"

// The actual stock-intake-modal route and the actual target parser. Ports
// record the element nesting: on iOS the route is a native modal, so its
// gorhom sheets must host inside a provider within the route, not only in the
// root provider behind the presented UIKit view.
const source = new URL("../../../", import.meta.url)
const port = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, source).pathname, () => exports)
let seen: Array<{
  name: string
  within: string[]
  props: Record<string, unknown>
}> = []
// Ancestry travels through context, so each node knows its real parents.
const Ancestors = createContext<string[]>([])
const node =
  (name: string) =>
  (props: Record<string, unknown> & { children?: ReactNode }) => {
    const within = useContext(Ancestors)
    seen.push({ name, within, props })
    return createElement(
      Ancestors.Provider,
      { value: [...within, name] },
      createElement("div", null, props.children),
    )
  }
mock.module("@gorhom/bottom-sheet", () => ({
  BottomSheetModalProvider: node("BottomSheetModalProvider"),
}))
port("components/mobile/workflow-modal-screen", {
  WorkflowModalScreen: node("WorkflowModalScreen"),
})
port("components/mobile/stock-intake/stock-intake-screen", {
  StockIntakeChrome: () => null,
  StockIntakeContent: node("StockIntakeContent"),
})
let params: Record<string, string> = {}
mock.module("expo-router", () => ({ useLocalSearchParams: () => params }))
const { default: StockIntakeModalRoute } = await import(
  "../../../app/stock-intake-modal"
)

async function render(next: Record<string, string>) {
  params = next
  seen = []
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
  await act(async () => root.render(createElement(StockIntakeModalRoute)))
  await act(async () => root.unmount())
  const find = (name: string) => {
    const hit = seen.find((entry) => entry.name === name)
    if (!hit) throw Error(`${name} not rendered`)
    return hit
  }
  return { find }
}

test("the route hosts its own bottom sheets around the whole workflow screen", async () => {
  const ui = await render({})
  expect(ui.find("BottomSheetModalProvider").within).toEqual([])
  expect(ui.find("WorkflowModalScreen").within).toEqual([
    "BottomSheetModalProvider",
  ])
  expect(ui.find("StockIntakeContent").within).toEqual([
    "BottomSheetModalProvider",
    "WorkflowModalScreen",
  ])
})

test("chrome, title, close label and the parsed target are unchanged", async () => {
  const ui = await render({
    catalogItemId: "catalog-layer-feed",
    storeId: "store",
    variantId: "variant",
  })
  const screen = ui.find("WorkflowModalScreen").props
  expect(screen.title).toBe("Record stock")
  expect(screen.closeLabel).toBe("Close stock intake")
  expect(typeof screen.chrome).toBe("function")
  const content = ui.find("StockIntakeContent").props
  expect(content.presentation).toBe("screen")
  expect(content.target).toMatchObject({ kind: "catalog" })
})

test("a generic entry still renders inside the local sheet host", async () => {
  const ui = await render({})
  const content = ui.find("StockIntakeContent")
  expect(content.props.target).toMatchObject({ kind: "generic" })
  expect(content.within).toContain("BottomSheetModalProvider")
})
