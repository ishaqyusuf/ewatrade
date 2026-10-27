import { expect, test } from "bun:test"
import {
  commercePreparationEnabled,
  preparationObservation,
} from "./preparation-observability"
test("preparation diagnostics retain bounded counts and version context, excluding input content", () => {
  const event = preparationObservation({
    kind: "order",
    durationMs: Number.POSITIVE_INFINITY,
    lineCount: 5,
    unresolvedCount: 2,
    missingCount: 1,
    correction: true,
    ...{ message: "private merchant text", credential: "not diagnostic data" },
  })
  expect(event.durationMs).toBe(0)
  expect(event.lineCount).toBe(5)
  expect(event.version).toBe("commerce-preparation-v1")
  expect(event).not.toHaveProperty("message")
  expect(event).not.toHaveProperty("credential")
  expect(
    commercePreparationEnabled({
      ASSISTANT_COMMERCE_PREPARATION_ENABLED: "false",
    }),
  ).toBe(false)
  expect(commercePreparationEnabled({})).toBe(true)
})
