import { describe, expect, test } from "bun:test"
import type { Prisma } from "@ewatrade/db/types"
import { serviceIntakeOptionPage } from "./service-intake-option-page"
import { seedServiceIntakeRollbackFixture } from "./service-intake-rollback-fixture"
import { serviceIntakeRollbackTimings } from "./service-intake-rollback-timing"

describe("D04 guarded rollback tools", () => {
  test("wrong QA scope and nonce refuse before any fixture statement", async () => {
    let statements = 0
    const tx = {
      $queryRaw: async () => {
        statements++
        return []
      },
    } as unknown as Prisma.TransactionClient
    const previous = {
      RUN_D04_QA_ROLLBACK: process.env.RUN_D04_QA_ROLLBACK,
      APP_ENV: process.env.APP_ENV,
      NODE_ENV: process.env.NODE_ENV,
    }
    try {
      process.env.RUN_D04_QA_ROLLBACK = "1"
      process.env.APP_ENV = "local"
      Reflect.set(process.env, "NODE_ENV", "development")
      const correct = {
        tenantId: "cmuzedcda000hbw9kd6e50z8u",
        storeId: "cmuzedcow000jbw9kluarpxfs",
        actorUserId: "cmuzedc7e000gbw9ky1dioc9f",
        nonce: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      }
      for (const invalid of [
        { ...correct, tenantId: "foreign" },
        { ...correct, storeId: "foreign" },
        { ...correct, actorUserId: "foreign" },
        { ...correct, nonce: "not-a-nonce" },
      ])
        await expect(
          seedServiceIntakeRollbackFixture(tx, invalid),
        ).rejects.toThrow("Exact local D04 rollback fixture required")
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
    expect(statements).toBe(0)
  })

  test("timing proxy forwards arguments and preserves errors without recording secrets", async () => {
    const failure = Error("expected")
    let argument: unknown
    const tx = {
      customer: {
        findFirst: async (args: unknown) => {
          argument = args
          return { id: "original" }
        },
        update: async () => {
          throw failure
        },
      },
    } as unknown as Prisma.TransactionClient
    const timing = serviceIntakeRollbackTimings()
    const timed = timing.transaction(tx)
    const args = { where: { id: "secret-contact-value" } }
    expect(
      (await timing.phase("read", () => timed.customer.findFirst(args)))?.id,
    ).toBe("original")
    expect(argument).toBe(args)
    await expect(
      timing.phase("failure", () =>
        timed.customer.update({ where: { id: "id" }, data: {} }),
      ),
    ).rejects.toBe(failure)
    const evidence = timing.evidence()
    expect(
      evidence.calls.map((row) => [row.phase, row.operation, row.outcome]),
    ).toEqual([
      ["read", "customer.findFirst", "ok"],
      ["failure", "customer.update", "error"],
    ])
    expect(JSON.stringify(evidence)).not.toContain("secret-contact-value")
    expect(evidence.transactionBodyStartedMs).not.toBeNull()
  })

  test("Offering continuation exhausts a crowded item page before moving to next catalog page", () => {
    const choices = Array.from({ length: 220 }, (_, index) => ({
      offeringId: `offering-${index}`,
      name: "Same visible name",
    }))
    const input = { query: "same name", cursor: "catalog-page-1" }
    const first = serviceIntakeOptionPage(choices, input, "catalog-page-2")
    const second = serviceIntakeOptionPage(
      choices,
      first.continuation ?? {},
      "catalog-page-2",
    )
    const third = serviceIntakeOptionPage(
      choices,
      second.continuation ?? {},
      "catalog-page-2",
    )
    expect(first.offerings).toHaveLength(100)
    expect(first.continuation?.cursor).toBe("catalog-page-1")
    expect(second.offerings).toHaveLength(100)
    expect(second.continuation?.cursor).toBe("catalog-page-1")
    expect(third.offerings).toHaveLength(20)
    expect(third.continuation).toEqual({
      query: "same name",
      cursor: "catalog-page-2",
    })
    expect([
      ...first.offerings,
      ...second.offerings,
      ...third.offerings,
    ]).toEqual(choices)
  })

  test("missing Offering continuation refuses instead of skipping or restarting", () => {
    expect(() =>
      serviceIntakeOptionPage([{ offeringId: "original" }], {
        offeringAfter: "removed",
      }),
    ).toThrow("Service options changed")
  })
})
