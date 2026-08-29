import { describe, expect, test } from "bun:test"
import { AppError } from "@ewatrade/errors"
import {
  createBeforeSend,
  createSafeDiagnosticError,
  isExternalDiagnosticsEnabled,
} from "."

describe("EwaTrade observability transmission policy", () => {
  test("requires exact production, DSN, release, and code authorization", () => {
    const base = {
      deploymentEnvironment: "production",
      dsn: "https://public@example.invalid/1",
      nodeEnvironment: "production",
      release: "ewatrade-api@abc123",
    }
    expect(isExternalDiagnosticsEnabled(base)).toBe(true)
    expect(
      isExternalDiagnosticsEnabled({
        ...base,
        deploymentEnvironment: "preview",
      }),
    ).toBe(false)
    expect(
      isExternalDiagnosticsEnabled({ ...base, nodeEnvironment: "development" }),
    ).toBe(false)
    expect(isExternalDiagnosticsEnabled({ ...base, release: "" })).toBe(false)
  })

  test("drops expected commerce conflicts", () => {
    expect(
      createSafeDiagnosticError(new AppError({ code: "STOCK_CONFLICT" }), {
        operation: "inventory.reserve",
        runtime: "api",
      }),
    ).toBeNull()
  })

  test("reconstructs an outbound event instead of redacting in place", () => {
    const original = Object.assign(new Error("customer phone +234 and token"), {
      customer: { phone: "+234" },
      payment: { reference: "private" },
    })
    const safeError = createSafeDiagnosticError(original, {
      operation: "payments.capture",
      requestId: "req_550e8400-e29b-41d4-a716-446655440000",
      runtime: "api",
    })
    expect(safeError).not.toBeNull()
    const rebuilt = createBeforeSend("api")(
      {
        breadcrumbs: [{ message: "private conversation" }],
        contexts: { customer: { phone: "+234" } },
        extra: { order: "private" },
        logentry: { message: "private log entry" },
        request: { data: "private payload" },
        user: { email: "private@example.com" },
      },
      { originalException: safeError },
    )
    const serialized = JSON.stringify(rebuilt)
    expect(serialized).not.toContain("+234")
    expect(serialized).not.toContain("private")
    expect(serialized).not.toContain("token")
    expect(serialized).not.toContain("log entry")
    expect(rebuilt?.tags).toEqual({
      error_code: "UNEXPECTED",
      operation: "payments.capture",
      request_id: "req_550e8400-e29b-41d4-a716-446655440000",
      runtime: "api",
    })
  })

  test("rejects unsafe operation and request identifiers", () => {
    const safeError = createSafeDiagnosticError(new Error("boom"), {
      operation: "customer email private@example.com",
      requestId: "token with spaces",
      runtime: "jobs",
    })
    const rebuilt = createBeforeSend("jobs")(
      {},
      { originalException: safeError },
    )
    expect(rebuilt?.tags).toEqual({ error_code: "UNEXPECTED", runtime: "jobs" })
  })

  test("filters commerce identifiers from stack frame paths", () => {
    const safeError = createSafeDiagnosticError(new Error("boom"), {
      runtime: "storefront",
    })
    const rebuilt = createBeforeSend("storefront")(
      {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename:
                      "https://shop.example.test/orders/ORD_PRIVATE_123/payments/ref_private_456",
                  },
                  {
                    filename:
                      "https://api.example.test/inventory/inventory_private/domain/registrant_private/domains/acme.com.ng/offline-command/command_private",
                  },
                ],
              },
            },
          ],
        },
      },
      { originalException: safeError },
    )
    expect(JSON.stringify(rebuilt)).not.toContain("ORD_PRIVATE_123")
    expect(JSON.stringify(rebuilt)).not.toContain("ref_private_456")
    expect(JSON.stringify(rebuilt)).not.toContain("inventory_private")
    expect(JSON.stringify(rebuilt)).not.toContain("registrant_private")
    expect(JSON.stringify(rebuilt)).not.toContain("acme.com.ng")
    expect(JSON.stringify(rebuilt)).not.toContain("command_private")
  })
})
