import { expect, test } from "bun:test"
import {
  isProposalApprovalValid,
  proposalApprovalToken,
  proposalDigest,
} from "./proposal-security"
const secret = "s".repeat(48)
const binding = {
  id: "proposal",
  revision: 1,
  payloadHash: proposalDigest({ amount: 100 }),
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  expiresAt: new Date("2030-01-01"),
}
const token = proposalApprovalToken(binding, secret)
const proposal = { ...binding, approvalTokenHash: proposalDigest(token) }
test("approval binds every scope, payload, revision and expiry field", () => {
  expect(
    isProposalApprovalValid(proposal, token, secret, new Date("2026-01-01")),
  ).toBe(true)
  for (const change of [
    { id: "other" },
    { revision: 2 },
    { payloadHash: proposalDigest({ amount: 101 }) },
    { tenantId: "other" },
    { storeId: "other" },
    { actorUserId: "other" },
    { expiresAt: new Date("2031-01-01") },
  ])
    expect(
      isProposalApprovalValid(
        { ...proposal, ...change },
        token,
        secret,
        new Date("2026-01-01"),
      ),
    ).toBe(false)
  expect(
    isProposalApprovalValid(proposal, token, secret, new Date("2030-01-01")),
  ).toBe(false)
  expect(isProposalApprovalValid(proposal, token, "x".repeat(48))).toBe(false)
  expect(isProposalApprovalValid(proposal, `${token}x`, secret)).toBe(false)
  expect(
    isProposalApprovalValid(
      { ...proposal, approvalTokenHash: "wrong" },
      token,
      secret,
    ),
  ).toBe(false)
})
test("canonical digest ignores object field order but preserves values and list order", () => {
  expect(proposalDigest({ b: 2, a: 1 })).toBe(proposalDigest({ a: 1, b: 2 }))
  expect(proposalDigest({ a: undefined, b: 2 })).toBe(proposalDigest({ b: 2 }))
  expect(proposalDigest([1, 2])).not.toBe(proposalDigest([2, 1]))
})
