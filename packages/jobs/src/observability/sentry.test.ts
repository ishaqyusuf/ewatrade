import { describe, expect, test } from "bun:test"
import { createSafeDiagnosticError } from "@ewatrade/observability"
import { terminalJobError } from "./sentry"

describe("jobs terminal observability seam", () => {
  test("keeps job payloads outside the diagnostic event", () => {
    const payload = {
      customer: { phone: "+234" },
      message: "private conversation",
      orderId: "order_private",
    }
    const safeError = createSafeDiagnosticError(
      Object.assign(new Error("provider failure"), { payload }),
      { operation: "jobs.domains.registration", runtime: "jobs" },
    )
    expect(JSON.stringify(safeError)).not.toContain("order_private")
    expect(JSON.stringify(safeError)).not.toContain("+234")
  })

  test("classifies provider-owned terminal workflows precisely", () => {
    expect(
      terminalJobError(
        new Error("private registrar body"),
        "domains.registration",
      ),
    ).toMatchObject({
      code: "REGISTRAR_PROVIDER_FAILED",
      operation: "jobs.domains.registration",
    })
    for (const task of [
      "prescriptions.whatsapp-inbound",
      "services.notification.dispatch",
      "service-commerce.booking-notification-dispatch",
      "service-commerce.whatsapp-inbound",
    ]) {
      expect(
        terminalJobError(new Error("private message body"), task),
      ).toMatchObject({
        code: "MESSAGING_PROVIDER_FAILED",
        operation: `jobs.${task}`,
      })
    }
  })
})
