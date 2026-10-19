import { beforeEach, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"
import type { MobileProfile } from "../lib/session-store"

// Observational M11 reports from the actual attachment hook, on the same
// real React Query harness as attachment-entitlement.fixture (copied, not
// shared, so that frozen fixture stays untouched).
// Real hook/model/React Query observer and actual explanation sheet. Native UI,
// auth notification, operational mode, cache-generation and tRPC transport ports
// are inert; no picker, file read, provider, network or database can run.
const rootPath = new URL("../", import.meta.url)
function standIn(path: string, exports: Record<string, unknown>) {
  mock.module(new URL(path, rootPath).pathname, () => exports)
}
const original: MobileProfile = {
  id: "actor-a",
  businessId: "business-a",
  storeId: "store-a",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  name: "Actor A",
  email: "a@example.test",
}
let profile: MobileProfile = { ...original }
let token = "real-session-a"
let generation = 0
let sessionGeneration = 0
let operationalGeneration = 0
let offline = false
type PlanRead = {
  actorUserId: string
  tenant: { id: string; retailOpsPlanId: string | null }
  activeStore: { id: string } | null
  membership: { role: string }
}
function answer(plan = "growth", role = profile.role ?? "OWNER"): PlanRead {
  return {
    actorUserId: profile.id,
    tenant: { id: profile.businessId ?? "", retailOpsPlanId: plan },
    activeStore: { id: profile.storeId ?? "" },
    membership: { role },
  }
}
let response = answer()
const requests: unknown[] = []
let transport: () => Promise<PlanRead> = async () => response
standIn("hooks/use-auth", { useAuthContext: () => ({ profile, token }) })
standIn("store/operationalModeStore", {
  useOperationalModeStore: Object.assign(
    (select: (state: { isOfflineMode: boolean }) => unknown) =>
      select({ isOfflineMode: offline }),
    { getState: () => ({ isOfflineMode: offline }) },
  ),
  // Monotonic operational-mode generation (offline/business writes).
  getOperationalModeGeneration: () => operationalGeneration,
})
// Monotonic session-write generation; the rest of the store stays unused.
standIn("lib/session-store", {
  getSessionGeneration: () => sessionGeneration,
})
standIn("trpc/client", {
  getDataCacheGeneration: () => generation,
  useTRPC: () => ({
    tenant: {
      current: {
        queryOptions: () => ({
          queryKey: [["tenant", "current"], { type: "query" }],
          queryFn: async (context: {
            queryKey: unknown
            signal: AbortSignal
          }) => {
            requests.push({
              queryKey: structuredClone(context.queryKey),
              signal: context.signal,
            })
            return transport()
          },
        }),
      },
    },
  }),
})
const box = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
standIn("components/ui/view", { View: box })
standIn("components/ui/text", { Text: box })
standIn("components/ui/icon", { Icon: () => null })
standIn("components/ui/modal", {
  Modal: box,
  useModal: () => ({ present() {}, dismiss() {}, ref: null }),
})
standIn("components/mobile/action-button", { ActionButton: box })
mock.module("@gorhom/bottom-sheet", () => ({ BottomSheetView: box }))
mock.module("expo-router", () => ({ useRouter: () => ({ push() {} }) }))
const { useAttachmentEntitlement } = await import(
  "./use-attachment-entitlement"
)
const { AttachmentLockSheet } = await import(
  "../components/mobile/attachment-lock-sheet"
)
type Model = ReturnType<typeof useAttachmentEntitlement>
type Report = { name: string; properties: Record<string, unknown> }
const reports: Report[] = []
let trackerThrows = false
const orderActivity = {
  surface: "order" as const,
  track: (input: Report) => {
    if (trackerThrows) throw Error("collector down")
    reports.push(input)
  },
}
let activity:
  | { surface: "order" | "service"; track: (input: Report) => void }
  | undefined = orderActivity
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  sessionGeneration++
  operationalGeneration++
  reports.length = 0
  trackerThrows = false
  activity = orderActivity
  profile = { ...original }
  token = "real-session-a"
  generation++
  offline = false
  response = answer()
  requests.length = 0
  transport = async () => response
})
async function mount(showSheet = false) {
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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  let latest: Model | undefined
  function Probe() {
    latest = useAttachmentEntitlement(activity)
    return showSheet && latest.sheet
      ? createElement(AttachmentLockSheet, {
          open: true,
          canSeePlans: latest.sheet.canSeePlans,
          surface: "order",
          onClose: latest.closeSheet,
        })
      : null
  }
  const element = () =>
    createElement(QueryClientProvider, { client }, createElement(Probe))
  const ui = {
    client,
    get model() {
      if (!latest) throw Error("Expected mounted actual entitlement hook")
      return latest
    },
    get text() {
      return host.textContent ?? ""
    },
    render: async () => {
      await act(async () => root.render(element()))
    },
    settle: async () => {
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 5))
      })
    },
    run: async (fn: () => unknown) => {
      await act(async () => {
        await fn()
      })
    },
    start: async <T,>(fn: () => Promise<T>) => {
      let task: Promise<T> | undefined
      await act(async () => {
        task = fn()
      })
      if (!task) throw Error("Expected asynchronous attachment attempt")
      return { task }
    },
    close: async () => {
      await act(async () => root.unmount())
      client.clear()
    },
  }
  await ui.render()
  await ui.settle()
  return ui
}

