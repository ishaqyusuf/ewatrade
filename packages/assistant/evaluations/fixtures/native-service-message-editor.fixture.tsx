import { expect, mock, test } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { type ReactNode, act, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Real editor + the real root helper (native-service-message-values). Only
// native primitives, the tRPC client and react-query hooks are stood in. No
// device, transport, database, provider, send or domain command is involved.
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
// Same kit surface as the content fixture: module stand-ins are process-wide.
standIn("components/mobile/green-till/kit", {
  ListCard: children,
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
})
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
const choices = new Map<
  string,
  { disabled?: boolean; checked?: boolean; role: string; press: () => void }
>()
standIn("components/ui/pressable", {
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    disabled,
    onPress,
  }: {
    children: ReactNode
    accessibilityLabel: string
    accessibilityRole: string
    accessibilityState?: { checked?: boolean }
    disabled?: boolean
    onPress: () => void
  }) => {
    choices.set(accessibilityLabel, {
      disabled,
      checked: accessibilityState?.checked,
      role: accessibilityRole,
      press: onPress,
    })
    return (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    )
  },
})
const fields = new Map<
  string,
  { maxLength?: number; change: (value: string) => void }
>()
standIn("components/mobile/form-field", {
  FormField: ({
    label,
    value,
    editable,
    maxLength,
    onChangeText,
  }: {
    label: string
    value: string
    editable?: boolean
    maxLength?: number
    onChangeText: (value: string) => void
  }) => {
    fields.set(label, { maxLength, change: onChangeText })
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
let profile: Record<string, unknown> | null = owner
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })

type Context = {
  actorUserId: string
  tenantId: string
  storeId: string
  job: { id: string; revision: number }
  order: { id: string; number: string }
  recipient: { name: string | null; phone: string | null; email: string | null }
  asOf: string
}
function context(jobId: string): Context {
  return {
    actorUserId: "actor",
    tenantId: "business",
    storeId: "store",
    job: { id: jobId, revision: 4 },
    order: { id: "private-order", number: "ORD-2088" },
    recipient: {
      name: "Current Customer",
      phone: "+2348000000000",
      email: "current.customer@example.test",
    },
    asOf: "2026-10-15T14:40:00.000Z",
  }
}
type State = {
  isError: boolean
  isSuccess: boolean
  isFetching: boolean
  isPaused: boolean
  isFetchedAfterMount: boolean
}
let stateOverride: Partial<State> = {}
let shown = (value: Context): unknown => value
let fetched = (value: Context): unknown => value
let deferFetch: Promise<void> | null = null
const queryCalls: unknown[] = []
const fetches: { input: unknown; key: unknown }[] = []
standIn("trpc/client", {
  useTRPC: () => ({
    serviceCommunications: {
      manualMessageEditorContext: {
        queryOptions: (input: { jobId: string }, options: object) => {
          queryCalls.push(input)
          return {
            ...options,
            queryKey: ["context", input],
            queryFn: async (ctx: { queryKey: unknown }) => {
              fetches.push({ input, key: ctx.queryKey })
              if (deferFetch) await deferFetch
              return fetched(context(input.jobId))
            },
          }
        },
      },
    },
  }),
})
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: {
    queryKey: [string, { jobId: string }]
    queryFn: (ctx: object) => Promise<unknown>
  }) => ({
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data: shown(context(options.queryKey[1].jobId)),
    ...stateOverride,
    refetch: async () => ({
      isSuccess: true,
      data: await options.queryFn({ queryKey: options.queryKey }),
    }),
  }),
  useQueryClient: () => ({
    fetchQuery: (options: {
      queryKey: unknown
      queryFn: (ctx: object) => Promise<unknown>
    }) => options.queryFn({ queryKey: options.queryKey }),
  }),
}))
const { GeneralServiceMessageEditor } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-service-message-editor"
)
type Share = Extract<GeneralAction, { action: "service_message_share" }>
const initial: Share = {
  action: "service_message_share",
  jobId: "private-job",
  channel: "whatsapp",
  message: "Your shoes are ready for collection.",
  reason: "Customer asked by phone",
  alreadyShared: true,
}
const saved: GeneralAction[] = []
const ACK = "I already shared this message myself"
const MESSAGE = "Exact message you shared"
const NOTE = "Note (optional)"
function reset() {
  profile = owner
  stateOverride = {}
  shown = (value) => value
  fetched = (value) => value
  deferFetch = null
  saved.length = 0
  queryCalls.length = 0
  fetches.length = 0
}
function render(action: unknown = initial, disabled = false) {
  buttons.clear()
  choices.clear()
  fields.clear()
  return renderToStaticMarkup(
    createElement(GeneralServiceMessageEditor, {
      initial: action as Share,
      disabled,
      onSave: (value: GeneralAction) => {
        saved.push(value)
      },
    }),
  )
}
async function flush() {
  for (let index = 0; index < 40; index++) await Promise.resolve()
}
const press = (label: string) => choices.get(label)?.press()
const type = (label: string, value: string) => fields.get(label)?.change(value)
const save = () => buttons.get("Save and review")?.press()

