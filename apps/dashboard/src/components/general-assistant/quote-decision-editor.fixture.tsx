import { expect, mock, test } from "bun:test"
import * as tanstack from "@tanstack/react-query"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { QuoteDecisionAction } from "@ewatrade/assistant/general/quote-decision"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
let results: unknown[] = []
mock.module("@tanstack/react-query", () => ({
  ...tanstack,
  useQuery: () => results.shift(),
  useQueryClient: () => ({
    fetchQuery: () => {
      throw Error("Render must never review or execute")
    },
  }),
}))
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({ tenant: { current: { queryOptions: () => ({}) } } }),
  useTRPCClient: () => ({
    serviceCommerce: {
      assistantQuoteDecisionReview: {
        query: () => {
          throw Error("Render must never perform a request")
        },
      },
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
    <label>
      {label}
      {children}
    </label>
  ),
  Textarea: ({ name, disabled }: { name?: string; disabled?: boolean }) => (
    <textarea name={name} disabled={disabled} />
  ),
}))
const { GeneralQuoteDecisionEditor, GeneralQuoteDecisionEditorView } =
  await import("./general-quote-decision-editor")
const { AssistantQuoteApprovalContent } = await import(
  "../assistant-quote-approval-content"
)
const scope = { tenantId: "tenant", storeId: "store", actorUserId: "checker" }
const initial: QuoteDecisionAction = {
  action: "commerce_quote_approve",
  approvalId: "original-decision",
  quoteId: "original-quote",
  quoteVersionId: "original-version",
  reason: "PRIVATE REASON",
}
const ready = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  isFetchedAfterMount: true,
  refetch: () => {},
}
const context = {
  ...ready,
  data: {
    tenant: { id: scope.tenantId },
    activeStore: { id: scope.storeId },
    actorUserId: scope.actorUserId,
  },
}
const reviewed = {
  ...ready,
  data: { ...scope, ...initial, lines: ["PRIVATE ORIGINAL EFFECTS"] },
}
function render(first: unknown = context, second: unknown = reviewed) {
  results = [first, second]
  return renderToStaticMarkup(
    <GeneralQuoteDecisionEditor
      initial={initial}
      disabled={false}
      onSave={() => {
        throw Error("Render must not save")
      }}
      onCancel={() => {}}
    />,
  )
}
test("only fresh exact quotation scope reveals effects and editable reason", () => {
  expect(render()).toContain("PRIVATE ORIGINAL EFFECTS")
  expect(render()).toContain('<button type="submit">Save and review</button>')
  for (const flags of [
    { isPending: true },
    { isFetching: true },
    { isPaused: true },
    { isError: true },
    { isFetchedAfterMount: false },
  ])
    for (const index of [0, 1]) {
      const html = render(
        index === 0 ? { ...context, ...flags } : context,
        index === 1 ? { ...reviewed, ...flags } : reviewed,
      )
      expect(html).not.toContain("PRIVATE ORIGINAL EFFECTS")
      expect(html).not.toContain('name="reason"')
      expect(html).toContain('type="submit" disabled=""')
    }
  for (const field of [
    "tenantId",
    "storeId",
    "actorUserId",
    "approvalId",
    "quoteId",
    "quoteVersionId",
    "reason",
    "action",
  ])
    expect(
      render(context, {
        ...reviewed,
        data: { ...reviewed.data, [field]: "changed" },
      }),
    ).not.toContain("PRIVATE ORIGINAL EFFECTS")
})
test("approval and rejection remain separate intentions and Save never claims confirmation", () => {
  const view = (action: QuoteDecisionAction) =>
    renderToStaticMarkup(
      <GeneralQuoteDecisionEditorView
        initial={action}
        disabled={false}
        lines={["Saved effects"]}
        onReviewSave={() => {
          throw Error("Render must not review")
        }}
        onCancel={() => {}}
        onRetry={() => {}}
      />,
    )
  expect(view(initial)).toContain("commercially release")
  expect(view({ ...initial, action: "commerce_quote_reject" })).toContain(
    "keep it private",
  )
  expect(view(initial)).toContain("separate app confirmation")
})
test("global original view shows recorded provenance and independent option totals without reinterpreting current eligibility", () => {
  const approval: RouterOutputs["serviceCommerce"]["assistantQuoteApprovalDetail"] =
    {
      id: initial.approvalId,
      quoteId: initial.quoteId,
      quoteVersionId: initial.quoteVersionId,
      version: 1,
      status: "rejected",
      createdByMembershipId: "original-maker",
      decidedByMembershipId: "original-checker",
      decidedAt: new Date("2026-01-02T03:04:05Z"),
      reason: "RECORDED REASON",
      requestedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: null,
      policyRevision: 4,
      currencyCode: "NGN",
      totalMinor: 1000,
      sourceId: "original-source",
      sourceKind: "service",
      currentReview: { stale: true, reason: "CURRENT ELIGIBILITY CHANGED" },
      actions: {
        canApprove: false,
        canReject: false,
        canRelease: false,
        canPrepare: false,
        canRequestApproval: false,
      },
      options: [
        {
          id: "option-a",
          label: "First alternative",
          availabilityOutcome: "full",
          totalMinor: 1000,
          lines: [],
        },
        {
          id: "option-b",
          label: "Second alternative",
          availabilityOutcome: "full",
          totalMinor: 2000,
          lines: [],
        },
      ],
    }
  const html = renderToStaticMarkup(
    <AssistantQuoteApprovalContent
      approval={approval}
      checkedAt={Date.parse("2026-10-12T00:00:00Z")}
    />,
  )
  for (const text of [
    "rejected",
    "original-checker",
    "2026-01-02T03:04:05.000Z",
    "RECORDED REASON",
    "CURRENT ELIGIBILITY CHANGED",
    "First alternative",
    "Second alternative",
    "not added together",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("original-maker")
  expect(html).not.toContain("₦30.00")
})
