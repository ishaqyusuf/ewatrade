import { expect, mock, test } from "bun:test"
import {
  type ReactNode,
  StrictMode,
  act,
  createElement,
  useEffect,
} from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual focus wrapper, existing useServiceJobs and existing command controller.
// Native/query/secondary editor stand-ins; no API, mutation, file or device work.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
const buttons = new Map<string, () => void>()
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    onPress,
  }: { children: string; onPress: () => void }) => {
    buttons.set(children, onPress)
    return <button type="button">{children}</button>
  },
})
const owner = {
  id: "actor",
  businessId: "tenant",
  storeId: "store",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  status: "ACTIVE",
}
let profile = owner
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
let modalOpens = 0
standIn("components/ui/modal", {
  useModal: () => ({
    present: () => {
      modalOpens++
    },
    dismiss: () => {},
    ref: { current: null },
  }),
})
mock.module("react-native", () => ({ Keyboard: { dismiss: () => {} } }))
mock.module("expo-crypto", () => ({ randomUUID: () => "fixture-random" }))
mock.module("expo-image-picker", () => ({}))
const operational = Object.assign(
  (read: (value: { isOfflineMode: boolean }) => unknown) =>
    read({ isOfflineMode: false }),
  { getState: () => ({ isOfflineMode: false }) },
)
standIn("store/operationalModeStore", { useOperationalModeStore: operational })
standIn("internal-tooling/fixture-recipes", {
  createMessageFixture: () => {
    throw Error("No QA fill")
  },
  createServiceFixture: () => {
    throw Error("No QA fill")
  },
})
standIn("components/mobile/service-jobs/service-evidence-files", {
  discardRetainedEvidence: () => {
    throw Error("No evidence write")
  },
  retainEvidenceAsset: () => {
    throw Error("No evidence write")
  },
})
let historyOpens = 0
standIn("components/mobile/service-jobs/service-history-sheet", {
  useServiceHistory: () => ({
    kind: null,
    open: () => {
      historyOpens++
    },
    close: () => {},
  }),
})
standIn("components/mobile/service-jobs/service-payment-sheet", {
  useServicePaymentEditor: () => ({ draft: null, open: () => {} }),
})
standIn("components/mobile/service-jobs/service-status-sheet", {
  useServiceStatusEditor: () => ({ draft: null, open: () => {} }),
})
standIn("components/mobile/service-jobs/service-text-sheet", {
  useServiceTextEditor: () => ({ draft: null, open: () => {} }),
})
const noopMutation = {
  isPending: false,
  mutateAsync: async () => {
    throw Error("No mutation permitted")
  },
}
let requireJob: ((job: unknown) => boolean) | undefined
let acceptedAction:
  | ((message: string) => {
      afterAccept: (isCurrent: () => boolean) => Promise<void>
    })
  | undefined