test("fresh exact context shows the fixed Order and current contact, never ids, with acknowledgement off", () => {
  reset()
  const html = render()
  for (const text of [
    "Order ORD-2088",
    "Current Order customer",
    "Current Customer",
    "+2348000000000",
    "current.customer@example.test",
    "Current contact as of 2026-10-15T14:40:00.000Z (UTC)",
    "ẸwáTrade sends nothing",
    "delivery is not verified",
    "tracking history",
    "36 / 1000",
  ])
    expect(html).toContain(text)
  for (const text of ["private-job", "private-order", "actor", "business"])
    expect(html).not.toContain(text)
  expect(queryCalls).toEqual([{ jobId: "private-job" }])
  expect(choices.get(ACK)).toMatchObject({ role: "checkbox", checked: false })
  expect(choices.get("WhatsApp from my phone")?.checked).toBe(true)
  expect(fields.get(MESSAGE)?.maxLength).toBe(1000)
  expect(fields.get(NOTE)?.maxLength).toBe(500)
  expect(buttons.get("Save and review")?.disabled).toBe(true)
})

test("each of the three reported channels saves the exact payload through a fresh context and the real candidate", async () => {
  for (const [label, channel] of [
    ["In person / other", "manual"],
    ["SMS from my phone", "sms"],
    ["WhatsApp from my phone", "whatsapp"],
  ] as const) {
    reset()
    render()
    press(label)
    press(ACK)
    save()
    await flush()
    expect(saved).toEqual([
      {
        action: "service_message_share",
        jobId: "private-job",
        channel,
        message: "Your shoes are ready for collection.",
        reason: "Customer asked by phone",
        alreadyShared: true,
      },
    ])
    expect(fetches).toEqual([
      {
        input: { jobId: "private-job" },
        key: ["context", { jobId: "private-job" }],
      },
    ])
  }
})

test("queued native edits then acknowledgement save the latest exact fields; an empty note is omitted", async () => {
  reset()
  render()
  press("In person / other")
  type(MESSAGE, "  Ready from 4pm, bring the ticket.  ")
  type(NOTE, "   ")
  press(ACK)
  save()
  await flush()
  expect(saved).toEqual([
    {
      action: "service_message_share",
      jobId: "private-job",
      channel: "manual",
      message: "Ready from 4pm, bring the ticket.",
      alreadyShared: true,
    },
  ])
})

test("any channel, message or note edit after acknowledging clears it, so Save records nothing", async () => {
  for (const edit of [
    () => press("SMS from my phone"),
    () => type(MESSAGE, "Changed after acknowledging"),
    () => type(NOTE, "Changed note"),
  ]) {
    reset()
    render()
    press(ACK)
    edit()
    save()
    await flush()
    expect(saved).toEqual([])
  }
  // Re-acknowledging after the edit records the edited message.
  reset()
  render()
  press(ACK)
  type(MESSAGE, "Second wording")
  press(ACK)
  save()
  await flush()
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ message: "Second wording" })
})

test("message and note length limits are enforced by the real schema; 1000 and 500 are accepted", async () => {
  const long = "m".repeat(1000)
  const note = "n".repeat(500)
  reset()
  render()
  type(MESSAGE, long)
  type(NOTE, note)
  press(ACK)
  save()
  await flush()
  expect(saved).toEqual([
    {
      action: "service_message_share",
      jobId: "private-job",
      channel: "whatsapp",
      message: long,
      reason: note,
      alreadyShared: true,
    },
  ])
  for (const [label, value] of [
    [MESSAGE, "m".repeat(1001)],
    [NOTE, "n".repeat(501)],
    [MESSAGE, "   "],
  ] as const) {
    reset()
    render()
    type(label, value)
    press(ACK)
    save()
    await flush()
    expect(saved).toEqual([])
  }
})

test("an Order without a phone refuses SMS and WhatsApp but still records in person", async () => {
  const noPhone = (value: Context) => ({
    ...value,
    recipient: { ...value.recipient, phone: null },
  })
  reset()
  shown = noPhone
  fetched = noPhone
  const html = render()
  expect(html).toContain("No phone on the Order")
  expect(html).toContain("This Order has no phone number")
  expect(buttons.get("Save and review")?.disabled).toBe(true)
  for (const label of ["SMS from my phone", "WhatsApp from my phone"]) {
    reset()
    shown = noPhone
    fetched = noPhone
    render()
    press(label)
    press(ACK)
    save()
    await flush()
    expect(saved).toEqual([])
  }
  reset()
  shown = noPhone
  fetched = noPhone
  render()
  press("In person / other")
  press(ACK)
  save()
  await flush()
  expect(saved).toEqual([
    expect.objectContaining({ channel: "manual", jobId: "private-job" }),
  ])
})

