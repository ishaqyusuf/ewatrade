import { expect, mock, test } from "bun:test"
import type {
  GeneralAction,
  ServiceWorkEditorAction,
} from "@ewatrade/assistant/general/contracts"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Real component + validation/save pipeline. Native primitives/query hooks are
// stood in. Callbacks exercise read-only preparation and parent edit, not a
// device, React client layout, API transport or any domain command.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/bottom-sheet-input-context", {
  BottomSheetInputProvider: children,
})
standIn("components/ui/bottom-sheet-keyboard-aware-scroll-view", {
  BottomSheetKeyboardAwareScrollView: children,
})
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
const buttons = new Map<string, { disabled?: boolean; press: () => void }>()
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    disabled,
    onPress,
  }: { children: string; disabled?: boolean; onPress: () => void }) => {
    buttons.set(children, { disabled, press: onPress })
    return (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    )
  },
})
const choices = new Map<string, { disabled?: boolean; press: () => void }>()
standIn("components/ui/pressable", {
  Pressable: ({
    children,
    accessibilityLabel,
    disabled,
    onPress,
  }: {
    children: ReactNode
    accessibilityLabel: string
    disabled?: boolean
    onPress: () => void
  }) => {
    choices.set(accessibilityLabel, { disabled, press: onPress })
    return (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    )
  },
})
const fields = new Map<string, (value: string) => void>()
standIn("components/mobile/form-field", {
  FormField: ({
    label,
    value,
    editable,
    onChangeText,
  }: {
    label: string
    value: string
    editable?: boolean
    onChangeText: (value: string) => void
  }) => {
    fields.set(label, onChangeText)
    return (
      <label>
        {label}
        <input value={value} disabled={editable === false} readOnly />
      </label>
    )
  },
})
const owner = {
  id: "actor",
  businessId: "business",
  storeId: "store",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  status: "ACTIVE",
}
let profile = owner
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const tenant = {
  tenant: { id: "business" },
  activeStore: { id: "store", status: "ACTIVE" },
  actorUserId: "actor",
  membership: {
    tenantId: "business",
    role: "OWNER",
    staffAccessMode: "LEGACY",
  },
  staffAccess: { status: "ACTIVE", mode: "LEGACY" },
}
const identities = [
  { id: "staff-a", name: "Amina", email: "amina.a@example.test" },
  { id: "staff-b", name: "Amina", email: "amina.b@example.test" },
  {
    id: "not-eligible",
    name: "MUST_NOT_DISCLOSE",
    email: "private.other@example.test",
  },
]
const cases: ServiceWorkEditorAction[] = [
  {
    action: "service_job_assign",
    jobId: "private-job",
    assigneeUserId: "staff-a",
    reason: "Next shift",
  },
  {
    action: "service_job_reschedule",
    jobId: "private-job",
    promisedAt: "2026-10-25T01:30:00.123456+01:00",
    reason: "Changed time",
  },
  {
    action: "service_job_line_transition",
    jobId: "private-job",
    lineId: "private-line",
    toStatus: "in_progress",
    reason: "Started",
  },
  {
    action: "service_work_note",
    jobId: "private-job",
    lineId: "private-line",
    body: "Handle gently",
  },
  {
    action: "service_work_exception",
    jobId: "private-job",
    lineId: "private-line",
    type: "quality",
    description: "Fabric mark",
  },
  {
    action: "service_work_rework",
    jobId: "private-job",
    lineId: "private-line",
    quantity: "0.000001",
    reason: "Redo finish",
  },
  { action: "service_work_handoff", jobId: "private-job", note: "Collected" },
]
const queryCalls: { name: string; input: unknown; options: object }[] = []
const fetches: { name: string; input: unknown; key: unknown }[] = []
function context(input: { jobId: string; lineId?: string }) {
  return {
    tenantId: "business",
    storeId: "store",
    actorUserId: "actor",
    job: {
      id: input.jobId,
      orderNumber: "ORD-1042",
      customerName: "Customer Current",
      promisedAt: "2026-10-24T12:00:00.125Z",
    },
    line: input.lineId
      ? {
          id: input.lineId,
          offeringName: "Wash",
          variantName: "Linen",
          quantity: "2.500000",
          status: "IN_PROGRESS",
          authorizationStatus: "AUTHORIZED",
        }
      : null,
    assignees: [
      { id: "staff-a", name: "Amina" },
      { id: "staff-b", name: "Amina" },
    ],
    assigneesComplete: true,
  }
}
function review(input: ServiceWorkEditorAction) {
  const lineId = "lineId" in input ? (input.lineId ?? null) : null
  return {
    tenantId: "business",
    storeId: "store",
    actorUserId: "actor",
    jobId: input.jobId,
    lineId,
    target: {
      id:
        input.action === "service_work_rework"
          ? input.jobId
          : (lineId ?? input.jobId),
      revision: "a".repeat(64),
    },
    lines: ["CURRENT_PROTECTED_EFFECT", "No payment or provider delivery"],
  }
}
type State = {
  isError: boolean
  isSuccess: boolean
  isFetching: boolean
  isPaused: boolean
  isFetchedAfterMount: boolean
}
let stateOverrides: Record<string, Partial<State>> = {}
let tenantOverride: unknown = tenant
let contextTransform = (value: ReturnType<typeof context>) => value
let namesOverride: unknown = identities
let reviewTransform = (value: ReturnType<typeof review>) => value
let tenantFetch: (() => Promise<unknown>) | null = null
let refusedReview = false
function data(name: string, input: unknown) {
  if (name === "tenant") return tenantOverride
  if (name === "context")
    return contextTransform(context(input as Parameters<typeof context>[0]))
  if (name === "names") return namesOverride
  return reviewTransform(review(input as ServiceWorkEditorAction))
}
function procedure(name: string) {
  return {
    queryOptions: (input: unknown, options: object) => {
      queryCalls.push({ name, input, options })
      return {
        ...options,
        queryKey: [name, input],
        queryFn: async (ctx: { queryKey: unknown }) => {
          fetches.push({ name, input, key: ctx.queryKey })
          if (name === "tenant" && tenantFetch) return tenantFetch()
          if (name === "review" && refusedReview)
            throw Error("Protected review refused")
          return data(name, input)
        },
      }
    },
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    tenant: { current: procedure("tenant") },
    serviceAssistantWork: {
      editorContext: procedure("context"),
      review: procedure("review"),
    },
    services: { assignees: procedure("names") },
  }),
})
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: {
    queryKey: [string, unknown]
    enabled?: boolean
    queryFn: (ctx: object) => Promise<unknown>
  }) => {
    const [name, input] = options.queryKey
    return {
      isError: false,
      isSuccess: options.enabled !== false,
      isFetching: false,
      isPaused: false,
      isFetchedAfterMount: options.enabled !== false,
      data: data(name, input),
      ...stateOverrides[name],
      refetch: async () => {
        try {
          return {
            isSuccess: true,
            data: await options.queryFn({ queryKey: options.queryKey }),
          }
        } catch {
          return { isSuccess: false, data: undefined }
        }
      },
    }
  },
  useQueryClient: () => ({
    fetchQuery: (options: {
      queryKey: unknown
      queryFn: (ctx: object) => Promise<unknown>
    }) => options.queryFn({ queryKey: options.queryKey }),
  }),
}))
const { GeneralServiceWorkEditor } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-service-work-editor"
)
const saved: GeneralAction[] = []
function actionOf(name: ServiceWorkEditorAction["action"]) {
  const action = cases.find((row) => row.action === name)
  if (!action) throw Error("Missing test action")
  return action
}
function reset() {
  profile = owner
  stateOverrides = {}
  tenantOverride = tenant
  contextTransform = (value) => value
  namesOverride = identities
  reviewTransform = (value) => value
  tenantFetch = null
  refusedReview = false
  saved.length = 0
  queryCalls.length = 0
  fetches.length = 0
  buttons.clear()
  choices.clear()
  fields.clear()
}
function render(initial: ServiceWorkEditorAction, disabled = false) {
  buttons.clear()
  choices.clear()
  fields.clear()
  return renderToStaticMarkup(
    createElement(GeneralServiceWorkEditor, {
      initial,
      disabled,
      onSave: (value) => {
        saved.push(value)
      },
    }),
  )
}
async function flush() {
  for (let index = 0; index < 40; index++) await Promise.resolve()
}