standIn("components/mobile/service-jobs/use-service-actions", {
  useServiceActions: (options: {
    requireJob: (job: unknown) => boolean
    acceptedAction: NonNullable<typeof acceptedAction>
  }) => {
    requireJob = options.requireJob
    acceptedAction = options.acceptedAction
    return {
      transition: () => {},
      addNote: () => {},
      assignToMe: () => {},
      recordPayment: () => {},
      handoff: () => {},
      notifyCustomer: () => {},
      assignMutation: noopMutation,
      paymentMutation: noopMutation,
      handoffMutation: noopMutation,
      messageMutation: noopMutation,
      noteMutation: noopMutation,
    }
  },
})
const tenant = {
  actorUserId: "actor",
  tenant: { id: "tenant" },
  activeStore: { id: "store", status: "ACTIVE" },
  membership: { tenantId: "tenant", role: "OWNER", staffAccessMode: "LEGACY" },
  staffAccess: { status: "ACTIVE", mode: "LEGACY" },
}
const proof = {
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  job: {
    id: "exact-job",
    orderNumber: "ORD-1042",
    customerName: "Exact customer",
    promisedAt: null,
  },
  line: null,
  assignees: [],
  assigneesComplete: true,
}
const exact = {
  id: "exact-job",
  storeId: "store",
  orderNumber: "ORD-1042",
  commercialOrderId: "exact-order",
  lines: [],
  customerName: "Exact current customer",
  revision: 3,
}
const warmWrong = {
  ...exact,
  id: "wrong-job",
  orderNumber: "ORD-WRONG",
  customerName: "NEVER_FALL_BACK_TO_QUEUE",
}
type State = {
  isError: boolean
  isSuccess: boolean
  isPending: boolean
  isFetching: boolean
  isPaused: boolean
  isFetchedAfterMount: boolean
}
let overrides: Record<string, Partial<State>> = {}
let tenantData: unknown = tenant
let proofData: unknown = proof
let jobData: unknown = exact
const queries: {
  name: string
  input: unknown
  options: { enabled?: boolean }
}[] = []
let invalidations = 0
function data(name: string) {
  if (name === "tenant.current") return tenantData
  if (name === "serviceAssistantWork.editorContext") return proofData
  if (name === "services.getJob") return jobData
  if (name === "tenant.featureAvailability")
    return { storeId: "WRONG_CACHED_STORE" }
  if (name === "catalog.listItems") return []
  return undefined
}
function procedure(name: string) {
  const options = (input: unknown, value: { enabled?: boolean } = {}) => {
    queries.push({ name, input, options: value })
    return {
      ...value,
      queryKey: [name, input],
      queryFn: async () => data(name),
    }
  }
  return {
    queryOptions: options,
    infiniteQueryOptions: options,
    mutationOptions: () => ({}),
    pathFilter: () => ({}),
    queryFilter: () => ({}),
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    tenant: {
      current: procedure("tenant.current"),
      featureAvailability: procedure("tenant.featureAvailability"),
    },
    serviceAssistantWork: {
      editorContext: procedure("serviceAssistantWork.editorContext"),
    },
    services: {
      getJob: procedure("services.getJob"),
      getSettings: procedure("services.getSettings"),
      queuePage: procedure("services.queuePage"),
      captureEvidence: procedure("services.captureEvidence"),
      createAndConfirmIntake: procedure("services.createAndConfirmIntake"),
    },
    catalog: { listItems: procedure("catalog.listItems") },
    orders: {
      list: procedure("orders.list"),
      listPage: procedure("orders.listPage"),
      customerCount: procedure("orders.customerCount"),
    },
  }),
})
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: [string, unknown]; enabled?: boolean }) => {
    const name = options.queryKey[0]
    return {
      isError: false,
      isSuccess: options.enabled !== false,
      isPending: options.enabled === false,
      isFetching: false,
      isPaused: false,
      isFetchedAfterMount: options.enabled !== false,
      data: data(name),
      error: null,
      ...overrides[name],
      refetch: async () => ({ isSuccess: true, data: data(name) }),
    }
  },
  useInfiniteQuery: () => ({
    data: { pages: [{ items: [warmWrong, exact] }] },
    isPending: false,
    isError: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: async () => {
      invalidations++
    },
  }),
  useMutation: () => noopMutation,
}))
let focused: unknown
let mountController = false
let controllerMounts = 0
let controllerUnmounts = 0
let mountedModel: ReturnType<typeof useServiceJobs> | undefined
standIn("components/mobile/service-jobs/service-jobs-screen", {
  ServiceJobsContent: ({ focusedJob }: { focusedJob: Focus }) => {
    focused = focusedJob
    if (mountController) {
      mountedModel = useServiceJobs(focusedJob)
      useEffect(() => {
        controllerMounts++
        return () => {
          controllerUnmounts++
        }
      }, [])
      if (!focusedJob.isCurrent()) return <div>GUARDED_CURRENT_READ</div>
    }
    return <div>EXACT_NATIVE_WORKSPACE:{focusedJob.job.customerName}</div>
  },
})
const { NativeServiceJobScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-service-job-screen"
)
const { useServiceJobs } = await import(
  "../../../../apps/mobile/src/components/mobile/service-jobs/use-service-jobs"
)
const { useServiceCommand } = await import(
  "../../../../apps/mobile/src/components/mobile/service-jobs/use-service-command"
)
type Focus = NonNullable<Parameters<typeof useServiceJobs>[0]>
let model: ReturnType<typeof useServiceJobs> | undefined
let command: ReturnType<typeof useServiceCommand> | undefined
let back = 0
function render(jobId = "exact-job") {
  focused = undefined
  buttons.clear()
  return renderToStaticMarkup(
    createElement(NativeServiceJobScreen, {
      jobId,
      onBack: () => {
        back++
      },
    }),
  )
}
function renderHook(focus?: Focus) {
  function Harness() {
    model = useServiceJobs(focus)
    return <div>{model.selectedJob?.customerName ?? "No exact Job"}</div>
  }
  return renderToStaticMarkup(<Harness />)
}
function renderCommand(isCurrent?: () => boolean) {
  function Harness() {
    command = useServiceCommand({
      userId: "actor",
      businessId: "tenant",
      storeId: "store",
      canOperate: true,
      canManage: true,
      isCurrent,
    })
    return <div />
  }
  renderToStaticMarkup(<Harness />)
  const value = command
  if (!value) throw Error("Missing command")
  return value
}
function reset() {
  profile = owner
  overrides = {}
  tenantData = tenant
  proofData = proof
  jobData = exact
  queries.length = 0
  focused = undefined
  requireJob = undefined
  back = 0
  modalOpens = 0
  invalidations = 0
  historyOpens = 0
}

