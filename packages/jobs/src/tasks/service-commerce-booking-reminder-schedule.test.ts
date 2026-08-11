import { describe, expect, test } from "bun:test"

import { runServiceCommerceBookingReminderSchedule } from "./service-commerce-booking-reminder-schedule"

describe("Service Commerce booking reminder schedule", () => {
  test("pages repository-scoped work and enqueues only identifier-only Store scopes", async () => {
    const listCalls: unknown[] = []
    const queued: unknown[] = []
    const result = await runServiceCommerceBookingReminderSchedule({
      enqueue: async (scope) => queued.push(scope),
      list: async (input) => {
        listCalls.push(input)
        return input.afterProfileId
          ? {
              nextProfileId: null,
              scopes: [
                {
                  actorUserId: "worker_2",
                  storeId: "store_2",
                  tenantId: "tenant_2",
                },
              ],
            }
          : {
              nextProfileId: "profile_1",
              scopes: [
                {
                  actorUserId: "worker_1",
                  storeId: "store_1",
                  tenantId: "tenant_1",
                },
              ],
            }
      },
    })

    expect(result).toEqual({ nextProfileId: null, pages: 2, queued: 2 })
    expect(listCalls).toEqual([
      { afterProfileId: undefined, limit: 50 },
      { afterProfileId: "profile_1", limit: 50 },
    ])
    expect(queued).toEqual([
      { actorUserId: "worker_1", storeId: "store_1", tenantId: "tenant_1" },
      { actorUserId: "worker_2", storeId: "store_2", tenantId: "tenant_2" },
    ])
  })

  test("does not enqueue when a repository page has no eligible scopes", async () => {
    await expect(
      runServiceCommerceBookingReminderSchedule({
        enqueue: async () => {
          throw new Error("not used")
        },
        list: async () => ({ nextProfileId: null, scopes: [] }),
      }),
    ).resolves.toEqual({ nextProfileId: null, pages: 1, queued: 0 })
  })

  test("returns a continuation cursor when the bounded page budget is exhausted", async () => {
    const listCalls: unknown[] = []
    const result = await runServiceCommerceBookingReminderSchedule({
      enqueue: async () => undefined,
      list: async (input) => {
        listCalls.push(input)
        const page = listCalls.length
        return {
          nextProfileId: `profile_${page}`,
          scopes: [],
        }
      },
    })

    expect(result).toEqual({ nextProfileId: "profile_4", pages: 4, queued: 0 })
    expect(listCalls).toHaveLength(4)
  })
})
