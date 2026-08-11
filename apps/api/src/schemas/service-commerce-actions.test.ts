import { describe, expect, test } from "bun:test"

import {
  serviceCommerceCustomerActionExecuteSchema,
  serviceCommerceCustomerActionReadSchema,
  serviceCommerceCustomerActionsIssueSchema,
} from "./service-commerce-actions"

describe("Service Commerce customer action API schemas", () => {
  test("keeps public action inputs capability-only", () => {
    const input = {
      capabilityToken: "x".repeat(20),
      clientOperationId: "operation-1",
      confirmed: true,
    }
    expect(serviceCommerceCustomerActionExecuteSchema.parse(input)).toEqual(
      input,
    )
    expect(
      serviceCommerceCustomerActionExecuteSchema.safeParse({
        ...input,
        tenantId: "tenant-1",
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceCustomerActionReadSchema.safeParse({
        capabilityToken: input.capabilityToken,
        storeId: "store-1",
      }).success,
    ).toBe(false)
  })

  test("keeps the WhatsApp template server-owned", () => {
    const base = {
      channel: "whatsapp",
      clientBatchId: "batch-1",
      expiresAt: "2030-08-12T10:00:00.000Z",
      source: { id: "request-1", kind: "service" },
    }
    expect(
      serviceCommerceCustomerActionsIssueSchema.safeParse(base).success,
    ).toBe(true)
    expect(
      serviceCommerceCustomerActionsIssueSchema.safeParse({
        ...base,
        templateKey: "request_update_v1",
      }).success,
    ).toBe(false)
  })
})
