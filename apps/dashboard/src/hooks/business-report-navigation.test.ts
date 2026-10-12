import { expect, test } from "bun:test"
import { businessReportOriginalParams } from "./business-report-navigation"
test("G01 original object handoff clears only reporting/object keys and preserves assistant/chat", () => {
  for (const target of [
    { kind: "catalog_item" as const, id: "exact-item" },
    { kind: "customer" as const, id: "exact-customer" },
  ]) {
    const before = {
      assistant: "open",
      assistantConversation: "saved-chat",
      arbitrary: "keep",
      businessReport: "old",
    }
    const patch = businessReportOriginalParams(target)
    const after = { ...before, ...patch }
    expect(after.assistant).toBe("open")
    expect(after.assistantConversation).toBe("saved-chat")
    expect(after.arbitrary).toBe("keep")
    expect(after.businessReport).toBeNull()
    expect(
      target.kind === "catalog_item"
        ? after.catalogDetail
        : after.customerDetail,
    ).toBe(target.id)
  }
})