const restricted = (action: string, category = "order") => ({
  name: "mobile_attachment_restricted",
  properties: { category, action },
})

test("a locked press reports the restriction once with its fixed action", async () => {
  response = answer("free")
  const ui = await mount()
  try {
    await ui.run(() =>
      ui.model.attempt(() => {
        throw Error("Free plan opened media")
      }, "camera"),
    )
    expect(ui.model.sheet).toEqual({ canSeePlans: true })
    expect(reports).toEqual([restricted("camera")])
    // Already locked: the next press explains again without a read.
    await ui.run(() => ui.model.attempt(() => {}, "document"))
    expect(reports).toEqual([restricted("camera"), restricted("document")])
  } finally {
    await ui.close()
  }
})

test("a paid open, a failed read and an untagged press report nothing", async () => {
  const ui = await mount()
  try {
    let opened = 0
    await ui.run(() =>
      ui.model.attempt(() => {
        opened++
      }, "gallery"),
    )
    expect(opened).toBe(1)
    transport = async () => {
      throw Error("plan unavailable")
    }
    await ui.run(() => ui.model.attempt(() => {}, "video"))
    response = answer("free")
    transport = async () => response
    await ui.run(() => ui.client.refetchQueries())
    await ui.settle()
    await ui.run(() => ui.model.attempt(() => {}))
    expect(ui.model.sheet).toEqual({ canSeePlans: true })
    expect(reports).toEqual([])
  } finally {
    await ui.close()
  }
})

test("prompt actions report only for the current open explanation", async () => {
  response = answer("free", "CASHIER")
  profile = { ...profile, role: "CASHIER" }
  const ui = await mount()
  try {
    // No explanation open: nothing to answer.
    ui.model.promptAction("ask_owner")
    expect(reports).toEqual([])
    await ui.run(() => ui.model.attempt(() => {}, "video"))
    const retained = ui.model.promptAction
    ui.model.promptAction("ask_owner")
    expect(reports.at(-1)).toEqual({
      name: "mobile_upgrade_prompt_action",
      properties: { action: "ask_owner" },
    })
    // After a session change the retained answer is inert.
    generation++
    await ui.render()
    await ui.settle()
    const count = reports.length
    retained("dismiss")
    expect(reports).toHaveLength(count)
  } finally {
    await ui.close()
  }
})