test("all seven actual editors show their complete supported controls and exact saved work", () => {
  for (const action of cases) {
    reset()
    const html = render(action)
    expect(html).toContain("ORD-1042")
    expect(html).toContain("Customer Current")
    expect(html).toContain("CURRENT_PROTECTED_EFFECT")
    expect(html).not.toContain("private-job")
    expect(html).not.toContain("private-line")
    expect(queryCalls.find((row) => row.name === "context")?.input).toEqual({
      jobId: action.jobId,
      lineId: "lineId" in action ? action.lineId : undefined,
    })
    expect(queryCalls.find((row) => row.name === "review")?.input).toEqual(
      action,
    )
    expect(buttons.get("Save and review")?.disabled).toBe(false)
    if ("lineId" in action) {
      expect(html).toContain("Wash")
      expect(html).toContain("2.500000")
      expect(html).toContain("Authorization: authorized")
    }
  }
})

test("assignment intersects complete Store choices and disambiguates equal names with real email", () => {
  reset()
  const html = render(actionOf("service_job_assign"))
  expect(html).toContain("Amina · amina.a@example.test")
  expect(html).toContain("Amina · amina.b@example.test")
  expect(html).not.toContain("MUST_NOT_DISCLOSE")
  expect(html).not.toContain("private.other@example.test")
  expect(html).not.toContain("staff-a")
  expect(html).not.toContain("staff-b")
})

