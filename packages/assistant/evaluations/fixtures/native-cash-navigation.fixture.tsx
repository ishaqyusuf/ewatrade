import { expect, mock, test } from "bun:test"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
const root = new URL("../../../../apps/mobile/src/", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(path, root).pathname, () => value)
}
let params: Record<string, unknown> = {}
mock.module("expo-router", () => ({ useLocalSearchParams: () => params }))
standIn("components/mobile/workflow-modal-screen", {
  WorkflowModalScreen: ({
    children,
    back,
    closeLabel,
  }: { children: ReactNode; back?: boolean; closeLabel: string }) => (
    <section data-back={String(back)} data-label={closeLabel}>
      {children}
    </section>
  ),
})
standIn("components/mobile/status-banner", {
  StatusBanner: ({ title }: { title: string }) => <div>{title}</div>,
})
standIn("components/mobile/finance/finance-count-screen", {
  FinanceCountScreen: ({ countId }: { countId: string }) => (
    <div>Ordinary count {countId}</div>
  ),
})
standIn("components/mobile/finance/finance-period-screen", {
  FinancePeriodsScreen: () => <div>Ordinary posting period controls</div>,
})
standIn("components/mobile/assistant/native-cash-original-screen", {
  NativeCashOriginalScreen: ({
    bookId,
    countId,
  }: { bookId: string; countId: string }) => (
    <div>
      Pure count {bookId} {countId}
    </div>
  ),
})
standIn("components/mobile/assistant/native-day-review-screen", {
  NativeDayReviewScreen: ({
    bookId,
    through,
  }: { bookId: string; through: string }) => (
    <div>
      Pure day {bookId} {through}
    </div>
  ),
})
const { default: CountRoute } = await import(
  "../../../../apps/mobile/src/app/finance-count/[countId]"
)
const { default: DayRoute } = await import(
  "../../../../apps/mobile/src/app/finance-periods-modal"
)
test("assistant originals dispatch pure exact readers and retain back boundary", () => {
  params = { bookId: "exact-book", countId: "exact-count" }
  const count = renderToStaticMarkup(<CountRoute />)
  expect(count).toContain("Pure count exact-book exact-count")
  expect(count).toContain('data-back="true"')
  expect(count).toContain("Back to the assistant")
  expect(count).not.toContain("Ordinary count")
  params = {
    target: JSON.stringify({
      kind: "finance_day_close",
      bookId: "exact-book",
      through: "2026-10-14T23:59:59.999Z",
    }),
  }
  const day = renderToStaticMarkup(<DayRoute />)
  expect(day).toContain("Pure day exact-book 2026-10-14T23:59:59.999Z")
  expect(day).toContain('data-back="true"')
  expect(day).not.toContain("Ordinary posting period controls")
})
test("malformed pinned links never enter ordinary mutation-bearing screens", () => {
  for (const bookId of ["", ["book"], {}]) {
    params = { bookId, countId: "count" }
    const html = renderToStaticMarkup(<CountRoute />)
    expect(html).toContain("Invalid cash count link")
    expect(html).not.toContain("Pure count")
    expect(html).not.toContain("Ordinary count")
  }
  for (const target of [
    "",
    [],
    "{",
    JSON.stringify({
      kind: "finance_day_close",
      bookId: "book",
      through: "2026-10-14T12:00:00Z",
    }),
    JSON.stringify({
      kind: "finance_day_close",
      bookId: "book",
      through: "2026-10-14T23:59:59.999Z",
      close: true,
    }),
  ]) {
    params = { target }
    const html = renderToStaticMarkup(<DayRoute />)
    expect(html).toContain("Invalid day review link")
    expect(html).not.toContain("Pure day")
    expect(html).not.toContain("Ordinary posting period controls")
  }
})
test("ordinary routes preserve their previous screens", () => {
  params = { countId: "ordinary" }
  expect(renderToStaticMarkup(<CountRoute />)).toContain(
    "Ordinary count ordinary",
  )
  params = {}
  expect(renderToStaticMarkup(<DayRoute />)).toContain(
    "Ordinary posting period controls",
  )
})

const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
standIn("components/mobile/green-till/kit", {
  ListCard: children,
  StatusPill: () => null,
})
standIn("components/mobile/action-button", { ActionButton: children })
standIn("hooks/use-large-text-layout", { useLargeTextLayout: () => false })
const { AssistantAnswerCard } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/assistant-cards"
)
test("existing native answer cards preserve plain cash lookup and continuation facts", () => {
  for (const title of ["Cash accounts", "Original cash counts"]) {
    const html = renderToStaticMarkup(
      <AssistantAnswerCard
        title={title}
        value="10 on this page"
        scope="Tenant Finance Book · NGN"
        asOf="15 Oct 2026"
      >
        <span>
          More available; continue with the same Book/account. Identities only.
        </span>
      </AssistantAnswerCard>,
    )
    for (const text of [
      title,
      "10 on this page",
      "NGN",
      "same Book/account",
      "Identities only",
    ])
      expect(html).toContain(text)
    expect(html).not.toContain("<button")
  }
})