test("paused, fetching, cached, refused, malformed, foreign-scope or other-Job context shows no facts or controls", () => {
  const hidden: Array<() => void> = [
    () => {
      stateOverride = { isFetching: true }
    },
    () => {
      stateOverride = { isPaused: true }
    },
    () => {
      stateOverride = { isFetchedAfterMount: false }
    },
    () => {
      stateOverride = { isError: true, isSuccess: false }
    },
    () => {
      shown = (value) => ({ ...value, unexpected: "PRIVATE" })
    },
    () => {
      shown = (value) => ({ ...value, storeId: "other-store" })
    },
    () => {
      shown = (value) => ({ ...value, tenantId: "other-business" })
    },
    () => {
      shown = (value) => ({ ...value, actorUserId: "other-actor" })
    },
    () => {
      shown = (value) => ({ ...value, job: { id: "other-job", revision: 1 } })
    },
    () => {
      shown = (value) => ({ ...value, asOf: "yesterday" })
    },
  ]
  for (const arrange of hidden) {
    reset()
    arrange()
    const html = render()
    expect(html).not.toContain("ORD-2088")
    expect(html).not.toContain("Current Customer")
    expect(html).not.toContain("+2348000000000")
    expect(choices.has(ACK)).toBe(false)
    expect(fields.size).toBe(0)
    expect(buttons.get("Save and review")?.disabled).toBe(true)
  }
})

test("current profile without eligible Store access or a valid draft renders only an alert and reads nothing", () => {
  for (const next of [
    null,
    { ...owner, storeId: null },
    { ...owner, status: "SUSPENDED" },
    { ...owner, role: "CASHIER" },
    { ...owner, role: "MANAGER", staffAccessMode: "STORE_SCOPED" },
  ]) {
    reset()
    profile = next
    const html = render()
    expect(html).toContain("service access and a selected")
    expect(queryCalls).toEqual([])
  }
  reset()
  profile = { ...owner, role: "MANAGER", staffAccessMode: "LEGACY" }
  expect(render()).toContain("ORD-2088")
  for (const bad of [
    { ...initial, recipient: "+2349999999999" },
    { ...initial, storeId: "other-store" },
    { ...initial, alreadyShared: false },
    { ...initial, channel: "email" },
  ]) {
    reset()
    const html = render(bad)
    expect(html).toContain("This saved message draft is invalid")
    expect(queryCalls).toEqual([])
  }
})

test("Save refuses when the fresh context no longer matches, and never trusts the rendered one", async () => {
  for (const change of [
    (value: Context) => ({ ...value, storeId: "other-store" }),
    (value: Context) => ({ ...value, job: { id: "other-job", revision: 5 } }),
    (value: Context) => ({ ...value, extra: true }),
  ]) {
    reset()
    render()
    fetched = change
    press(ACK)
    save()
    await flush()
    expect(saved).toEqual([])
    expect(fetches).toHaveLength(1)
  }
})

test("an edit while Save is checking makes the late response inert; disabled editors never save", async () => {
  reset()
  let release = () => {}
  deferFetch = new Promise<void>((resolve) => {
    release = resolve
  })
  render()
  press(ACK)
  save()
  type(MESSAGE, "Edited while checking")
  release()
  await flush()
  expect(saved).toEqual([])
  reset()
  render(initial, true)
  press(ACK)
  save()
  await flush()
  expect(saved).toEqual([])
  expect(fetches).toEqual([])
})

// React DOM mounted in a local XML DOM: real hook/effect lifetimes across
// renders, not repeated SSR snapshots. No browser, device or transport runs.
async function mounted() {
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
  const draw = async (disabled = false) => {
    // Rendered controls are re-registered on every commit.
    buttons.clear()
    choices.clear()
    fields.clear()
    await act(async () => {
      root.render(
        createElement(GeneralServiceMessageEditor, {
          initial,
          disabled,
          onSave: (value: GeneralAction) => {
            saved.push(value)
          },
        }),
      )
    })
    return host.toString()
  }
  return {
    draw,
    act: async (run: () => void) => {
      await act(async () => {
        run()
        await flush()
      })
      return host.toString()
    },
    close: () => act(async () => root.unmount()),
  }
}
const contactB = (value: Context) => ({
  ...value,
  recipient: { ...value.recipient, phone: "+2348111111111" },
})

