import { describe, expect, test } from "bun:test"
import {
  type SavedTemplate,
  type TemplateList,
  adoptOwnWrite,
  applyTemplateWrite,
  applyTemplateWriteIfCurrent,
  captureBaselines,
  editorStateFor,
  expectedFor,
  reconcileEditor,
  savedMessageRowState,
  scopeTemplate,
  templateListInput,
  writeContextIsCurrent,
} from "./template-model"

const row = (patch: Partial<SavedTemplate>): SavedTemplate =>
  ({
    id: "t1",
    eventKey: "order.recorded",
    body: "Old {order_number}",
    enabled: true,
    revision: 1,
    scopeKey: "business",
    source: "MANUAL",
    updatedAt: new Date("2026-10-14T12:00:00Z"),
    ...patch,
  }) as SavedTemplate

const list = (templates: SavedTemplate[]): TemplateList =>
  ({
    storeId: "s1",
    storeName: "Main",
    businessName: "Biz",
    canManageTemplates: true,
    templates,
    statuses: [],
  }) as unknown as TemplateList

describe("template cache reconciliation", () => {
  test("a confirmed save replaces the cached row with the newer revision", () => {
    const next = applyTemplateWrite(
      list([row({})]),
      { eventKey: "order.recorded", scope: "business" },
      { removed: false, template: row({ body: "New", revision: 2 }) },
    )
    const saved = scopeTemplate(next, "order.recorded", "business")
    expect(saved?.body).toBe("New")
    expect(saved?.revision).toBe(2)
    expect(next.templates).toHaveLength(1)
  })

  test("a first save inserts the row without touching other scopes", () => {
    const store = row({ id: "t2", scopeKey: "store:s1", body: "Store" })
    const next = applyTemplateWrite(
      list([store]),
      { eventKey: "order.recorded", scope: "business" },
      { removed: false, template: row({ id: "t3" }) },
    )
    expect(scopeTemplate(next, "order.recorded", "store")?.id).toBe("t2")
    expect(scopeTemplate(next, "order.recorded", "business")?.id).toBe("t3")
  })

  test("reset removes only the Store override", () => {
    const next = applyTemplateWrite(
      list([row({}), row({ id: "t2", scopeKey: "store:s1" })]),
      { eventKey: "order.recorded", scope: "store" },
      { removed: true },
    )
    expect(scopeTemplate(next, "order.recorded", "store")).toBeNull()
    expect(scopeTemplate(next, "order.recorded", "business")?.id).toBe("t1")
  })

  test("writes carry the scope row's own id and revision", () => {
    expect(expectedFor(null)).toEqual({ expectedRevision: 0 })
    expect(expectedFor(row({ revision: 4 }))).toEqual({
      expectedRevision: 4,
      expectedTemplateId: "t1",
    })
  })
})

describe("AI batch baselines", () => {
  test("a refreshed list after another manager's save doesn't move the guard", () => {
    const before = list([row({ revision: 1 })])
    const baseline = captureBaselines(
      before,
      ["order.recorded", "payment.recorded"],
      "business",
    )
    // Another editor saves revision 2 while drafts are being reviewed.
    const refreshed = applyTemplateWrite(
      before,
      { eventKey: "order.recorded", scope: "business" },
      { removed: false, template: row({ revision: 2, body: "Theirs" }) },
    )
    expect(
      scopeTemplate(refreshed, "order.recorded", "business")?.revision,
    ).toBe(2)
    expect(baseline.get("order.recorded")).toEqual({
      expectedRevision: 1,
      expectedTemplateId: "t1",
    })
    expect(baseline.get("payment.recorded")).toEqual({ expectedRevision: 0 })
  })
})

