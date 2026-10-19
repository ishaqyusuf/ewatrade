import { afterEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { DOMParser } from "@xmldom/xmldom"
import { act, createElement } from "react"

// The actual useSaleFulfillment and the actual getSaleFulfillmentOption, with
// a controllable clock. Ports: AppState hands its listener to the probe. The
// hook must read time only in effects (the React Compiler caches render
// values), catch up once when the due time is reached, and never loop.
let appStateListener: ((state: string) => void) | null = null
mock.module("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appStateListener = listener
      return {
        remove: () => {
          appStateListener = null
        },
      }
    },
  },
}))
const plain = (await import("./use-sale-fulfillment")).useSaleFulfillment

// The app builds with the React Compiler (app.config reactCompiler: true),
// which caches render values on their inputs. Compile the actual hook the
// same way so each scenario also runs against the compiled build.
async function compiledHook() {
  const { transformAsync } = await import("@babel/core")
  const hookPath = new URL("./use-sale-fulfillment.ts", import.meta.url)
  const source = readFileSync(hookPath, "utf8").replace(
    "@/components/mobile/sale-checkout-model",
    new URL("../sale-checkout-model.ts", import.meta.url).pathname,
  )
  const output = await transformAsync(source, {
    filename: hookPath.pathname,
    babelrc: false,
    configFile: false,
    presets: ["@babel/preset-typescript"],
    plugins: [["babel-plugin-react-compiler", { target: "19" }]],
  })
  if (!output?.code?.includes("react/compiler-runtime"))
    throw Error("React Compiler did not compile the hook")
  // Inside the app's node_modules cache (gitignored) so bare imports resolve.
  const dir = new URL(
    "../../../../node_modules/.cache/sale-fulfillment/",
    import.meta.url,
  )
  mkdirSync(dir, { recursive: true })
  const file = new URL(`use-sale-fulfillment-${process.pid}.mjs`, dir)
  writeFileSync(file, output.code)
  return (await import(file.pathname)).useSaleFulfillment as typeof plain
}
const compiled = await compiledHook()

const realNow = Date.now
let fakeNow = 1_760_000_000_000
afterEach(() => {
  Date.now = realNow
})
const at = (ms: number) => {
  fakeNow = ms
  Date.now = () => fakeNow
}

type Option = ReturnType<typeof plain>
async function mount(
  useSaleFulfillment: typeof plain,
  initial: { dueAt: number; product?: boolean },
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
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  let option: Option | undefined
  let renders = 0
  function Probe(props: { dueAt: number; product: boolean }) {
    renders++
    option = useSaleFulfillment({
      deliveryDueAt: new Date(props.dueAt),
      hasProductLines: props.product,
      requested: true,
    })
    return null
  }
  const render = (dueAt: number, product = initial.product ?? true) =>
    act(async () => root.render(createElement(Probe, { dueAt, product })))
  await render(initial.dueAt)
  return {
    render,
    get option() {
      if (!option) throw Error("hook not rendered")
      return option
    },
    get renders() {
      return renders
    },
    close: () => act(async () => root.unmount()),
  }
}

for (const [build, hook] of [
  ["source", plain],
  ["React Compiler build", compiled],
] as const)
  describe(build, () => {
    test("a future delivery keeps fulfilment unavailable", async () => {
      at(1_000_000)
      const ui = await mount(hook, { dueAt: 1_000_000 + 3_600_000 })
      try {
        expect(ui.option.canFulfillNow).toBe(false)
        expect(ui.option.reason).toContain("scheduled delivery time")
      } finally {
        await ui.close()
      }
    })

    test("moving the due time back to now catches the clock up once and enables fulfilment, without looping", async () => {
      at(2_000_000)
      const ui = await mount(hook, { dueAt: 2_000_000 + 86_400_000 })
      try {
        expect(ui.option.canFulfillNow).toBe(false)
        // Real time moves on; the draft's due time snaps back to "now".
        at(2_000_000 + 400_000)
        await ui.render(2_000_000 + 400_000)
        expect(ui.option.canFulfillNow).toBe(true)
        expect(ui.option.fulfillNow).toBe(true)
        const settled = ui.renders
        // Time keeps moving and nothing else changes: no further renders.
        at(2_000_000 + 900_000)
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30))
        })
        expect(ui.renders).toBe(settled)
      } finally {
        await ui.close()
      }
    })

    test("a due time a moment ahead enables itself when it arrives", async () => {
      Date.now = realNow
      const ui = await mount(hook, { dueAt: realNow() + 80 })
      try {
        expect(ui.option.canFulfillNow).toBe(false)
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 250))
        })
        expect(ui.option.canFulfillNow).toBe(true)
      } finally {
        await ui.close()
      }
    })

    test("returning to the app re-reads the clock", async () => {
      at(3_000_000)
      const ui = await mount(hook, { dueAt: 3_000_000 + 3_600_000 })
      try {
        expect(ui.option.canFulfillNow).toBe(false)
        at(3_000_000 + 7_200_000)
        await act(async () => appStateListener?.("active"))
        expect(ui.option.canFulfillNow).toBe(true)
      } finally {
        await ui.close()
      }
    })

    test("without Product lines the reason is unchanged", async () => {
      at(4_000_000)
      const ui = await mount(hook, { dueAt: 4_000_000, product: false })
      try {
        expect(ui.option.canFulfillNow).toBe(false)
        expect(ui.option.reason).toBe(
          "Only Product lines use stock fulfillment.",
        )
      } finally {
        await ui.close()
      }
    })
  })