test("mounted: acknowledged for contact A, Save sees B → no save; B shown, re-acknowledge, then saves", async () => {
  reset()
  const view = await mounted()
  try {
    expect(await view.draw()).toContain("+2348000000000")
    fetched = contactB
    await view.act(() => press(ACK))
    expect(choices.get(ACK)?.checked).toBe(true)
    const after = await view.act(() => save())
    expect(saved).toEqual([])
    expect(after).toContain("The Job or recipient changed")
    expect(choices.get(ACK)?.checked).toBe(false)
    // The query refetch now shows B.
    shown = contactB
    expect(await view.draw()).toContain("+2348111111111")
    await view.act(() => press(ACK))
    await view.act(() => save())
    expect(saved).toEqual([
      expect.objectContaining({ jobId: "private-job", channel: "whatsapp" }),
    ])
  } finally {
    await view.close()
  }
})

test("mounted: a background refetch A → checking → B clears the acknowledgement; asOf-only refresh keeps it", async () => {
  reset()
  const view = await mounted()
  try {
    await view.draw()
    await view.act(() => press(ACK))
    stateOverride = { isFetching: true }
    const checkingHtml = await view.draw()
    expect(checkingHtml).not.toContain("+2348000000000")
    expect(checkingHtml).toContain("Checking the exact saved Job")
    stateOverride = {}
    shown = contactB
    fetched = contactB
    expect(await view.draw()).toContain("+2348111111111")
    expect(choices.get(ACK)?.checked).toBe(false)
    await view.act(() => save())
    expect(saved).toEqual([])
  } finally {
    await view.close()
  }
  reset()
  const again = await mounted()
  try {
    await again.draw()
    await again.act(() => press(ACK))
    const later = (value: Context) => ({
      ...value,
      asOf: "2026-10-15T14:59:59.000Z",
    })
    shown = later
    fetched = later
    expect(await again.draw()).toContain("2026-10-15T14:59:59.000Z")
    expect(choices.get(ACK)?.checked).toBe(true)
    await again.act(() => save())
    expect(saved).toHaveLength(1)
  } finally {
    await again.close()
  }
})

test("mounted: a context change queued before Save (Order or revision) blocks Save until re-acknowledged", async () => {
  for (const change of [
    (value: Context) => ({
      ...value,
      order: { ...value.order, number: "ORD-2099" },
    }),
    (value: Context) => ({ ...value, job: { ...value.job, revision: 5 } }),
    (value: Context) => ({
      ...value,
      recipient: { ...value.recipient, name: "Renamed" },
    }),
  ]) {
    reset()
    const view = await mounted()
    try {
      await view.draw()
      await view.act(() => press(ACK))
      shown = change
      fetched = change
      await view.draw()
      expect(choices.get(ACK)?.checked).toBe(false)
      await view.act(() => save())
      expect(saved).toEqual([])
      await view.act(() => press(ACK))
      await view.act(() => save())
      expect(saved).toHaveLength(1)
    } finally {
      await view.close()
    }
  }
})

test("mounted: a Save pending across checking → B is retired when it resolves, so the editor can re-acknowledge and save", async () => {
  reset()
  const view = await mounted()
  try {
    await view.draw()
    await view.act(() => press(ACK))
    let release = () => {}
    deferFetch = new Promise<void>((resolve) => {
      release = resolve
    })
    await view.act(() => save())
    expect(buttons.has("Checking current Job…")).toBe(true)
    stateOverride = { isFetching: true }
    await view.draw()
    stateOverride = {}
    shown = contactB
    fetched = contactB
    await view.draw()
    await view.act(() => release())
    deferFetch = null
    const html = await view.draw()
    expect(saved).toEqual([])
    expect(buttons.has("Save and review")).toBe(true)
    expect(buttons.has("Checking current Job…")).toBe(false)
    expect(html).toContain("+2348111111111")
    expect(choices.get(ACK)?.checked).toBe(false)
    expect(choices.get(ACK)?.disabled).toBe(false)
    await view.act(() => press(ACK))
    await view.act(() => save())
    expect(saved).toHaveLength(1)
  } finally {
    await view.close()
  }
})

test("mounted: a Save that resolves while the editor is disabled saves nothing and releases, so a later Save works", async () => {
  reset()
  const view = await mounted()
  try {
    await view.draw()
    await view.act(() => press(ACK))
    let release = () => {}
    deferFetch = new Promise<void>((resolve) => {
      release = resolve
    })
    await view.act(() => save())
    await view.draw(true)
    await view.act(() => release())
    deferFetch = null
    expect(saved).toEqual([])
    await view.draw(false)
    expect(buttons.has("Save and review")).toBe(true)
    expect(buttons.get("Save and review")?.disabled).toBe(false)
    await view.act(() => save())
    expect(saved).toHaveLength(1)
    expect(fetches).toHaveLength(2)
  } finally {
    await view.close()
  }
})
