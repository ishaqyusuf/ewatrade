import { afterEach, expect, mock, test } from "bun:test"
import { DOMImplementation } from "@xmldom/xmldom"
import dynamic from "next/dist/shared/lib/app-dynamic"
import {
  Component,
  type ComponentProps,
  type ReactNode,
  Suspense,
  act,
} from "react"

const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const window = {
  document,
  HTMLIFrameElement: class {},
  HTMLElement: document.documentElement.constructor,
  addEventListener() {},
  removeEventListener() {},
}
Object.assign(globalThis, {
  window,
  document,
  HTMLElement: window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})
Object.assign(document, {
  defaultView: window,
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
})
const createElement = document.createElement.bind(document)
document.createElement = (name: string) => {
  const element = Object.assign(createElement(name), {
    style: {},
    focus() {
      Object.assign(document, { activeElement: element })
    },
    contains(node: Node | null) {
      let current = node
      while (current) {
        if (current === element) return true
        current = current.parentNode
      }
      return false
    },
    addEventListener() {},
    removeEventListener() {},
  })
  Object.defineProperty(element, "isConnected", {
    get: () => Boolean(element.parentNode),
  })
  return element
}
const createText = document.createTextNode.bind(document)
document.createTextNode = (value: string) => {
  const node = createText(value)
  Object.defineProperty(node, "nodeValue", {
    get: () => node.data,
    set: (next: string) => {
      node.data = next
    },
  })
  return node
}
const operations: string[] = []
mock.module("@/observability/sentry", () => ({
  captureDashboardError: (_error: unknown, operation: string) => {
    operations.push(operation)
  },
}))
mock.module("@ewatrade/ui", () => ({
  Button: (props: ComponentProps<"button">) => <button {...props} />,
}))
const { createRoot } = await import("react-dom/client")
const { ActivatedSheet } = await import("./activated-sheet")
const { loadSheetCode } = await import("./load-sheet-code")
const container = document.createElement("div")
document.documentElement.appendChild(container)
const opener = document.createElement("button")
document.documentElement.appendChild(opener)
let root = createRoot(container as unknown as HTMLElement)
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <output>page-error</output> : this.props.children
  }
}
async function render(content: ReactNode) {
  await act(async () => {
    root.render(
      <Boundary>
        <Suspense fallback={<output>opening</output>}>{content}</Suspense>
      </Boundary>,
    )
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
function retry() {
  const button = container.getElementsByTagName("button")[0]
  expect(button).toBeDefined()
  if (!button) throw new Error("Missing retry button")
  const key = Object.keys(button).find((name) =>
    name.startsWith("__reactProps$"),
  )
  if (!key) throw new Error("Missing React button event owner")
  const props = (button as unknown as Record<string, { onClick: () => void }>)[
    key
  ]
  if (!props) throw new Error("Missing retry button props")
  Object.assign(document, { activeElement: button })
  props.onClick()
}
afterEach(async () => {
  await act(async () => root.unmount())
  root = createRoot(container as unknown as HTMLElement)
  Object.assign(document, { activeElement: opener })
  operations.length = 0
})

test("actual App loadable retries a failed import locally and renders current props", async () => {
  Object.assign(document, { activeElement: opener })
  let calls = 0
  let release:
    | ((value: (props: { label: string }) => ReactNode) => void)
    | undefined
  const Deferred = dynamic(() =>
    loadSheetCode<{ label: string }>(() => {
      calls++
      if (calls === 1) return Promise.reject(new Error("inert import failure"))
      return new Promise((resolve) => {
        release = resolve
      })
    }),
  )
  await render(
    <ActivatedSheet active>
      <Deferred label="before" />
    </ActivatedSheet>,
  )
  expect(container.textContent).toContain("Couldn’t open this panel.")
  expect(container.textContent).not.toContain("page-error")
  expect(calls).toBe(1)
  await act(async () => {
    retry()
    retry()
  })
  expect(calls).toBe(2)
  expect(container.textContent).toContain("Opening…")
  await render(
    <ActivatedSheet active>
      <Deferred label="current" />
    </ActivatedSheet>,
  )
  await act(async () => {
    release?.(({ label }) => <output>{label}</output>)
  })
  await settle()
  expect(container.textContent).toBe("current")
  expect(
    (document as unknown as { activeElement: unknown }).activeElement,
  ).toBe(opener)
  expect(operations).toEqual(["sheet.code.load"])
})

test("repeated failure stays local; recovered code is reused after remount", async () => {
  let calls = 0
  const Deferred = dynamic(() =>
    loadSheetCode(async () => {
      calls++
      if (calls < 3) throw new Error("inert import failure")
      return () => <output>ready</output>
    }, "body"),
  )
  await render(<Deferred key="first" />)
  await act(async () => retry())
  await settle()
  expect(container.textContent).toContain("Try again")
  expect(calls).toBe(2)
  await act(async () => retry())
  await settle()
  expect(container.textContent).toBe("ready")
  await render(<Deferred key="second" />)
  expect(container.textContent).toBe("ready")
  expect(calls).toBe(3)
  expect(operations).toEqual(["sheet.code.load", "sheet.code.load"])
})

test("a late retry cannot revive an old scope or steal focus", async () => {
  let calls = 0
  let release:
    | ((value: (props: { scope: string }) => ReactNode) => void)
    | undefined
  const mounts: string[] = []
  const Deferred = dynamic(() =>
    loadSheetCode<{ scope: string }>(() => {
      calls++
      if (calls === 1) return Promise.reject(new Error("inert import failure"))
      return new Promise((resolve) => {
        release = resolve
      })
    }),
  )
  await render(
    <ActivatedSheet active key="old">
      <Deferred scope="old" />
    </ActivatedSheet>,
  )
  await act(async () => retry())
  await render(<output>new scope</output>)
  Object.assign(document, { activeElement: opener })
  await act(async () =>
    release?.(({ scope }) => {
      mounts.push(scope)
      return <output>{scope}</output>
    }),
  )
  expect(container.textContent).toBe("new scope")
  expect(mounts).toEqual([])
  expect(
    (document as unknown as { activeElement: unknown }).activeElement,
  ).toBe(opener)
  await render(
    <ActivatedSheet active key="new">
      <Deferred scope="new" />
    </ActivatedSheet>,
  )
  expect(container.textContent).toBe("new")
  expect(mounts).toEqual(["new"])
  expect(calls).toBe(2)
})

test("closed activated feedback hides and a late retry receives current closed props", async () => {
  let calls = 0
  let release:
    | ((value: (props: { open: boolean }) => ReactNode) => void)
    | undefined
  const Deferred = dynamic(() =>
    loadSheetCode<{ open: boolean }>(() => {
      calls++
      if (calls === 1) return Promise.reject(new Error("inert import failure"))
      return new Promise((resolve) => {
        release = resolve
      })
    }),
  )
  const content = (active: boolean) => (
    <ActivatedSheet active={active}>
      <Deferred open={active} />
    </ActivatedSheet>
  )
  await render(content(true))
  await render(content(false))
  expect(container.textContent).toBe("")
  await render(content(true))
  await act(async () => retry())
  await render(content(false))
  Object.assign(document, { activeElement: opener })
  await act(async () =>
    release?.(({ open }) => (open ? <output>open</output> : null)),
  )
  expect(container.textContent).toBe("")
  expect(
    (document as unknown as { activeElement: unknown }).activeElement,
  ).toBe(opener)
  await render(content(true))
  expect(container.textContent).toBe("open")
  expect(calls).toBe(2)
})

test("body recovery stays inline within its owner even without global active context", async () => {
  const Deferred = dynamic(() =>
    loadSheetCode(async () => {
      throw new Error("inert import failure")
    }, "body"),
  )
  await render(
    <section>
      <h1>Existing frame</h1>
      <Deferred />
    </section>,
  )
  expect(container.textContent).toContain(
    "Existing frameCouldn’t open this panel.",
  )
  expect(container.getElementsByTagName("button").length).toBe(1)
  expect(container.getElementsByTagName("section")[0]?.textContent).toContain(
    "Try again",
  )
  expect(container.toString()).not.toContain("fixed bottom")
})

test("ordinary feature errors still reach their existing boundary", async () => {
  let calls = 0
  const Deferred = dynamic(() =>
    loadSheetCode(async () => {
      calls++
      return function BrokenFeature() {
        throw new Error("inert render failure")
      }
    }, "body"),
  )
  await render(<Deferred />)
  expect(container.textContent).toBe("page-error")
  expect(calls).toBe(1)
  expect(operations).toEqual([])
})