test("See plans reports view_plan only when it actually proceeds", async () => {
  response = answer("free")
  const ui = await mount()
  try {
    let went = 0
    ui.model.seePlans(() => went++)
    expect(reports).toEqual([])
    await ui.run(() => ui.model.attempt(() => {}, "camera"))
    await ui.run(async () => ui.model.seePlans(() => went++))
    expect(went).toBe(1)
    expect(reports.at(-1)).toEqual({
      name: "mobile_upgrade_prompt_action",
      properties: { action: "view_plan" },
    })
  } finally {
    await ui.close()
  }
})

test("staff never report view_plan; a throwing tracker never blocks the flow", async () => {
  response = answer("free", "CASHIER")
  profile = { ...profile, role: "CASHIER" }
  trackerThrows = true
  const ui = await mount()
  try {
    await ui.run(() => ui.model.attempt(() => {}, "camera"))
    expect(ui.model.sheet).toEqual({ canSeePlans: false })
    let went = 0
    await ui.run(async () => ui.model.seePlans(() => went++))
    expect(went).toBe(0)
    expect(reports).toEqual([])
  } finally {
    await ui.close()
  }
})

test("service surface and no activity argument", async () => {
  response = answer("free")
  activity = { surface: "service", track: (input) => reports.push(input) }
  const ui = await mount()
  try {
    await ui.run(() => ui.model.attempt(() => {}, "video"))
    expect(reports).toEqual([restricted("video", "service")])
  } finally {
    await ui.close()
  }
  activity = undefined
  const bare = await mount()
  try {
    await bare.run(() => bare.model.attempt(() => {}, "camera"))
    bare.model.promptAction("dismiss")
    expect(reports).toHaveLength(1)
  } finally {
    await bare.close()
  }
})

test("paid to Free at the pre-picker read reports the restriction", async () => {
  const ui = await mount()
  try {
    expect(ui.model.entitlement.status).toBe("allowed")
    response = answer("free")
    await ui.run(() =>
      ui.model.attempt(() => {
        throw Error("Free plan opened media")
      }, "gallery"),
    )
    expect(ui.model.sheet).toEqual({ canSeePlans: true })
    expect(reports).toEqual([restricted("gallery")])
  } finally {
    await ui.close()
  }
})

for (const writer of ["session", "operational"] as const) {
  test(`an unobserved ${writer} A→B→A retires the open lock and retained actions`, async () => {
    response = answer("free")
    const ui = await mount()
    try {
      await ui.run(() => ui.model.attempt(() => {}, "camera"))
      expect(ui.model.sheet).toEqual({ canSeePlans: true })
      const before = reports.length
      const { promptAction, seePlans, attempt } = ui.model
      // Two writes back to identical final values, with no React render.
      if (writer === "session") sessionGeneration += 2
      else operationalGeneration += 2
      let went = 0
      let opened = 0
      promptAction("dismiss")
      seePlans(() => went++)
      await ui.run(() =>
        attempt(() => {
          opened++
        }, "document"),
      )
      expect(reports).toHaveLength(before)
      expect(went).toBe(0)
      expect(opened).toBe(0)
      // After the next render the stale explanation can't revive.
      await ui.render()
      await ui.settle()
      expect(ui.model.sheet).toBeNull()
      seePlans(() => went++)
      promptAction("ask_owner")
      expect(went).toBe(0)
      expect(reports).toHaveLength(before)
    } finally {
      await ui.close()
    }
  })

  test(`an awaiting paid attempt cannot open after an unobserved ${writer} A→B→A`, async () => {
    const ui = await mount()
    const pending = deferred<PlanRead>()
    transport = () => pending.promise
    let task: Promise<void> | undefined
    try {
      let opened = 0
      task = (
        await ui.start(() =>
          ui.model.attempt(() => {
            opened++
          }, "gallery"),
        )
      ).task
      if (writer === "session") sessionGeneration += 2
      else operationalGeneration += 2
      await ui.run(async () => {
        pending.resolve(response)
        await task
      })
      expect(opened).toBe(0)
      expect(reports).toEqual([])
    } finally {
      await ui.run(async () => {
        pending.resolve(response)
        await task
      })
      await ui.close()
    }
  })
}
