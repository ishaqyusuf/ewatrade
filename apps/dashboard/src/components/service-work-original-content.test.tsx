import { expect, test } from "bun:test"
import type { ServiceWorkOriginalRecord } from "@ewatrade/db/service-work-original"
import { renderToStaticMarkup } from "react-dom/server"
import { ServiceWorkOriginalContent } from "./service-work-original-content"

const common = {
  jobId: "job",
  scope: "current_store_original_service_record" as const,
  identityCoverage: "recorded_user_references_no_historical_names" as const,
  detail: "Original and current facts are separate.",
  asOf: "2026-10-12T10:00:00.000Z",
  currentJob: {
    jobId: "job",
    revision: 99,
    storeId: "store",
    orderId: "order",
    currentAssigneeUserId: "current-assignee",
    createdAt: "2026-10-01T10:00:00.000Z",
    completedAt: "2026-10-11T10:00:00.000Z",
    cancelledAt: null,
    handedOffAt: null,
  },
  currentLine: { lineId: "line", revision: 12, status: "COMPLETED" as const },
}
const original = {
  jobId: "job",
  lineId: "line",
  actorUserId: "original-actor",
  createdAt: "2026-10-01T10:00:00.123Z",
}
function render(record: ServiceWorkOriginalRecord) {
  return renderToStaticMarkup(
    <ServiceWorkOriginalContent
      record={record}
      timeZone="UTC"
      onOpenCurrentJob={() => {}}
    />,
  )
}

test("old event facts and current Job/Line facts render in separate sections", () => {
  const record = {
    ...common,
    kind: "service_work",
    source: "ServiceWorkEvent",
    original: {
      ...original,
      eventId: "old-event",
      type: "STATUS_CHANGED",
      source: "assistant",
      reason: "Original reason",
      beforeStatus: "QUEUED",
      afterStatus: "IN_PROGRESS",
      effectiveAt: "2026-10-01T09:00:00.456Z",
      details: { coverage: "not_projected" },
    },
  } satisfies ServiceWorkOriginalRecord
  const markup = render(record)
  const currentStart = markup.indexOf("Current Job and line")
  expect(currentStart).toBeGreaterThan(0)
  const saved = markup.slice(0, currentStart)
  const current = markup.slice(currentStart)
  expect(saved).toContain("old-event")
  expect(saved).toContain("Original reason")
  expect(saved).toContain("queued")
  expect(saved).toContain("in progress")
  expect(saved).toContain("2026-10-01T09:00:00.456Z")
  expect(saved).not.toContain("current-assignee")
  expect(current).toContain("current-assignee")
  expect(current).toContain("completed")
  expect(current).toContain("Open current Job")
})

test("original note text stays plain text and has no fabricated effective time", () => {
  const record = {
    ...common,
    kind: "service_work_note",
    source: "ServiceInternalNote",
    original: {
      ...original,
      recordId: "old-note",
      body: "<script>original text</script>",
    },
  } satisfies ServiceWorkOriginalRecord
  const markup = render(record)
  expect(markup).toContain("old-note")
  expect(markup).toContain("&lt;script&gt;original text&lt;/script&gt;")
  expect(markup).not.toContain("<script>")
  expect(markup).not.toContain("Effective")
})

test("later exception resolution does not become original outcome proof", () => {
  const record = {
    ...common,
    kind: "service_work_exception",
    source: "ServiceException",
    original: {
      ...original,
      recordId: "old-exception",
      type: "QUALITY",
      description: "Original quality issue",
      occurredAt: "2026-10-01T09:00:00.456Z",
    },
    currentException: {
      outcome: "RESOLVED",
      resolvedAt: "2026-10-02T10:00:00.000Z",
      resolvedByUserId: "later-resolver",
      updatedAt: "2026-10-02T10:00:00.000Z",
    },
    originalOutcomeCoverage: "creation_outcome_not_immutably_recorded",
  } satisfies ServiceWorkOriginalRecord
  const markup = render(record)
  const [saved, current] = markup.split("Current exception resolution")
  expect(saved).toContain("Original quality issue")
  expect(saved).toContain(
    "creation outcome was not saved as an immutable snapshot",
  )
  expect(saved).not.toContain("later-resolver")
  expect(saved).not.toContain("resolved")
  expect(current).toContain("resolved")
  expect(current).toContain("later-resolver")
  expect(markup).not.toContain("Original outcome</dt>")
})

test("completion originals show source quantity and recorded payment separately from current facts", () => {
  const base = {
    ...common,
    kind: "service_work" as const,
    source: "ServiceWorkEvent" as const,
    original: {
      ...original,
      eventId: "completion-event",
      type: "REWORK" as const,
      source: "service_work",
      reason: "Redo completed work",
      beforeStatus: null,
      afterStatus: null,
      effectiveAt: "2026-10-01T09:00:00.456Z",
      details: {
        coverage: "recorded" as const,
        rework: { sourceLineId: "completed-source", quantity: "1.25" },
      },
    },
  } satisfies ServiceWorkOriginalRecord
  const html = render(base)
  expect(html).toContain("Completed source Line reference")
  expect(html).toContain("completed-source")
  expect(html).toContain("Recorded rework quantity")
  expect(html).toContain("1.25")
  const handoff = {
    ...base,
    original: {
      ...base.original,
      type: "REMOTE_HANDOFF" as const,
      details: {
        coverage: "recorded" as const,
        handoff: { paymentStatus: "PAID" as const },
      },
    },
  } satisfies ServiceWorkOriginalRecord
  const collected = render(handoff)
  expect(collected).toContain("Payment state recorded at handoff")
  expect(collected).toContain("Current payment facts are separate")
})