test("exact currentJob is handed to the existing native workspace only after tenant and nonclinical proof", () => {
  reset()
  const html = render()
  expect(html).toContain("EXACT_NATIVE_WORKSPACE:Exact current customer")
  expect(
    queries.map((row) => [row.name, row.input, row.options.enabled ?? true]),
  ).toEqual([
    ["tenant.current", undefined, true],
    ["serviceAssistantWork.editorContext", { jobId: "exact-job" }, true],
    ["services.getJob", { jobId: "exact-job" }, true],
  ])
  expect(focused).toBeDefined()
})

test("failed/paused/stale tenant or nonclinical proof never enables getJob and never shows a cached Job", () => {
  for (const name of ["tenant.current", "serviceAssistantWork.editorContext"])
    for (const state of [
      { isError: true },
      { isPaused: true },
      { isFetching: true },
      { isFetchedAfterMount: false },
    ]) {
      reset()
      overrides[name] = state
      const html = render()
      expect(
        queries.find((row) => row.name === "services.getJob")?.options.enabled,
      ).toBe(false)
      expect(html).not.toContain("Exact current customer")
      expect(html).not.toContain("NEVER_FALL_BACK_TO_QUEUE")
      expect(focused).toBeUndefined()
    }
})

test("wrong Job, Store or guarded Order identity and getJob refetch/denial hide the workspace", () => {
  for (const changed of [
    null,
    { ...exact, id: "wrong-job" },
    { ...exact, storeId: "other" },
    { ...exact, orderNumber: "ORD-OTHER" },
  ]) {
    reset()
    jobData = changed
    expect(render()).not.toContain("EXACT_NATIVE_WORKSPACE")
    expect(focused).toBeUndefined()
  }
  for (const state of [
    { isError: true },
    { isPaused: true },
    { isFetching: true },
    { isFetchedAfterMount: false },
  ]) {
    reset()
    overrides["services.getJob"] = state
    expect(render()).not.toContain("EXACT_NATIVE_WORKSPACE")
  }
})

test("malformed target, clinical-guard refusal and wrong scope retain only safe return navigation", () => {
  reset()
  expect(render(" ")).toContain("exact saved Service Job is unavailable")
  expect(queries).toEqual([])
  for (const changed of [
    { role: "CASHIER" },
    { role: "MANAGER", staffAccessMode: "SCOPED" },
    { status: "SUSPENDED" },
  ]) {
    reset()
    profile = { ...owner, ...changed }
    expect(render()).not.toContain("EXACT_NATIVE_WORKSPACE")
    expect(queries).toEqual([])
  }
  reset()
  proofData = { ...proof, storeId: "other" }
  render()
  expect(
    queries.find((row) => row.name === "services.getJob")?.options.enabled,
  ).toBe(false)
  buttons.get("Back to the assistant")?.()
  expect(back).toBe(1)
})

test("actual focused hook ignores warm queue/getJob data and never selects another Job or enters intake", () => {
  reset()
  jobData = warmWrong
  let current = true
  const focus: Focus = {
    job: exact as Focus["job"],
    isCurrent: () => current,
    refresh: async () => {},
    onBack: () => {
      back++
    },
  }
  const html = renderHook(focus)
  expect(html).toContain("Exact current customer")
  expect(html).not.toContain("NEVER_FALL_BACK_TO_QUEUE")
  expect(model?.jobs).toEqual([])
  expect(model?.selectedJobId).toBe("exact-job")
  expect(model?.creating).toBe(false)
  for (const name of [
    "tenant.featureAvailability",
    "catalog.listItems",
    "services.queuePage",
    "services.getJob",
  ])
    expect(queries.find((row) => row.name === name)?.options.enabled).toBe(
      false,
    )
  model?.setSelectedJobId("wrong-job")
  expect(back).toBe(0)
  expect(requireJob?.(warmWrong)).toBe(false)
  expect(requireJob?.(exact)).toBe(true)
  model?.setSelectedJobId(null)
  expect(back).toBe(1)
  current = false
  expect(requireJob?.(exact)).toBe(false)
  expect(model?.command.canAct()).toBe(false)
  model?.openHistory("notes")
  expect(historyOpens).toBe(0)
  expect(renderHook(focus)).toContain("No exact Job")
})

