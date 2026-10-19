import { beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { act, createElement } from "react"

// The actual useSaleBackSteps hook under real React. Only the navigation
// port is inert: usePreventRemove records what it was given, and dispatch
// records actions that were allowed to proceed. No native gesture runs.
type Action = { type: string }
let preventing = false
let onRemove: ((event: { data: { action: Action } }) => void) | null = null
const dispatched: Action[] = []
mock.module("@react-navigation/native", () => ({
  useNavigation: () => ({
    dispatch: (action: Action) => dispatched.push(action),
  }),
  usePreventRemove: (
    prevent: boolean,
    callback: (event: { data: { action: Action } }) => void,
  ) => {
    preventing = prevent
    onRemove = callback
  },
}))
const { useSaleBackSteps } = await import("./use-sale-back-steps")

type Step = "items" | "customer" | "review"
type Model = {
  step: Step
  completion: unknown
  isSubmitting: boolean
}
const changes: Array<{ step?: Step; error?: string | null }> = []
beforeEach(() => {
  preventing = false
  onRemove = null
  dispatched.length = 0
  changes.length = 0
})

async function mount(initial: Model) {
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
  let model = initial
  let stepBack: (() => void) | undefined
  function Probe() {
    stepBack = useSaleBackSteps({
      ...model,
      setStep: (step) => {
        changes.push({ step })
        model = { ...model, step }
      },
      setError: (error) => changes.push({ error }),
    })
    return null
  }
  const render = async () => act(async () => root.render(createElement(Probe)))
  await render()
  return {
    set: async (patch: Partial<Model>) => {
      model = { ...model, ...patch }
      await render()
    },
    rerender: render,
    get model() {
      return model
    },
    get stepBack() {
      if (!stepBack) throw Error("not mounted")
      return stepBack
    },
    remove: async (type: string) => {
      const callback = onRemove
      await act(async () => callback?.({ data: { action: { type } } }))
    },
    close: async () => act(async () => root.unmount()),
  }
}

const open = { step: "review" as Step, completion: null, isSubmitting: false }

test("system back (GO_BACK) and swipe (POP) step back through Checkout and Customer", async () => {
  const ui = await mount(open)
  try {
    expect(preventing).toBe(true)
    await ui.remove("GO_BACK")
    expect(ui.model.step).toBe("customer")
    await ui.rerender()
    expect(preventing).toBe(true)
    await ui.remove("POP")
    expect(ui.model.step).toBe("items")
    await ui.rerender()
    // At Items nothing is held back: back leaves the sale as before.
    expect(preventing).toBe(false)
    expect(dispatched).toEqual([])
    expect(changes.filter((c) => "error" in c)).toHaveLength(2)
  } finally {
    await ui.close()
  }
})

test("closing, the completion reset and other navigation proceed untouched", async () => {
  const ui = await mount(open)
  try {
    for (const type of ["REPLACE", "RESET", "NAVIGATE"]) await ui.remove(type)
    expect(dispatched.map((a) => a.type)).toEqual([
      "REPLACE",
      "RESET",
      "NAVIGATE",
    ])
    expect(ui.model.step).toBe("review")
  } finally {
    await ui.close()
  }
})

test("a completed or submitting sale is never held back, even by a retained callback", async () => {
  const ui = await mount(open)
  try {
    const retained = onRemove
    // The sale completes before React renders again: the retained callback
    // reads the latest state and lets the back through.
    await ui.set({ completion: { status: "created" } })
    expect(preventing).toBe(false)
    await act(async () => retained?.({ data: { action: { type: "GO_BACK" } } }))
    expect(dispatched.map((a) => a.type)).toEqual(["GO_BACK"])
    expect(ui.model.step).toBe("review")
    await ui.set({ completion: null, isSubmitting: true })
    expect(preventing).toBe(false)
    await ui.remove("POP")
    expect(dispatched.map((a) => a.type)).toEqual(["GO_BACK", "POP"])
    expect(ui.model.step).toBe("review")
  } finally {
    await ui.close()
  }
})

test("after unmount a retained callback or back changes nothing", async () => {
  const ui = await mount(open)
  const retained = onRemove
  const stepBack = ui.stepBack
  await ui.close()
  await act(async () => retained?.({ data: { action: { type: "GO_BACK" } } }))
  stepBack()
  expect(changes).toEqual([])
  expect(dispatched).toEqual([])
})

test("the visible back uses the same steps", async () => {
  const ui = await mount({ ...open, step: "customer" })
  try {
    ui.stepBack()
    expect(ui.model.step).toBe("items")
  } finally {
    await ui.close()
  }
})

test("a retained visible back does nothing once the sale finished, is submitting or reached Items", async () => {
  const ui = await mount(open)
  try {
    const retained = ui.stepBack
    await ui.set({ completion: { status: "created" } })
    retained()
    expect(changes).toEqual([])
    expect(ui.model.step).toBe("review")
    await ui.set({ completion: null, isSubmitting: true })
    retained()
    expect(changes).toEqual([])
    await ui.set({ isSubmitting: false, step: "items" })
    retained()
    expect(changes).toEqual([])
    expect(ui.model.step).toBe("items")
    // Back on an open step, the same retained press works again.
    await ui.set({ step: "review" })
    retained()
    expect(ui.model.step).toBe("customer")
  } finally {
    await ui.close()
  }
})
