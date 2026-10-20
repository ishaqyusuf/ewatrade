import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { CatalogError } from "@ewatrade/db/queries"
import { toPublicError } from "@ewatrade/errors"
import { createCallerFactory } from "./init"
import {
  plainInventoryRuleKeys,
  plainInventoryRuleMessage,
  plainUnitConfigurationMessage,
} from "./inventory-rule-messages"
import { inventoryRouter } from "./routers/inventory"

const queriesDir = join(import.meta.dir, "../../../../packages/db/src/queries")
const domainSource = readdirSync(queriesDir)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => readFileSync(join(queriesDir, name), "utf8"))
  .join("\n")
  .toLowerCase()

describe("plain inventory rule messages", () => {
  test("every rewritten rule still exists in the domain code", () => {
    const missing = plainInventoryRuleKeys.filter(
      (key) => !domainSource.includes(key),
    )
    expect(missing).toEqual([])
  })

  test("rewrites listed rules and leaves others alone", () => {
    expect(
      plainInventoryRuleMessage({
        message: "The operation would reduce on-hand below reserved stock.",
      }),
    ).toBe("Not enough free stock for this. Some of it is held for orders.")
    expect(
      plainInventoryRuleMessage({
        message:
          "The selected Balance Source has insufficient available stock.",
      }),
    ).toBeNull()
    expect(
      plainInventoryRuleMessage({
        message: "The Balance Source changed while posting this operation.",
      }),
    ).toBeNull()
  })

  test("explains Units sheet rules, keeping the unit's name", () => {
    expect(
      plainUnitConfigurationMessage(
        "Configured unit Tray is still used by an Offering.",
      ),
    ).toBe("Tray is still used by a selling option. Remove it there first.")
    expect(
      plainUnitConfigurationMessage(
        "Unit keys must be unique within a configuration.",
      ),
    ).toBe("Two units have the same short code. Change one of them.")
    expect(
      plainUnitConfigurationMessage("Only a tenant-owned Draft can be edited."),
    ).toBeNull()
  })

  test("the router sends a listed rule as a public, editable refusal", async () => {
    const createCaller = createCallerFactory(inventoryRouter)
    const db = {
      $transaction: async () => {
        throw new CatalogError(
          "INSUFFICIENT_STOCK",
          "Dispatch would consume reserved or unavailable stock.",
        )
      },
    }
    const caller = createCaller({
      db,
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "session-token" },
        user: { id: "session-actor" },
      },
      tenantContext: {
        tenant: { id: "session-tenant", qaPurgeStartedAt: null },
        membership: { id: "membership-1", role: "OWNER" },
        stores: [{ id: "store-a" }, { id: "store-b" }],
        activeStore: { id: "store-a" },
      },
    } as never)
    const failure = await caller
      .dispatchTransfer({
        clientOperationId: "dispatch-command-001",
        clientTransferId: "dispatch-transfer-001",
        expectedSourceRevision: 1,
        quantity: "5",
        reason: "Weekend stock",
        schemaVersion: 1,
        source: "dashboard_inventory",
        sourceBalanceSourceId: "balance-1",
        targetStoreId: "store-b",
      })
      .catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: "BAD_REQUEST" })
    const publicError = toPublicError(failure)
    expect(publicError.code).toBe("RULE_REJECTED")
    expect(publicError.message).toBe(
      "Not enough free stock to send that many. Some of it may be held for orders.",
    )
  })
})