test("all seven field/choice callbacks prepare exact changed values through fresh reads and parent edit only", async () => {
  for (const action of cases) {
    reset()
    render(action)
    let expected: ServiceWorkEditorAction = action
    if (action.action === "service_job_assign") {
      choices.get("Amina · amina.b@example.test")?.press()
      expected = { ...action, assigneeUserId: "staff-b" }
    }
    if (action.action === "service_job_reschedule") {
      fields.get("Promised time (ISO 8601 with UTC Z or explicit offset)")?.(
        "2026-10-25T02:30:00.654321+02:00",
      )
      expected = { ...action, promisedAt: "2026-10-25T02:30:00.654321+02:00" }
    }
    if (action.action === "service_job_line_transition") {
      choices.get("Blocked")?.press()
      expected = { ...action, toStatus: "blocked" }
    }
    if (action.action === "service_work_note") {
      fields.get("Internal work note")?.("Updated private note")
      expected = { ...action, body: "Updated private note" }
    }
    if (action.action === "service_work_exception") {
      choices.get("Customer rejection")?.press()
      expected = { ...action, type: "customer_rejection" }
    }
    if (action.action === "service_work_rework") {
      fields.get("Rework quantity in the saved unit")?.("0.123456")
      expected = { ...action, quantity: "0.123456" }
    }
    if (action.action === "service_work_handoff") {
      fields.get("Collection note (optional)")?.("Collected by stated person")
      expected = { ...action, note: "Collected by stated person" }
    }
    buttons.get("Save and review")?.press()
    await flush()
    expect(saved).toEqual([expected])
    expect(fetches.map((row) => row.name)).toEqual(
      action.action === "service_job_assign"
        ? ["tenant", "context", "names", "review"]
        : ["tenant", "context", "review"],
    )
    expect(fetches.find((row) => row.name === "review")?.input).toEqual(
      expected,
    )
    for (const fetch of fetches)
      expect(fetch.key).toEqual([fetch.name, fetch.input])
  }
})

