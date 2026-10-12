import { expect, mock, test } from "bun:test"
import * as tanstack from "@tanstack/react-query"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type {
  ServiceWorkEditorAction,
  ServiceWorkEditorContext,
} from "@ewatrade/assistant/general/contracts"

let results: unknown[] = []
const requests: Array<{ name: string; input: unknown; enabled?: boolean }> = []
mock.module("@tanstack/react-query", () => ({
  ...tanstack,
  useQuery: () => results.shift(),
  useQueryClient: () => ({
    fetchQuery: () => {
      throw new Error("Rendering must not review or execute work")
    },
  }),
}))
const query = (name: string) => ({
  queryOptions: (input: unknown, config: { enabled?: boolean }) => {
    requests.push({ name, input, enabled: config.enabled })
    return {}
  },
})
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    tenant: { current: query("context") },
    serviceAssistantWork: {
      editorContext: query("editor-context"),
      review: query("review"),
    },
  }),
}))
mock.module("@ewatrade/ui", () => ({
  Button: ({
    children,
    disabled,
    type,
  }: {
    children: ReactNode
    disabled?: boolean
    type?: "button" | "submit"
  }) => (
    <button type={type} disabled={disabled}>
      {children}
    </button>
  ),
  ControlField: ({
    children,
    label,
  }: { children: ReactNode; label: string }) => (
    <div>
      {label}
      {children}
    </div>
  ),
  FieldGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Input: ({ value, type }: { value?: string; type?: string }) => (
    <input type={type} value={value} readOnly />
  ),
  Textarea: ({ value }: { value?: string }) => (
    <textarea value={value} readOnly />
  ),
  SelectControl: ({
    value,
    options,
  }: { value?: string; options: Array<{ value: string; label: string }> }) => (
    <select value={value} disabled>
      {options.map((row) => (
        <option key={row.value} value={row.value}>
          {row.label}
        </option>
      ))}
    </select>
  ),
}))
const { GeneralServiceWorkEditor, GeneralServiceWorkEditorView } = await import(
  "./general-service-work-editor"
)
const ready = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  refetch: () => {},
}
const context = {
  ...ready,
  data: {
    tenant: { id: "tenant" },
    membership: { id: "membership" },
    actorUserId: "actor",
    activeStore: { id: "store" },
  },
}
const dto: ServiceWorkEditorContext = {
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  job: {
    id: "job",
    orderNumber: "PRIVATE ORDER",
    customerName: "PRIVATE CUSTOMER",
    promisedAt: null,
  },
  line: {
    id: "line",
    offeringName: "PRIVATE WORK",
    variantName: "Standard",
    quantity: "2",
    status: "QUEUED",
    authorizationStatus: "AUTHORIZED",
  },
  assignees: [{ id: "staff", name: "PRIVATE STAFF" }],
  assigneesComplete: true,
}
const choices = { ...ready, data: dto }
const initial: ServiceWorkEditorAction = {
  action: "service_work_note",
  jobId: "job",
  lineId: "line",
  body: "PRIVATE NOTE",
}
const props = { initial, disabled: false, onSave: () => {}, onCancel: () => {} }
function render(...reads: unknown[]) {
  results = reads
  requests.length = 0
  return renderToStaticMarkup(<GeneralServiceWorkEditor {...props} />)
}
test("fresh authenticated exact context renders saved work and editable private note", () => {
  const html = render(context, choices)
  expect(html).toContain("PRIVATE WORK")
  expect(html).toContain("PRIVATE CUSTOMER")
  expect(html).toContain("PRIVATE NOTE")
  expect(html).toContain('<button type="submit">Save and review</button>')
  expect(requests).toEqual([
    { name: "context", input: undefined, enabled: undefined },
    {
      name: "editor-context",
      input: { jobId: "job", lineId: "line" },
      enabled: true,
    },
  ])
})
test("every pending/fetching/paused/error dependency hides prior context and draft fields", () => {
  for (const flags of [
    { isPending: true },
    { isFetching: true },
    { isPaused: true },
    { isError: true },
  ])
    for (let index = 0; index < 2; index++) {
      const reads = [context, choices].map((row, i) =>
        i === index ? { ...row, ...flags } : row,
      )
      const html = render(...reads)
      for (const text of [
        "PRIVATE WORK",
        "PRIVATE ORDER",
        "PRIVATE CUSTOMER",
        "PRIVATE STAFF",
        "PRIVATE NOTE",
      ])
        expect(html).not.toContain(text)
      expect(html).toContain(
        '<button type="submit" disabled="">Save and review</button>',
      )
      if (index === 0) expect(requests[1]?.enabled).toBe(false)
    }
})
test("foreign actor, business, Store, Job or Line cannot disclose cached context", () => {
  for (const patch of [
    { tenantId: "other" },
    { storeId: "other" },
    { actorUserId: "other" },
    { job: { ...dto.job, id: "other" } },
    { line: null },
    { line: { ...dto.line!, id: "other" } },
  ]) {
    const html = render(context, { ...choices, data: { ...dto, ...patch } })
    expect(html).not.toContain("PRIVATE CUSTOMER")
    expect(html).not.toContain("PRIVATE NOTE")
    expect(html).toContain(
      '<button type="submit" disabled="">Save and review</button>',
    )
  }
})
test("over-bound or ineligible assignee choices never silently replace the original staff target", () => {
  const assignment: ServiceWorkEditorAction = {
    action: "service_job_assign",
    jobId: "job",
    assigneeUserId: "outside",
  }
  for (const assigneesComplete of [true, false]) {
    const html = renderToStaticMarkup(
      <GeneralServiceWorkEditorView
        {...props}
        initial={assignment}
        context={{ ...dto, line: null, assigneesComplete }}
        onRetry={() => {}}
        onReviewSave={() => {}}
      />,
    )
    expect(html).toContain("Selected assignee is unavailable")
    expect(html).toContain(
      '<button type="submit" disabled="">Save and review</button>',
    )
    if (!assigneesComplete)
      expect(html).toContain("exceeds these bounded choices")
  }
})
test("all intention controls preserve saved target and expose no raw identity or JSON fields", () => {
  const cases: Array<{
    action: ServiceWorkEditorAction
    label: string
    line: boolean
  }> = [
    {
      action: {
        action: "service_job_assign",
        jobId: "job",
        assigneeUserId: "staff",
      },
      label: "Assign to",
      line: false,
    },
    {
      action: {
        action: "service_job_reschedule",
        jobId: "job",
        promisedAt: "2026-10-15T15:00:00.123+03:00",
        reason: "Later",
      },
      label: "Promised date and time (UTC)",
      line: false,
    },
    {
      action: {
        action: "service_job_line_transition",
        jobId: "job",
        lineId: "line",
        toStatus: "in_progress",
      },
      label: "Next work state",
      line: true,
    },
    { action: initial, label: "Internal work note", line: true },
    {
      action: {
        action: "service_work_exception",
        jobId: "job",
        lineId: "line",
        type: "delay",
        description: "PRIVATE EXCEPTION",
      },
      label: "Exception category",
      line: true,
    },
  ]
  for (const item of cases) {
    const html = renderToStaticMarkup(
      <GeneralServiceWorkEditorView
        {...props}
        initial={item.action}
        context={{ ...dto, line: item.line ? dto.line : null }}
        onRetry={() => {}}
        onReviewSave={() => {}}
      />,
    )
    expect(html).toContain(item.label)
    expect(html).toContain("saved Job and Line stay fixed")
    expect(html).not.toContain('type="text"')
    expect(html).not.toContain("JSON")
    expect(html).toContain('<button type="submit">Save and review</button>')
    if (item.action.action === "service_job_reschedule")
      expect(html).toContain('value="2026-10-15T12:00:00"')
    if (item.action.action === "service_work_exception")
      expect(html).toContain("PRIVATE EXCEPTION")
  }
})
