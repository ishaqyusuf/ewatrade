import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { z } from "zod"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"

const accountResult = z.object({
  status: z.literal("available"),
  data: z.object({
    revision: z.string(),
    snapshotSequence: z.string(),
    totals: z.object({ availableCreditMinor: z.string() }),
  }),
})

/** Called only inside the owned, isolated held-refund fixture; activation is process-local. */
export async function verifyCustomerFundsTools(
  ctx: GeneralContext,
  conversationId: string,
  target: { accountId: string; customerId: string; creditEntryId: string },
  previous?: { revision: string; snapshotSequence: string },
) {
  const ids = [
    "customers.account.read",
    "customers.sources.read",
    "customers.statement.read",
  ]
  const capabilities = capabilityManifest.filter((capability) =>
    ids.includes(capability.id),
  )
  const saved = capabilities.map((capability) => capability.rollout)
  if (
    ctx.tenantContext.tenant.dataClassification !== "QA" ||
    process.env.RUN_GENERAL_HELD_CREDIT_REFUND !== "1"
  )
    throw Error("Owned refund fixture required")
  try {
    for (const capability of capabilities)
      Object.assign(capability, { rollout: "source" })
    const answers: GeneralAnswer[] = []
    const tools = createGeneralTools(
      ctx,
      conversationId,
      () => {
        throw Error("Read created a proposal")
      },
      (answer) => answers.push(answer),
    )
    async function execute(name: string, input: unknown) {
      const execute = tools[name]?.execute
      if (!execute) throw Error(`Missing read tool ${name}`)
      return execute(input, { toolCallId: randomUUID(), messages: [] })
    }
    const detail = accountResult.parse(
      await execute("readCustomerAccount", { accountId: target.accountId }),
    )
    expect(detail.data.totals.availableCreditMinor).toBe(
      previous ? "750" : "1000",
    )
    expect(
      await execute("readCustomerAccounts", { customerId: target.customerId }),
    ).toMatchObject({
      status: "available",
      data: { accounts: [{ id: target.accountId }] },
    })
    expect(
      await execute("readCustomerLedgerSources", {
        accountId: target.accountId,
        side: "CREDIT",
        limit: 10,
      }),
    ).toMatchObject({
      status: "available",
      data: {
        sources: [
          {
            id: target.creditEntryId,
            remainingAmountMinor: previous ? "750" : "1000",
          },
        ],
      },
    })
    expect(
      await execute("readCustomerStatement", {
        accountId: target.accountId,
        limit: 10,
      }),
    ).toMatchObject({
      status: "available",
      data: { totals: { availableCreditMinor: previous ? "750" : "1000" } },
    })
    expect(
      await execute("readCustomerAccount", { accountId: randomUUID() }),
    ).toMatchObject({ status: "unavailable" })
    expect(answers.some((answer) => answer.value === "Unavailable")).toBe(true)
    if (previous) {
      expect(
        await execute("readCustomerLedgerSources", {
          accountId: target.accountId,
          side: "CREDIT",
          expectedRevision: previous.revision,
          limit: 10,
        }),
      ).toMatchObject({ status: "unavailable" })
      expect(
        await execute("readCustomerStatement", {
          accountId: target.accountId,
          snapshotSequence: previous.snapshotSequence,
          limit: 10,
        }),
      ).toMatchObject({
        status: "available",
        data: { totals: { availableCreditMinor: "1000" } },
      })
    }
    return {
      revision: detail.data.revision,
      snapshotSequence: detail.data.snapshotSequence,
    }
  } finally {
    capabilities.forEach((capability, index) =>
      Object.assign(capability, { rollout: saved[index] }),
    )
  }
}