test("unavailable drafted staff can be corrected, but incomplete or denied identity choices disclose nobody", () => {
  reset()
  const action = actionOf("service_job_assign")
  const html = render({
    ...action,
    assigneeUserId: "revoked",
  } as ServiceWorkEditorAction)
  expect(html).toContain("selected assignee is unavailable")
  expect(html).toContain("amina.b@example.test")
  expect(buttons.get("Save and review")?.disabled).toBe(true)
  for (const mode of ["incomplete", "denied", "missing"] as const) {
    reset()
    if (mode === "incomplete")
      contextTransform = (value) => ({
        ...value,
        assigneesComplete: false,
        assignees: [],
      })
    if (mode === "denied") stateOverrides.names = { isError: true }
    if (mode === "missing") namesOverride = identities.slice(0, 1)
    const output = render(action)
    expect(output).not.toContain("Customer Current")
    expect(output).not.toContain("amina.a@example.test")
    expect(output).not.toContain("CURRENT_PROTECTED_EFFECT")
    expect(buttons.get("Save and review")?.disabled).toBe(true)
  }
})

test("fetching, paused, denied and pre-mount cached reads withhold all saved work and effects", () => {
  for (const name of ["tenant", "context", "names", "review"]) {
    for (const state of [
      { isFetching: true },
      { isPaused: true },
      { isError: true },
      { isFetchedAfterMount: false },
    ]) {
      reset()
      stateOverrides[name] = state
      const html = render(actionOf("service_job_assign"))
      for (const privateFact of [
        "ORD-1042",
        "Customer Current",
        "amina.a@example.test",
        "CURRENT_PROTECTED_EFFECT",
      ])
        expect(html).not.toContain(privateFact)
      expect(buttons.get("Save and review")?.disabled).toBe(true)
    }
  }
})

test("foreign Tenant context, wrong saved Line and wrong review identity refuse before showing names", () => {
  for (const mode of ["tenant", "line", "review"]) {
    reset()
    if (mode === "tenant")
      tenantOverride = { ...tenant, actorUserId: "another-actor" }
    if (mode === "line")
      contextTransform = (value) => ({
        ...value,
        line: {
          id: "wrong-line",
          offeringName: "PRIVATE_WRONG_LINE",
          variantName: "X",
          quantity: "1",
          status: "QUEUED",
          authorizationStatus: "AUTHORIZED",
        },
      })
    if (mode === "review")
      reviewTransform = (value) => ({ ...value, actorUserId: "other" })
    const html = render(actionOf("service_work_rework"))
    expect(html).not.toContain("ORD-1042")
    expect(html).not.toContain("PRIVATE_WRONG_LINE")
    expect(html).not.toContain("CURRENT_PROTECTED_EFFECT")
    expect(buttons.get("Save and review")?.disabled).toBe(true)
  }
})

test("strict local role/access/status and malformed action gates prepare no queries", () => {
  reset()
  const action = actionOf("service_work_handoff")
  for (const changed of [
    { role: "CASHIER" },
    { role: "MANAGER", staffAccessMode: "SCOPED" },
    { status: "SUSPENDED" },
    { storeId: "" },
    { businessId: "" },
  ]) {
    profile = { ...owner, ...changed }
    expect(render(action)).toContain("Current Owner, Admin or legacy Manager")
    expect(queryCalls).toEqual([])
  }
  profile = owner
  expect(render({ ...action, payment: {} } as never)).toContain(
    "service draft is invalid",
  )
  expect(queryCalls).toEqual([])
})

