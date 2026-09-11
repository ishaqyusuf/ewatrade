export type QaQuickFillIntent = "confirm" | "fill" | "none" | "undo"

export function resolveQaQuickFillIntent(input: {
  action: "cancel" | "confirm" | "request" | "undo"
  canUndo?: boolean
  isDirty?: boolean
}): QaQuickFillIntent {
  if (input.action === "request") return input.isDirty ? "confirm" : "fill"
  if (input.action === "confirm") return "fill"
  if (input.action === "undo") return input.canUndo ? "undo" : "none"
  return "none"
}