test("ordinary no-focus hook keeps queue/catalog/availability enabled and its loaded queue", () => {
  reset()
  renderHook()
  expect(model?.jobs).toHaveLength(2)
  for (const name of [
    "tenant.featureAvailability",
    "catalog.listItems",
    "services.queuePage",
  ])
    expect(queries.find((row) => row.name === name)?.options.enabled).toBe(true)
  expect(model?.focusedJob).toBeUndefined()
})

test("focused accepted refresh never invalidates shared queries after its owner loses scope", async () => {
  reset()
  let current = true
  let finish!: () => void
  renderHook({
    job: exact as Focus["job"],
    isCurrent: () => current,
    refresh: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    onBack: () => {},
  })
  const followUp = acceptedAction?.("accepted").afterAccept(() => current)
  current = false
  finish()
  await followUp
  expect(invalidations).toBe(0)
})

test("actual command controller synchronously refuses stale stage, confirm and resume", async () => {
  reset()
  let current = true
  let executions = 0
  const value = renderCommand(() => current)
  const action = {
    kind: "note" as const,
    title: "Review note",
    facts: [{ label: "Job", value: "ORD-1042" }],
    execute: async () => {
      executions++
      return { message: "accepted" }
    },
  }
  expect(value.stage(action)).toBe(true)
  current = false
  value.resume()
  await value.confirm()
  expect(modalOpens).toBe(0)
  expect(executions).toBe(0)
  expect(value.canAct()).toBe(false)
  const other = renderCommand(() => false)
  expect(other.stage(action)).toBe(false)
})

test("lost current proof during an actual command suppresses its accepted asynchronous follow-up", async () => {
  reset()
  let current = true
  let resolve!: (value: { message: string; afterAccept: () => void }) => void
  let followUps = 0
  const value = renderCommand(() => current)
  expect(
    value.stage({
      kind: "note",
      title: "Review note",
      facts: [],
      execute: () =>
        new Promise((yes) => {
          resolve = yes
        }),
    }),
  ).toBe(true)
  const pending = value.confirm()
  current = false
  resolve({
    message: "accepted",
    afterAccept: () => {
      followUps++
    },
  })
  await pending
  expect(followUps).toBe(0)
})