describe("saved-wording editor guard", () => {
  test("a clean editor adopts another manager's newer row", () => {
    const state = editorStateFor(row({ revision: 1, body: "Old" }))
    const next = reconcileEditor(state, row({ revision: 2, body: "Theirs" }))
    expect(next.body).toBe("Theirs")
    expect(next.guard).toEqual({
      expectedRevision: 2,
      expectedTemplateId: "t1",
    })
    expect(next.conflict).toBe(false)
  })

  test("a dirty editor keeps its text and its original guard", () => {
    const typed = {
      ...editorStateFor(row({ revision: 1, body: "Old" })),
      body: "Mine",
    }
    const next = reconcileEditor(typed, row({ revision: 2, body: "Theirs" }))
    expect(next.body).toBe("Mine")
    expect(next.guard).toEqual({
      expectedRevision: 1,
      expectedTemplateId: "t1",
    })
    expect(next.conflict).toBe(true)
  })

  test("a reset or recreate elsewhere doesn't drop typed text", () => {
    const typed = { ...editorStateFor(row({ revision: 3 })), body: "Mine" }
    const recreated = reconcileEditor(typed, row({ id: "t9", revision: 1 }))
    expect(recreated.body).toBe("Mine")
    expect(recreated.conflict).toBe(true)
    expect(reconcileEditor(typed, null).body).toBe("Mine")
  })

  test("its own confirmed save is adopted, ending any conflict", () => {
    const typed = {
      ...editorStateFor(row({ revision: 1 })),
      body: "Mine",
      conflict: true,
    }
    const saved = adoptOwnWrite(typed, {
      removed: false,
      template: row({ revision: 2, body: "Mine" }),
    })
    expect(saved).toEqual({
      body: "Mine",
      baseline: "Mine",
      guard: { expectedRevision: 2, expectedTemplateId: "t1" },
      conflict: false,
    })
    expect(reconcileEditor(saved, row({ revision: 2, body: "Mine" }))).toBe(
      saved,
    )
  })
})

describe("writes after a switch", () => {
  test("a save that lands after a Store switch never touches the new list", () => {
    const newStore = {
      ...list([row({ id: "n1", body: "New store" })]),
      storeId: "s2",
    }
    const late = applyTemplateWriteIfCurrent(
      newStore,
      "s1",
      { eventKey: "order.recorded", scope: "business" },
      {
        removed: false,
        template: row({ body: "Old business wording", revision: 9 }),
      },
    )
    expect(late).toBe(newStore)
    expect(late?.templates.map((item) => item.body)).toEqual(["New store"])
  })

  test("a cleared cache stays empty and the same Store still updates", () => {
    const write = { eventKey: "order.recorded", scope: "business" } as const
    const result = { removed: false, template: row({ revision: 2 }) } as const
    expect(
      applyTemplateWriteIfCurrent(undefined, "s1", write, result),
    ).toBeUndefined()
    const same = applyTemplateWriteIfCurrent(
      list([row({})]),
      "s1",
      write,
      result,
    )
    expect(
      scopeTemplate(same as TemplateList, "order.recorded", "business")
        ?.revision,
    ).toBe(2)
  })
})

describe("write context fence", () => {
  test("a response after sign-out or A→B→A stays discarded on the same Store", () => {
    const started = { storeId: "s1", generation: 3 }
    expect(
      writeContextIsCurrent(started, { storeId: "s1", generation: 3 }),
    ).toBe(true)
    // Switched away and back: same Store id, newer cache generation.
    expect(
      writeContextIsCurrent(started, { storeId: "s1", generation: 5 }),
    ).toBe(false)
    expect(
      writeContextIsCurrent(started, { storeId: "s2", generation: 3 }),
    ).toBe(false)
    expect(
      writeContextIsCurrent(undefined, { storeId: "s1", generation: 3 }),
    ).toBe(false)
  })
})

describe("Settings row state", () => {
  const key = "order.recorded" as const
  test("All stores shows the business message", () => {
    expect(savedMessageRowState(list([]), key, "business")).toBe("missing")
    expect(savedMessageRowState(list([row({})]), key, "business")).toBe("ready")
    expect(
      savedMessageRowState(list([row({ enabled: false })]), key, "business"),
    ).toBe("off")
  })

  test("a Store shows its own message, else the business one it falls back to", () => {
    const own = row({ id: "t2", scopeKey: "store:s1" })
    expect(savedMessageRowState(list([row({}), own]), key, "store")).toBe("own")
    expect(
      savedMessageRowState(
        list([row({}), { ...own, enabled: false }]),
        key,
        "store",
      ),
    ).toBe("ownoff")
    expect(savedMessageRowState(list([row({})]), key, "store")).toBe("inherit")
    expect(
      savedMessageRowState(list([row({ enabled: false })]), key, "store"),
    ).toBe("inheritoff")
    expect(savedMessageRowState(list([]), key, "store")).toBe("missing")
  })

  test("no Store id reads the active Store", () => {
    expect(templateListInput(null)).toBeUndefined()
    expect(templateListInput("s2")).toEqual({ storeId: "s2" })
  })
})
