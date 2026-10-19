import { expect, mock, test } from "bun:test"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual native original consumers and route, inert native/query furniture only.
// No network, provider, command, device or saved-session evidence is produced.
const root = new URL("../../../../apps/mobile/src/", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(path, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
standIn("components/mobile/green-till/kit", { ListCard: children })
mock.module("react-native", () => ({ ScrollView: children }))
const buttons = new Map<string, () => void>()
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    onPress,
  }: { children: ReactNode; onPress: () => void }) => {
    buttons.set(String(children), onPress)
    return <button type="button">{children}</button>
  },
})
standIn("components/mobile/assistant/native-quote-original-screen", {
  NativeQuoteOriginalScreen: () => (
    <div>Pure quotation original is tested separately</div>
  ),
})
standIn("components/mobile/assistant/native-service-message-screen", {
  NativeServiceMessageScreen: () => (
    <div>Exact manual-share original tested separately</div>
  ),
})
standIn("components/mobile/assistant/native-service-request-screen", {
  NativeServiceRequestScreen: () => (
    <div>Request reader is verified in its dedicated isolated fixture</div>
  ),
})
standIn("components/mobile/assistant/native-booking-original-screen", {
  NativeBookingOriginalScreen: () => <div>Exact booking viewer</div>,
})
standIn("components/mobile/assistant/native-service-job-screen", {
  NativeServiceJobScreen: ({ jobId }: { jobId: string }) => (
    <div>Exact current Job {jobId}</div>
  ),
})
let profile = {
  id: "actor",
  businessId: "business",
  storeId: "store",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  status: "ACTIVE" as string | undefined,
  catalogEditor: false,
}
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
let params: { target?: string | string[] } = {}
let pushed: unknown
mock.module("expo-router", () => ({
  useLocalSearchParams: () => params,
  useRouter: () => ({
    push: (route: unknown) => {
      pushed = route
    },
  }),
}))
const calls: Array<{ name: string; input: unknown }> = []
function procedure(name: string) {
  return {
    queryOptions: (input: unknown, options: object) => {
      calls.push({ name, input })
      return {
        queryKey: [name, input],
        queryFn: async () => {
          throw Error("No request permitted")
        },
        ...options,
      }
    },
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    serviceAssistantWork: { original: procedure("work") },
    serviceAssistantIntake: { receipt: procedure("intake") },
  }),
})
const currentJob = {
  jobId: "original-job",
  storeId: "store",
  orderId: "owning-order",
  revision: 9,
  currentAssigneeUserId: "current-assignee",
  createdAt: "2026-10-01T10:00:00Z",
  completedAt: null,
  cancelledAt: null,
  handedOffAt: "2026-10-15T11:00:00Z",
}
const base = {
  jobId: "original-job",
  currentJob,
  currentLine: { lineId: "original-line", revision: 4, status: "COMPLETED" },
  asOf: "2026-10-15T12:00:00Z",
  privateMetadata: "NEVER_RENDER",
}
const commonOriginal = {
  jobId: "original-job",
  lineId: "original-line",
  actorUserId: "recorded-actor",
  createdAt: "2026-10-14T10:00:00.123Z",
}
const work = {
  ...base,
  kind: "service_work",
  source: "ServiceWorkEvent",
  original: {
    ...commonOriginal,
    eventId: "original-event",
    type: "DUE_COMMITMENT_REVISED",
    source: "STAFF",
    reason: "Original reason",
    beforeStatus: "QUEUED",
    afterStatus: "IN_PROGRESS",
    effectiveAt: "2026-10-14T10:00:00.123Z",
    details: {
      coverage: "recorded",
      promise: {
        previousPromisedAt: "2026-10-14T10:00:00Z",
        promisedAt: "2026-10-15T10:00:00Z",
      },
      privatePayload: "NEVER_RENDER",
    },
  },
}
const note = {
  ...base,
  kind: "service_work_note",
  source: "ServiceInternalNote",
  original: {
    ...commonOriginal,
    recordId: "original-note",
    body: "Original private care note",
  },
}
const exception = {
  ...base,
  kind: "service_work_exception",
  source: "ServiceException",
  original: {
    ...commonOriginal,
    recordId: "original-exception",
    type: "QUALITY",
    description: "Original quality description",
    occurredAt: "2026-10-13T10:00:00Z",
  },
  currentException: {
    outcome: "RESOLVED",
    resolvedAt: "2026-10-15T11:00:00Z",
    resolvedByUserId: "later-resolver",
    updatedAt: "2026-10-15T11:00:00Z",
  },
}
const intake = {
  intakeId: "original-intake",
  orderId: "owning-order",
  orderNumber: "SRV-001",
  currencyCode: "NGN",
  confirmedAt: "2026-10-14T09:00:00.123Z",
  createdByUserId: "recorded-actor",
  customer: {
    name: "Original Customer",
    phone: "Original saved phone",
    email: "original@example.test",
  },
  instructions: "Original instructions",
  conditionNote: "Original condition",
  requestedAt: "2026-10-14T08:00:00Z",
  promisedAt: "2026-10-15T10:00:00Z",
  assigneeUserId: "original-assignee",
  serviceLevel: "STANDARD",
  priority: "NORMAL",
  lines: [
    {
      orderLineId: "saved-order-line",
      itemName: "Original shirt wash",
      variantName: "Cotton",
      offeringName: "Wash",
      quantity: "2.000001",
      unitPriceMinor: 1000,
      totalMinor: 2000,
      workPolicy: "TRACKED",
      authorizationPolicy: "PREPAYMENT",
    },
  ],
  subtotalMinor: 2000,
  serviceChargeMinor: 500,
  totalMinor: 2500,
  initialPaymentMinor: 500,
  initialBalanceMinor: 2000,
  initialPayment: {
    id: "payment",
    amountMinor: 500,
    method: "CASH",
    reference: "Original paid reference",
    recordedAt: "2026-10-14T09:00:00Z",
  },
  jobs: [
    {
      id: "original-job",
      lines: [
        {
          id: "current-line",
          allocatedQuantity: "2.000001",
          status: "READY_FOR_HANDOFF",
          authorizationStatus: "AUTHORIZED",
        },
      ],
    },
  ],
  notificationToken: "NEVER_RENDER",
  unrelatedContactGraph: "NEVER_RENDER",
}
function ready(data: unknown) {
  return {
    data,
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    refetch: async () => {},
  }
}
let query = ready(work)
mock.module("@tanstack/react-query", () => ({ useQuery: () => query }))
const { NativeServiceOriginalScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-service-original-screen"
)
const targets = [
  { kind: "service_work", jobId: "original-job", eventId: "original-event" },
  {
    kind: "service_work_note",
    jobId: "original-job",
    recordId: "original-note",
  },
  {
    kind: "service_work_exception",
    jobId: "original-job",
    recordId: "original-exception",
  },
  {
    kind: "service_intake",
    intakeId: "original-intake",
    orderId: "owning-order",
  },
] as const
const records = [work, note, exception, intake]
function render(index: number) {
  return renderToStaticMarkup(
    <NativeServiceOriginalScreen raw={JSON.stringify(targets[index])} />,
  )
}

