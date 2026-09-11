import { describe, expect, test } from "bun:test"
import { resolveQaQuickFillIntent } from "./qa-quick-fill-interaction"

describe("QA Quick Fill interaction", () => {
  test("fills a pristine form without submitting", () => {
    expect(
      resolveQaQuickFillIntent({ action: "request", isDirty: false }),
    ).toBe("fill")
  })

  test("requires confirmation before replacing a dirty draft", () => {
    expect(resolveQaQuickFillIntent({ action: "request", isDirty: true })).toBe(
      "confirm",
    )
    expect(resolveQaQuickFillIntent({ action: "cancel" })).toBe("none")
    expect(resolveQaQuickFillIntent({ action: "confirm" })).toBe("fill")
  })

  test("only exposes Undo when a snapshot exists", () => {
    expect(resolveQaQuickFillIntent({ action: "undo", canUndo: false })).toBe(
      "none",
    )
    expect(resolveQaQuickFillIntent({ action: "undo", canUndo: true })).toBe(
      "undo",
    )
  })
})
