import { describe, expect, test } from "bun:test"
import {
  type OrderMessagePreview,
  type SavedTemplate,
  type TemplateList,
  adoptOwnWrite,
  applyTemplateWrite,
  applyTemplateWriteIfCurrent,
  blockedMessageCopy,
  captureBaselines,
  editorStateFor,
  insertVariable,
  messageActionState,
  reconcileEditor,
  tryRenderMessage,
  writeContextIsCurrent,
} from "./message-model"

const preview = (patch: Partial<OrderMessagePreview>) =>
  ({
    eventKey: "payment.recorded",
    reason: null,
    recipient: { name: "Ada", phoneDisplay: "+234 803 000 0000" },
    sourceChoices: [],
    state: "ready",
    ...patch,
  }) as unknown as OrderMessagePreview

describe("WhatsApp readiness", () => {
  test("only saved, resolvable wording is ready; no phone hides the action", () => {
    expect(messageActionState(preview({ state: "ready" })).kind).toBe("ready")
    expect(messageActionState(preview({ state: "not_composed" })).kind).toBe(
      "compose",
    )
    expect(messageActionState(preview({ state: "no_phone" })).kind).toBe(
      "hidden",
    )
    expect(messageActionState(preview({ state: "disabled" })).kind).toBe(
      "disabled",
    )
  })

  test("a payment message with nothing to choose says so instead of asking", () => {
    const empty = preview({ state: "source_required", sourceChoices: [] })
    expect(blockedMessageCopy(empty)).toBe(
      "This order has no recorded payment to describe.",
    )
    expect(messageActionState(empty)).toEqual({
      kind: "blocked",
      reason: "Nothing recorded to describe",
    })
  })
})

describe("composer helpers", () => {
  test("inserts a detail at the caret with a separating space", () => {
    expect(
      insertVariable("Hi", "customer_first_name", { start: 2, end: 2 }),
    ).toEqual({ value: "Hi {customer_first_name}", caret: 24 })
  })

  test("renders with the shared validator and reports bad tokens", () => {
    const ok = tryRenderMessage(
      "order.completed",
      "Thanks for {order_number} 🎉",
      {
        order_number: "ORD-1",
      },
    )
    expect(ok.text).toBe("Thanks for ORD-1 🎉")
    const bad = tryRenderMessage("order.completed", "Pay {amount_paid}", {})
    expect(bad.text).toBeNull()
    expect(bad.problem).toContain("amount_paid")
  })
})

test("a confirmed write replaces only its scope's cached row", () => {
  const row = (id: string, scopeKey: string, revision: number) =>
    ({
      id,
      scopeKey,
      revision,
      eventKey: "order.recorded",
      body: id,
    }) as SavedTemplate
  const list = {
    storeId: "s1",
    templates: [row("b", "business", 1), row("s", "store:s1", 1)],
  } as unknown as TemplateList
  const next = applyTemplateWrite(
    list,
    { eventKey: "order.recorded", scope: "business" },
    { removed: false, template: row("b", "business", 2) },
  )
  expect(next.templates.map((item) => [item.id, item.revision])).toEqual([
    ["s", 1],
    ["b", 2],
  ])
})

test("an AI batch keeps the guard it started with after the list refreshes", () => {
  const row = (revision: number) =>
    ({
      id: "b",
      scopeKey: "business",
      revision,
      eventKey: "order.recorded",
      body: "x",
    }) as SavedTemplate
  const before = {
    storeId: "s1",
    templates: [row(1)],
  } as unknown as TemplateList
  const baseline = captureBaselines(before, ["order.recorded"], "business")
  const refreshed = applyTemplateWrite(
    before,
    { eventKey: "order.recorded", scope: "business" },
    { removed: false, template: row(2) },
  )
  expect(refreshed.templates[0]?.revision).toBe(2)
  expect(baseline.get("order.recorded")).toEqual({
    expectedRevision: 1,
    expectedTemplateId: "b",
  })
})

describe("saved-wording editor guard", () => {
  const saved = (revision: number, body: string, id = "b") =>
    ({
      id,
      scopeKey: "business",
      revision,
      eventKey: "order.recorded",
      body,
    }) as SavedTemplate

  test("a clean editor adopts a refetched row", () => {
    const next = reconcileEditor(
      editorStateFor(saved(1, "Old")),
      saved(2, "Theirs"),
    )
    expect(next.body).toBe("Theirs")
    expect(next.guard).toEqual({ expectedRevision: 2, expectedTemplateId: "b" })
  })

  test("typed text keeps its original guard and raises a conflict", () => {
    const typed = { ...editorStateFor(saved(1, "Old")), body: "Mine" }
    const next = reconcileEditor(typed, saved(2, "Theirs"))
    expect(next).toMatchObject({ body: "Mine", conflict: true })
    expect(next.guard).toEqual({ expectedRevision: 1, expectedTemplateId: "b" })
    expect(reconcileEditor(typed, null).body).toBe("Mine")
  })

  test("its own confirmed save is adopted", () => {
    const typed = { ...editorStateFor(saved(1, "Old")), body: "Mine" }
    const next = adoptOwnWrite(typed, {
      removed: false,
      template: saved(2, "Mine"),
    })
    expect(next).toEqual({
      body: "Mine",
      baseline: "Mine",
      guard: { expectedRevision: 2, expectedTemplateId: "b" },
      conflict: false,
    })
  })
})

test("a template save landing after a Store switch leaves the new list alone", () => {
  const fresh = {
    storeId: "s2",
    templates: [
      {
        id: "n",
        scopeKey: "business",
        revision: 1,
        eventKey: "order.recorded",
        body: "New",
      },
    ],
  } as unknown as TemplateList
  const late = applyTemplateWriteIfCurrent(
    fresh,
    "s1",
    { eventKey: "order.recorded", scope: "business" },
    {
      removed: false,
      template: {
        id: "o",
        scopeKey: "business",
        revision: 5,
        eventKey: "order.recorded",
        body: "Old business",
      } as SavedTemplate,
    },
  )
  expect(late?.templates.map((item) => item.body)).toEqual(["New"])
})

test("a template response after a cache clear stays discarded on the same Store", () => {
  const started = { storeId: "s1", generation: 1 }
  expect(writeContextIsCurrent(started, { storeId: "s1", generation: 1 })).toBe(
    true,
  )
  expect(writeContextIsCurrent(started, { storeId: "s1", generation: 2 })).toBe(
    false,
  )
})