test("reschedule exposes explicit zone/time precision and handoff/note never imply payment or notification", () => {
  reset()
  let html = render(actionOf("service_job_reschedule"))
  expect(html).toContain("2026-10-25T01:30:00.123456+01:00")
  expect(html).toContain("no device timezone is inferred")
  expect(html).toContain("due-reminder replacement or cancellation")
  reset()
  html = render(actionOf("service_work_handoff"))
  expect(html).toContain("already settled balance")
  expect(html).toContain("No payment or customer update is created")
  reset()
  html = render(actionOf("service_work_note"))
  expect(html).toContain("Notes are not notifications")
  expect(html).toContain("No customer or provider message is sent")
})

test("actual Save callbacks reject invalid edits, guard double taps and refuse fresh review failures", async () => {
  reset()
  render(actionOf("service_work_rework"))
  fields.get("Rework quantity in the saved unit")?.("0.0000001")
  buttons.get("Save and review")?.press()
  await flush()
  expect(saved).toEqual([])
  expect(fetches).toEqual([])
  reset()
  render(actionOf("service_work_handoff"))
  buttons.get("Save and review")?.press()
  buttons.get("Save and review")?.press()
  await flush()
  expect(saved).toHaveLength(1)
  expect(fetches.filter((row) => row.name === "tenant")).toHaveLength(1)
  reset()
  render(actionOf("service_work_handoff"))
  refusedReview = true
  buttons.get("Save and review")?.press()
  await flush()
  expect(saved).toEqual([])
})

test("editing while a fresh read is pending prevents an earlier intent callback", async () => {
  reset()
  let resolve!: (value: unknown) => void
  tenantFetch = () =>
    new Promise((yes) => {
      resolve = yes
    })
  render(actionOf("service_work_handoff"))
  buttons.get("Save and review")?.press()
  fields.get("Collection note (optional)")?.("A changed intent while reading")
  resolve(tenant)
  await flush()
  expect(saved).toEqual([])
  expect(fetches.map((row) => row.name)).toEqual(["tenant"])
})

test("a new edited intent can Save before the old read finishes and survives its late finally", async () => {
  reset()
  const resolvers: ((value: unknown) => void)[] = []
  tenantFetch = () =>
    new Promise((resolve) => {
      resolvers.push(resolve)
    })
  const initial = actionOf("service_work_handoff")
  render(initial)
  const save = buttons.get("Save and review")
  save?.press()
  fields.get("Collection note (optional)")?.("New exact collection note")
  save?.press()
  expect(resolvers).toHaveLength(2)
  resolvers[0]?.(tenant)
  await flush()
  expect(saved).toEqual([])
  // Old completion must not release the newer logical request's lock.
  save?.press()
  expect(resolvers).toHaveLength(2)
  resolvers[1]?.(tenant)
  await flush()
  expect(saved).toEqual([{ ...initial, note: "New exact collection note" }])
  expect(fetches.map((row) => row.name)).toEqual([
    "tenant",
    "tenant",
    "context",
    "review",
  ])
})

test("different field events before rerender preserve every edited value", async () => {
  reset()
  const exception = actionOf("service_work_exception")
  render(exception)
  choices.get("Delay")?.press()
  fields.get("What happened?")?.("New exact delay description")
  buttons.get("Save and review")?.press()
  await flush()
  expect(saved).toEqual([
    { ...exception, type: "delay", description: "New exact delay description" },
  ])
  reset()
  const reschedule = actionOf("service_job_reschedule")
  render(reschedule)
  fields.get("Promised time (ISO 8601 with UTC Z or explicit offset)")?.(
    "2026-10-26T10:00:00.654321-04:00",
  )
  fields.get("Reason")?.("Stated replacement reason")
  buttons.get("Save and review")?.press()
  await flush()
  expect(saved).toEqual([
    {
      ...reschedule,
      promisedAt: "2026-10-26T10:00:00.654321-04:00",
      reason: "Stated replacement reason",
    },
  ])
})

test("parent busy disables visible choices and Save", () => {
  reset()
  const action = actionOf("service_job_assign")
  render(action, true)
  expect(buttons.get("Save and review")?.disabled).toBe(true)
  expect([...choices.values()].every((row) => row.disabled)).toBe(true)
})