// React DOM is mounted in a local XML DOM; these are real React hook/effect
// lifetimes, not repeated SSR snapshots. No browser, device or transport runs.
async function mountedFixture(strict = false) {
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
  const text = document.createTextNode.bind(document)
  document.createTextNode = (value: string) => {
    const node = text(value)
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
  mountController = true
  controllerMounts = 0
  controllerUnmounts = 0
  const render = async (jobId = "exact-job") => {
    await act(async () => {
      const screen = <NativeServiceJobScreen jobId={jobId} onBack={() => {}} />
      root.render(strict ? <StrictMode>{screen}</StrictMode> : screen)
    })
    return host.toString()
  }
  return {
    render,
    close: async () => {
      await act(async () => root.unmount())
      mountController = false
    },
  }
}

test("mounted same-Job owner survives checking/refusal and retains the exact uncertain attempt", async () => {
  reset()
  const lifecycle = await mountedFixture()
  try {
    expect(await lifecycle.render()).toContain("EXACT_NATIVE_WORKSPACE")
    const original = mountedModel?.command
    if (!original) throw Error("Missing mounted command owner")
    let executions = 0
    let reject!: (error: Error) => void
    const capturedIdentity = "original-attempt-id"
    const identities: string[] = []
    await act(async () => {
      expect(
        original.stage({
          kind: "note",
          title: "Private exact Job review",
          facts: [{ label: "Private fact", value: "MUST_HIDE_DURING_REFETCH" }],
          execute: () => {
            executions++
            identities.push(capturedIdentity)
            if (executions === 1)
              return new Promise((_yes, no) => {
                reject = no
              })
            return Promise.resolve({ message: "accepted" })
          },
        }),
      ).toBe(true)
    })
    let pending!: Promise<void>
    await act(async () => {
      pending = original.confirm()
    })
    overrides["services.getJob"] = { isFetching: true }
    expect(await lifecycle.render()).toContain("GUARDED_CURRENT_READ")
    expect(controllerMounts).toBe(1)
    expect(controllerUnmounts).toBe(0)
    expect(mountedModel?.command.pending).toBe(true)
    expect(mountedModel?.selectedJob).toBeUndefined()
    const opens = modalOpens
    mountedModel?.command.resume()
    expect(modalOpens).toBe(opens)
    overrides["services.getJob"] = { isError: true }
    expect(await lifecycle.render()).not.toContain("Exact current customer")
    expect(mountedModel?.command.canAct()).toBe(false)
    await act(async () => {
      reject(Error("Response outcome unknown"))
      await pending
    })
    expect(mountedModel?.command.hasAttempt).toBe(true)
    expect(mountedModel?.command.locked).toBe(true)
    overrides = {}
    expect(await lifecycle.render()).toContain("EXACT_NATIVE_WORKSPACE")
    expect(controllerMounts).toBe(1)
    expect(mountedModel?.command.phase).toBe("retry")
    expect(mountedModel?.command.hasAttempt).toBe(true)
    expect(
      mountedModel?.command.stage({
        kind: "note",
        title: "Other",
        facts: [],
        execute: async () => ({ message: "wrong" }),
      }),
    ).toBe(false)
    await act(async () => {
      await mountedModel?.command.confirm()
    })
    expect(executions).toBe(2)
    expect(identities).toEqual([capturedIdentity, capturedIdentity])
    expect(mountedModel?.command.isAccepted).toBe(true)
  } finally {
    await lifecycle.close()
  }
  expect(controllerUnmounts).toBe(1)
})

test("mounted accepted follow-up remains owned and resumes once after fresh proof returns", async () => {
  reset()
  const lifecycle = await mountedFixture()
  try {
    await lifecycle.render()
    const original = mountedModel?.command
    if (!original) throw Error("Missing mounted command owner")
    let resolve!: (result: { message: string; afterAccept: () => void }) => void
    let followUps = 0
    await act(async () => {
      original.stage({
        kind: "note",
        title: "Review",
        facts: [],
        execute: () =>
          new Promise((yes) => {
            resolve = yes
          }),
      })
    })
    let pending!: Promise<void>
    await act(async () => {
      pending = original.confirm()
    })
    overrides["serviceAssistantWork.editorContext"] = { isError: true }
    expect(await lifecycle.render()).toContain("GUARDED_CURRENT_READ")
    await act(async () => {
      resolve({
        message: "accepted",
        afterAccept: () => {
          followUps++
        },
      })
      await pending
    })
    expect(followUps).toBe(0)
    expect(mountedModel?.command.isAccepted).toBe(true)
    overrides = {}
    await lifecycle.render()
    expect(followUps).toBe(1)
    expect(controllerMounts).toBe(1)
    await lifecycle.render()
    expect(followUps).toBe(1)
    expect(mountedModel?.command.locked).toBe(true)
  } finally {
    await lifecycle.close()
  }
})

test("a different exact Job remounts instead of adopting another Job's retained action", async () => {
  reset()
  const lifecycle = await mountedFixture()
  try {
    await lifecycle.render()
    const old = mountedModel?.command
    if (!old) throw Error("Missing original command")
    await act(async () => {
      old.stage({
        kind: "note",
        title: "Old Job action",
        facts: [],
        execute: async () => ({ message: "Old action must not execute" }),
      })
    })
    proofData = { ...proof, job: { ...proof.job, id: "another-exact-job" } }
    jobData = { ...exact, id: "another-exact-job" }
    await lifecycle.render("another-exact-job")
    expect(controllerMounts).toBe(2)
    expect(controllerUnmounts).toBe(1)
    expect(old.canAct()).toBe(false)
    expect(mountedModel?.command.locked).toBe(false)
    expect(mountedModel?.command.hasAttempt).toBe(false)
  } finally {
    await lifecycle.close()
  }
})

test("Strict Mode effect replay preserves the live read fence and actual unmount retires it", async () => {
  reset()
  const lifecycle = await mountedFixture(true)
  let original: ReturnType<typeof useServiceCommand> | undefined
  try {
    await lifecycle.render()
    original = mountedModel?.command
    expect(original?.canAct()).toBe(true)
    overrides["services.getJob"] = { isFetching: true }
    expect(await lifecycle.render()).toContain("GUARDED_CURRENT_READ")
    expect(original?.canAct()).toBe(false)
    overrides = {}
    await lifecycle.render()
    expect(original?.canAct()).toBe(true)
  } finally {
    await lifecycle.close()
  }
  expect(original?.canAct()).toBe(false)
})