test("all four original families use only their exact protected read and no private metadata", () => {
  for (const [index, record] of records.entries()) {
    query = ready(record)
    calls.length = 0
    const html = render(index)
    expect(calls).toEqual([
      {
        name: index === 3 ? "intake" : "work",
        input: index === 3 ? { intakeId: "original-intake" } : targets[index],
      },
    ])
    expect(html).toContain("Refresh original")
    expect(html).not.toContain("NEVER_RENDER")
  }
})
test("cached, fetching, paused, refused and not-yet-fresh records never display original content", () => {
  for (const [index, record] of records.entries())
    for (const flags of [
      { isFetching: true },
      { isPaused: true },
      { isError: true },
      { isFetchedAfterMount: false },
    ]) {
      query = { ...ready(record), ...flags }
      const html = render(index)
      expect(html).not.toContain("Original reason")
      expect(html).not.toContain("Original Customer")
      expect(html).not.toContain("Original private care note")
      expect(html).not.toContain("Original quality description")
      expect(html).not.toContain("Refresh original")
    }
})
test("wrong Job, event, Store and Intake-to-Order linkage refuse rather than substitute", () => {
  for (const data of [
    { ...work, jobId: "other" },
    { ...work, original: { ...work.original, eventId: "other" } },
    { ...work, currentJob: { ...currentJob, storeId: "other" } },
  ]) {
    query = ready(data)
    expect(render(0)).toContain("unavailable for your current business")
    expect(render(0)).not.toContain("Original reason")
  }
  query = ready({ ...intake, orderId: "other-order" })
  expect(render(3)).toContain("unavailable for your current business")
  expect(render(3)).not.toContain("Original Customer")
  query = ready({
    ...note,
    original: { ...note.original, recordId: "other-note" },
  })
  expect(render(1)).not.toContain("Original private care note")
})
test("missing scope, known inactive and unsupported roles mount no work/intake query", () => {
  const original = profile
  for (const edit of [
    { id: "" },
    { businessId: "" },
    { storeId: "" },
    { status: "SUSPENDED" },
    { role: "CASHIER" },
    { role: "MANAGER", staffAccessMode: "SCOPED" },
  ]) {
    profile = { ...original, ...edit }
    calls.length = 0
    query = ready(work)
    expect(render(0)).toContain("service-management access is required")
    expect(calls).toHaveLength(0)
  }
  profile = { ...original, status: undefined }
  query = ready(work)
  expect(render(0)).toContain("Original work event")
  profile = original
})
test("scoped Manager intake receipt access remains protected without granting work-history access", () => {
  const original = profile
  profile = { ...original, role: "MANAGER", staffAccessMode: "SCOPED" }
  calls.length = 0
  query = ready(intake)
  expect(render(3)).toContain("Original Customer")
  expect(calls).toEqual([
    { name: "intake", input: { intakeId: "original-intake" } },
  ])
  calls.length = 0
  query = ready(work)
  expect(render(0)).toContain("service-management access is required")
  expect(calls).toHaveLength(0)
  profile = original
})
test("original event and current Job facts remain separate with exact fractional stored times", () => {
  query = ready(work)
  const html = render(0)
  for (const text of [
    "Original work event",
    "Original reason",
    "Recorded promise (UTC)",
    "2026-10-14T10:00:00.123Z",
    "Current Job and line",
    "Current Job revision",
    "current-assignee",
    "completed",
    "Handed off (UTC)",
    "Historical display names are unavailable",
  ])
    expect(html).toContain(text)
  buttons.get("Open current Order")?.()
  expect(pushed).toEqual({
    pathname: "/order/[orderId]",
    params: { orderId: "owning-order" },
  })
})
test("exception original creation facts are not rewritten by current resolution", () => {
  query = ready(exception)
  const html = render(2)
  for (const text of [
    "Original exception occurrence",
    "Original quality description",
    "creation outcome was not saved",
    "Current exception resolution",
    "resolved",
    "later-resolver",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("NEVER_RENDER")
})
test("intake keeps saved service snapshots and original balance distinct from current work", () => {
  query = ready(intake)
  const html = render(3)
  for (const text of [
    "Original Customer",
    "Original shirt wash",
    "2.000001",
    "Tracked Job Line",
    "Original total",
    "Initial recorded payment",
    "Balance at intake",
    "Original instructions",
    "Original condition",
    "Current tracked work",
    "ready for handoff",
    "Ready does not mean paid or collected",
  ])
    expect(html).toContain(text)
  buttons.get("Open current Order")?.()
  expect(pushed).toEqual({
    pathname: "/order/[orderId]",
    params: { orderId: "owning-order" },
  })
})
test("unknown or unsafe saved unit price is not converted into zero or fabricated precision", () => {
  query = ready({
    ...intake,
    lines: [{ ...intake.lines[0], unitPriceMinor: null }],
  })
  expect(render(3)).toContain("Not recorded")
  query = ready({
    ...intake,
    lines: [
      { ...intake.lines[0], unitPriceMinor: Number.MAX_SAFE_INTEGER + 1 },
    ],
  })
  const html = render(3)
  expect(html).toContain("Amount unavailable")
  expect(html).not.toContain(String(Number.MAX_SAFE_INTEGER + 1))
})
test("missing tracked work or initial payment is unavailable, never rewritten as charge-only or unpaid", () => {
  query = ready({ ...intake, jobs: [], initialPayment: null })
  const html = render(3)
  expect(html).toContain("Current tracked Job records are unavailable")
  expect(html).toContain("Matching initial payment record is unavailable")
  expect(html).not.toContain("Original lines are charge-only")
})
test("malformed originals never mount a queue, private query or guessed linked record", () => {
  calls.length = 0
  for (const raw of [
    "bad-json",
    ["{}"],
    JSON.stringify({ kind: "service_work", jobId: "original-job" }),
    JSON.stringify({ ...targets[3], actorUserId: "foreign" }),
  ]) {
    const html = renderToStaticMarkup(<NativeServiceOriginalScreen raw={raw} />)
    expect(html).toContain("link is invalid")
    expect(calls).toHaveLength(0)
  }
})
standIn("components/mobile/service-jobs/service-jobs-screen", {
  ServiceJobsChrome: () => null,
  ServiceJobsContent: () => <div>Ordinary work queue</div>,
})
const PlainOriginalChrome = () => null
standIn("components/mobile/appearances/workflow-chrome", {
  MobileWorkflowChrome: PlainOriginalChrome,
})
standIn("lib/mobile-roles", {
  isSalesRepRole: (role: string) => role === "CASHIER",
})
standIn("components/mobile/workflow-modal-screen", {
  WorkflowModalScreen: ({
    children,
    back,
    closeLabel,
    chrome,
  }: {
    children: ReactNode
    back?: boolean
    closeLabel: string
    chrome: unknown
  }) => (
    <section
      data-back={String(back)}
      data-close={closeLabel}
      data-original-chrome={String(chrome === PlainOriginalChrome)}
    >
      {children}
    </section>
  ),
})
const { default: ServiceRoute } = await import(
  "../../../../apps/mobile/src/app/service-jobs-modal"
)
test("target mode owns the Back boundary and no-target mode retains the ordinary work queue", () => {
  params = {}
  expect(renderToStaticMarkup(<ServiceRoute />)).toContain(
    "Ordinary work queue",
  )
  params = { target: "bad-json" }
  const html = renderToStaticMarkup(<ServiceRoute />)
  expect(html).toContain('data-back="true"')
  expect(html).toContain("Back to the assistant")
  expect(html).toContain('data-original-chrome="true"')
  expect(html).toContain("link is invalid")
  expect(html).not.toContain("Ordinary work queue")
})

test("booking and current Job dispatch use exact consumers, with focused chrome only for Job management", () => {
  params = {
    target: JSON.stringify({
      kind: "service_booking",
      bookingId: "b",
      sourceId: "s",
      offeringId: "o",
    }),
  }
  expect(renderToStaticMarkup(<ServiceRoute />)).toContain(
    "Exact booking viewer",
  )
  params = {
    target: JSON.stringify({ kind: "service_job", jobId: "exact-job" }),
  }
  const html = renderToStaticMarkup(<ServiceRoute />)
  expect(html).toContain("Exact current Job exact-job")
  expect(html).not.toContain("Ordinary work queue")
  params = {}
})
