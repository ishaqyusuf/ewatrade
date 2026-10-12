import { expect, test } from "bun:test"
import {
  generalActionSchema,
  type GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import { projectGeneralProposalHistory } from "./general-proposal-history"
const payload = { action: "customer_create", name: "History QA customer" }
const row = (id: string) => ({
  id,
  action: "customer_create",
  actionVersion: 1,
  status: "PENDING" as const,
  payload,
  executedResult: null,
})
const proposal = (id: string): GeneralProposal => ({
  id,
  revision: 1,
  payload: generalActionSchema.parse(payload),
  status: "PENDING",
  expiresAt: "2026-10-20T00:00:00Z",
  receipt: null,
})

test("unknown historical action preserves valid proposals and yields no payload, receipt or approval", async () => {
  expect(
    generalActionSchema.safeParse({
      action: "future_action",
      privateToken: "secret",
    }).success,
  ).toBe(false)
  const reads: string[] = []
  const history = await projectGeneralProposalHistory(
    [
      row("valid-before"),
      {
        ...row("future"),
        payload: { action: "future_action", privateToken: "secret" },
      },
      row("valid-after"),
    ],
    {
      supports: () => true,
      read: async (r) => {
        reads.push(r.id)
        return proposal(r.id)
      },
    },
  )
  expect(reads).toEqual(["valid-before", "valid-after"])
  expect(history.proposals.map((p) => p.id)).toEqual(reads)
  expect(history.unavailableProposals).toEqual([
    { id: "future", status: "PENDING", reason: "payload_unavailable" },
  ])
  expect(JSON.stringify(history.unavailableProposals)).not.toContain("secret")
  expect(JSON.stringify(history.unavailableProposals)).not.toContain(
    "approvalToken",
  )
})
test("invalid receipt, mismatched version/action and unsupported client never reach approval projection", async () => {
  const reads: string[] = []
  const history = await projectGeneralProposalHistory(
    [
      {
        ...row("receipt"),
        status: "COMPLETED" as const,
        executedResult: { kind: "future_receipt", privateToken: "secret" },
      },
      { ...row("version"), actionVersion: 999 },
      { ...row("action"), action: "different_action" },
      row("client"),
    ],
    {
      supports: (c) => c.action !== "customer_create",
      read: async (r) => {
        reads.push(r.id)
        return proposal(r.id)
      },
    },
  )
  expect(reads).toEqual([])
  expect(history.proposals).toEqual([])
  expect(history.unavailableProposals.map((p) => p.reason)).toEqual([
    "client_unavailable",
    "version_unavailable",
    "version_unavailable",
    "client_unavailable",
  ])
  const receipt = await projectGeneralProposalHistory(
    [
      {
        ...row("receipt"),
        status: "COMPLETED" as const,
        executedResult: { kind: "future_receipt" },
      },
    ],
    {
      supports: () => true,
      read: async () => {
        throw Error("Unsupported receipt reached approval")
      },
    },
  )
  expect(receipt.unavailableProposals[0]?.reason).toBe("receipt_unavailable")
})
test("auth/database failures from valid projection remain failures", async () => {
  await expect(
    projectGeneralProposalHistory([row("valid")], {
      supports: () => true,
      read: async () => {
        throw Error("FRESH_ACCESS_DENIED")
      },
    }),
  ).rejects.toThrow("FRESH_ACCESS_DENIED")
})
