import { beforeEach, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"
import type { MobileProfile } from "../lib/session-store"

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
    latest = useAttachmentEntitlement()
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

for (const plan of ["starter", "growth", "pro"]) {
  test(`fresh exact ${plan} plan allows attachment only after a new read at invocation`, async () => {
    response = answer(plan)
    const ui = await mount()
    try {
      expect(ui.model.entitlement.status).toBe("allowed")
      expect(requests).toHaveLength(1)
      const pending = deferred<PlanRead>()
      transport = () => pending.promise
      let opened = 0
      const { task } = await ui.start(() =>
        ui.model.attempt(() => {
          opened++
        }),
      )
      expect(opened).toBe(0)
      expect(requests).toHaveLength(2)
      await ui.run(async () => {
        pending.resolve(response)
        await task
      })
      expect(opened).toBe(1)
    } finally {
      await ui.close()
    }
  })
}

for (const role of ["OWNER", "ADMIN", "CASHIER", "OPERATOR", "MANAGER"]) {
  test(`fresh Free ${role} shows a lock explanation and never opens media`, async () => {
    profile = { ...profile, role }
    response = answer("free", role)
    const ui = await mount()
    try {
      expect(ui.model.entitlement).toEqual({
        status: "locked",
        canSeePlans: role === "OWNER" || role === "ADMIN",
      })
      let opened = 0
      await ui.run(() =>
        ui.model.attempt(() => {
          opened++
        }),
      )
      expect(opened).toBe(0)
      expect(ui.model.sheet).toEqual({
        canSeePlans: role === "OWNER" || role === "ADMIN",
      })
    } finally {
      await ui.close()
    }
  })
}

test("unknown plan and failed fresh reads never fall back to Free or open media", async () => {
  response = answer("unrecognized-plan")
  const ui = await mount()
  try {
    expect(ui.model.entitlement.status).toBe("unknown")
    transport = async () => {
      throw Error("network unavailable")
    }
    let opened = 0
    await ui.run(() =>
      ui.model.attempt(() => {
        opened++
      }),
    )
    expect(opened).toBe(0)
    expect(ui.model.sheet).toBeNull()
  } finally {
    await ui.close()
  }
})

test("a loading plan is checking until the actual observer receives a fresh result", async () => {
  const pending = deferred<PlanRead>()
  transport = () => pending.promise
  const ui = await mount()
  try {
    expect(ui.model.entitlement.status).toBe("checking")
    expect(ui.model.sheet).toBeNull()
    await ui.run(async () => {
      pending.resolve(answer())
      await ui.client.refetchQueries()
    })
    await ui.settle()
    expect(ui.model.entitlement.status).toBe("allowed")
  } finally {
    pending.resolve(answer())
    await ui.close()
  }
})

for (const axis of ["actor", "business", "Store"] as const) {
  test(`mismatched response ${axis} cannot authorize media at mount or at fresh attempt`, async () => {
    response = answer()
    if (axis === "actor") response.actorUserId = "other-actor"
    if (axis === "business") response.tenant.id = "other-business"
    if (axis === "Store") response.activeStore = { id: "other-store" }
    const ui = await mount()
    try {
      expect(ui.model.entitlement.status).toBe("checking")
      let opened = 0
      await ui.run(() =>
        ui.model.attempt(() => {
          opened++
        }),
      )
      expect(opened).toBe(0)
      expect(ui.model.sheet).toBeNull()
    } finally {
      await ui.close()
    }
  })
}

test("query cache is partitioned by exact actor, business and Store without changing the tRPC input", async () => {
  const ui = await mount()
  try {
    expect(requests[0]).toMatchObject({
      queryKey: [
        ["tenant", "current"],
        {
          type: "query",
          attachmentOwner: {
            actorId: original.id,
            businessId: original.businessId,
            storeId: original.storeId,
          },
        },
      ],
    })
    profile = { ...profile, storeId: "store-b" }
    response = answer()
    await ui.render()
    await ui.settle()
    expect(ui.client.getQueryCache().getAll().at(-1)?.queryKey).toEqual([
      ["tenant", "current"],
      {
        type: "query",
        attachmentOwner: {
          actorId: original.id,
          businessId: original.businessId,
          storeId: "store-b",
        },
      },
    ])
  } finally {
    await ui.close()
  }
})

for (const changed of [
  "role",
  "access",
  "generation",
  "business ABA",
  "token",
] as const) {
  test(`retained attempt is retired after ${changed} lifetime changes`, async () => {
    const ui = await mount()
    try {
      const attempt = ui.model.attempt
      if (changed === "role") profile = { ...profile, role: "CASHIER" }
      if (changed === "access")
        profile = { ...profile, staffAccessMode: "SCOPED" }
      if (changed === "generation") generation++
      if (changed === "token") token = "new-same-actor-token"
      if (changed === "business ABA") {
        profile = { ...profile, businessId: "business-b", storeId: "store-b" }
        generation++
        response = answer()
        await ui.render()
        await ui.settle()
        profile = { ...original }
        generation++
      }
      response = answer()
      await ui.render()
      await ui.settle()
      const requestCount = requests.length
      let opened = 0
      await ui.run(() =>
        attempt(() => {
          opened++
        }),
      )
      expect(opened).toBe(0)
      expect(requests).toHaveLength(requestCount)
    } finally {
      await ui.close()
    }
  })
}

test("a callback retained before switching offline cannot refetch or open media", async () => {
  const ui = await mount()
  try {
    const attempt = ui.model.attempt
    offline = true
    await ui.render()
    const requestCount = requests.length
    let opened = 0
    await ui.run(() =>
      attempt(() => {
        opened++
      }),
    )
    expect(opened).toBe(0)
    expect(requests).toHaveLength(requestCount)
  } finally {
    await ui.close()
  }
})

test("a paid read resolving after an in-flight switch offline cannot open media", async () => {
  const ui = await mount()
  const pending = deferred<PlanRead>()
  transport = () => pending.promise
  try {
    let opened = 0
    const { task } = await ui.start(() =>
      ui.model.attempt(() => {
        opened++
      }),
    )
    offline = true
    await ui.render()
    await ui.run(async () => {
      pending.resolve(response)
      await task
    })
    expect(opened).toBe(0)
    expect(ui.model.entitlement.status).toBe("unknown")
  } finally {
    pending.resolve(response)
    await ui.close()
  }
})

test("paid to Free at the fresh pre-picker read explains the lock instead of opening", async () => {
  const ui = await mount()
  try {
    transport = async () => answer("free")
    let opened = 0
    await ui.run(() =>
      ui.model.attempt(() => {
        opened++
      }),
    )
    expect(opened).toBe(0)
    expect(ui.model.sheet).toEqual({ canSeePlans: true })
  } finally {
    await ui.close()
  }
})

test("unmount during refetch suppresses the pending media callback", async () => {
  const ui = await mount()
  const pending = deferred<PlanRead>()
  transport = () => pending.promise
  let opened = 0
  const { task } = await ui.start(() =>
    ui.model.attempt(() => {
      opened++
    }),
  )
  await ui.close()
  pending.resolve(response)
  await task
  expect(opened).toBe(0)
})

for (const changed of [
  "role",
  "access",
  "generation",
  "business ABA",
] as const) {
  test(`in-flight paid attempt cannot open after ${changed} retirement`, async () => {
    const ui = await mount()
    const pending = deferred<PlanRead>()
    transport = () => pending.promise
    try {
      let opened = 0
      const { task } = await ui.start(() =>
        ui.model.attempt(() => {
          opened++
        }),
      )
      if (changed === "role") profile = { ...profile, role: "CASHIER" }
      if (changed === "access")
        profile = { ...profile, staffAccessMode: "SCOPED" }
      if (changed === "generation") generation++
      if (changed === "business ABA") {
        profile = { ...profile, businessId: "business-b" }
        generation++
        await ui.render()
        profile = { ...original }
        generation++
      }
      await ui.render()
      await ui.run(async () => {
        pending.resolve(response)
        await task
      })
      expect(opened).toBe(0)
    } finally {
      pending.resolve(response)
      await ui.close()
    }
  })
}

test("concurrent retained double taps do not open before the live refresh and never open two pickers", async () => {
  const ui = await mount()
  const pending = deferred<PlanRead>()
  transport = () => pending.promise
  let first: Promise<void> | undefined
  let second: Promise<void> | undefined
  try {
    let opened = 0
    const attempt = ui.model.attempt
    first = (
      await ui.start(() =>
        attempt(() => {
          opened++
        }),
      )
    ).task
    second = (
      await ui.start(() =>
        attempt(() => {
          opened++
        }),
      )
    ).task
    expect(opened).toBe(0)
    await ui.run(async () => {
      pending.resolve(response)
      await first
      await second
    })
    expect(opened).toBe(1)
  } finally {
    await ui.run(async () => {
      pending.resolve(response)
      await first
      await second
    })
    await ui.close()
  }
})

for (const changed of ["role", "business", "offline", "generation"] as const) {
  test(`lock explanation cannot survive a ${changed} lifetime change`, async () => {
    response = answer("free")
    const ui = await mount(true)
    try {
      await ui.run(() =>
        ui.model.attempt(() => {
          throw Error("Free plan opened media")
        }),
      )
      expect(ui.model.sheet).toEqual({ canSeePlans: true })
      expect(ui.text).toContain("See plans")
      if (changed === "role") profile = { ...profile, role: "CASHIER" }
      if (changed === "business") {
        profile = { ...profile, businessId: "other-business" }
        response = answer("growth")
      }
      if (changed === "offline") offline = true
      if (changed === "generation") generation++
      await ui.render()
      await ui.settle()
      expect(ui.model.sheet).toBeNull()
      expect(ui.text).not.toContain("See plans")
    } finally {
      await ui.close()
    }
  })
}

for (const transition of ["paid", "failed"] as const) {
  test(`a previously open Free explanation is cleared when the authoritative plan read becomes ${transition}`, async () => {
    response = answer("free")
    const ui = await mount(true)
    try {
      await ui.run(() =>
        ui.model.attempt(() => {
          throw Error("Free plan opened media")
        }),
      )
      expect(ui.model.sheet).toEqual({ canSeePlans: true })
      transport =
        transition === "paid"
          ? async () => answer("growth")
          : async () => {
              throw Error("fresh plan unavailable")
            }
      await ui.run(() => ui.client.refetchQueries())
      await ui.settle()
      expect(ui.model.entitlement.status).toBe(
        transition === "paid" ? "allowed" : "unknown",
      )
      expect(ui.model.sheet).toBeNull()
    } finally {
      await ui.close()
    }
  })
}

test("synchronous offline store change retires a retained attempt before React commits a render", async () => {
  const ui = await mount()
  try {
    const attempt = ui.model.attempt
    const requestCount = requests.length
    let opened = 0
    // A real Zustand setState is synchronous; React can commit its subscribed
    // render later. The callback must consult the live operational store.
    offline = true
    await ui.run(() =>
      attempt(() => {
        opened++
      }),
    )
    expect(opened).toBe(0)
    expect(requests).toHaveLength(requestCount)
  } finally {
    await ui.close()
  }
})

test("synchronous offline change during refetch blocks media without waiting for a subscribed rerender", async () => {
  const ui = await mount()
  const pending = deferred<PlanRead>()
  transport = () => pending.promise
  try {
    let opened = 0
    const { task } = await ui.start(() =>
      ui.model.attempt(() => {
        opened++
      }),
    )
    offline = true
    await ui.run(async () => {
      pending.resolve(response)
      await task
    })
    expect(opened).toBe(0)
  } finally {
    pending.resolve(response)
    await ui.close()
  }
})

for (const transition of ["paid", "failed"] as const) {
  test(`retired Free explanation does not resurrect when a ${transition} read returns to fresh Free`, async () => {
    response = answer("free")
    const ui = await mount(true)
    try {
      await ui.run(() => ui.model.attempt(() => undefined))
      expect(ui.model.sheet).toEqual({ canSeePlans: true })
      const seePlans = ui.model.seePlans
      transport =
        transition === "paid"
          ? async () => answer("growth")
          : async () => {
              throw Error("fresh plan unavailable")
            }
      await ui.run(() => ui.client.refetchQueries())
      await ui.settle()
      expect(ui.model.sheet).toBeNull()
      transport = async () => answer("free")
      await ui.run(() => ui.client.refetchQueries())
      await ui.settle()
      expect(ui.model.entitlement.status).toBe("locked")
      let navigated = 0
      await ui.run(() =>
        seePlans(() => {
          navigated++
        }),
      )
      expect(navigated).toBe(0)
      expect(ui.model.sheet).toBeNull()
      expect(ui.text).not.toContain("See plans")
      // A new deliberate tap can open a new explanation.
      await ui.run(() => ui.model.attempt(() => undefined))
      expect(ui.model.sheet).toEqual({ canSeePlans: true })
    } finally {
      await ui.close()
    }
  })
}

test("an asynchronous media open keeps single-flight ownership until the picker promise settles", async () => {
  const ui = await mount()
  const picker = deferred<void>()
  let first: Promise<void> | undefined
  try {
    let opened = 0
    first = (
      await ui.start(() =>
        ui.model.attempt(() => {
          opened++
          return picker.promise
        }),
      )
    ).task
    await ui.settle()
    expect(opened).toBe(1)
    const requestCount = requests.length
    await ui.run(() =>
      ui.model.attempt(() => {
        opened++
      }),
    )
    expect(opened).toBe(1)
    expect(requests).toHaveLength(requestCount)
    await ui.run(async () => {
      picker.resolve()
      await first
    })
    await ui.run(() =>
      ui.model.attempt(() => {
        opened++
      }),
    )
    expect(opened).toBe(2)
  } finally {
    await ui.run(async () => {
      picker.resolve()
      await first
    })
    await ui.close()
  }
})
