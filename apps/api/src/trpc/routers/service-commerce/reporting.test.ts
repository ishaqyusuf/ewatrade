import { describe, expect, test } from "bun:test"

import { createCallerFactory } from "../../init"
import { serviceCommerceReportingRouter } from "./reporting"

const createCaller = createCallerFactory(serviceCommerceReportingRouter)

function reportingDb(role: string, auditWrites: unknown[]) {
  const model = {
    findFirst: async () => null,
    findFirstOrThrow: async () => ({ currencyCode: "NGN", timezone: "UTC" }),
    findMany: async () => [],
  }
  return new Proxy(
    {
      membership: {
        findFirst: async () => ({ id: "membership_1", role }),
      },
      serviceCommerceReportReadAuditEvent: {
        create: async (value: unknown) => {
          auditWrites.push(value)
          return { id: "report_read_audit_1" }
        },
      },
      store: {
        ...model,
        findMany: async () => [{ id: "store_1", name: "Main store" }],
      },
      tenant: model,
    },
    {
      get(target, property) {
        return property in target
          ? target[property as keyof typeof target]
          : model
      },
    },
  )
}

function caller(role: string, auditWrites: unknown[] = []) {
  return createCaller({
    db: reportingDb(role, auditWrites),
    session: { user: { id: "actor_1" } },
    tenantContext: {
      activeStore: { id: "store_1" },
      membership: { role },
      stores: [{ id: "store_1" }],
      tenant: { id: "tenant_server" },
    },
  } as never)
}

const reportWindow = {
  end: new Date("2026-09-01T00:00:00.000Z"),
  start: new Date("2026-08-01T00:00:00.000Z"),
}

describe("Service Commerce reporting router", () => {
  test("derives tenant scope and returns aggregate-only report output", async () => {
    const auditWrites: unknown[] = []
    const result = await caller("OWNER", auditWrites).report(reportWindow)

    expect(result.scope).toEqual({
      ...reportWindow,
      storeId: null,
      tenantId: "tenant_server",
    })
    expect(JSON.stringify(result)).not.toContain("actor_1")
    expect(auditWrites).toEqual([
      {
        data: expect.objectContaining({
          actorUserId: "actor_1",
          kind: "REPORT",
          outcome: "ALLOWED",
          purpose: "service_commerce_report_read",
          source: "SERVICE_COMMERCE_REPORTING",
          tenantId: "tenant_server",
        }),
      },
    ])
  })

  test("rejects cashier access and cross-tenant Store input", async () => {
    await expect(caller("CASHIER").report(reportWindow)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(
      caller("MANAGER").report({ ...reportWindow, storeId: "another_tenant" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test("derives actor scope for an allowlisted aggregate drill-down", async () => {
    await expect(
      caller("ADMIN").reportDrilldown({
        ...reportWindow,
        category: "reliability",
      }),
    ).resolves.toMatchObject({
      category: "reliability",
      rows: [],
      scope: { storeId: null },
    })
  })
})
