import { expect, test } from "bun:test"
import {
  generalProposalReferenceSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  generalPersistentParts,
  generalProposalReferencePart,
} from "./general-persistence"
import { proposalDigest } from "./proposal-security"

const payload = { action: "customer_create", name: "Amina" }
const source = {
  proposalId: "server-created-proposal",
  revision: 4,
  payloadHash: proposalDigest(payload),
}

test("the exact server draft reference survives final persistence without SDK metadata", () => {
  const part = generalProposalReferencePart(source.proposalId, source)
  if (!part) throw Error("Expected canonical proposal reference")
  expect(part).toEqual({
    type: "data-general-proposal-reference",
    data: source,
  })
  expect(generalStoredPartSchema.safeParse(part).success).toBe(true)
  expect(
    generalPersistentParts([
      { type: "text", text: "Review the customer draft.", state: "done" },
      { ...part, id: "sdk-data-id", transient: false },
      {
        type: "data-general-proposal",
        data: { proposalId: source.proposalId },
        transient: true,
      },
      { type: "tool-draftAction", output: { ...source, payload } },
    ]),
  ).toEqual([{ type: "text", text: "Review the customer draft." }, part])
  expect(source.payloadHash).toHaveLength(64)
})

test("callback identity cannot substitute a different proposal or manufacture missing provenance", () => {
  expect(generalProposalReferencePart("other-proposal", source)).toBeUndefined()
  expect(
    generalProposalReferencePart(source.proposalId, undefined),
  ).toBeUndefined()
  expect(
    generalProposalReferencePart(source.proposalId, {
      proposalId: source.proposalId,
    }),
  ).toBeUndefined()
  const edited = {
    ...source,
    revision: 5,
    payloadHash: proposalDigest({ ...payload, name: "Amina Bello" }),
  }
  const original = generalProposalReferencePart(source.proposalId, source)
  expect(generalProposalReferencePart(source.proposalId, edited)).not.toEqual(
    original,
  )
  expect(original?.data).toEqual(source)
  expect(proposalDigest({ name: "Amina", action: "customer_create" })).toBe(
    source.payloadHash,
  )
})

test("approval credentials, authority, malformed revisions and arbitrary hashes cannot persist", () => {
  for (const invalid of [
    { ...source, approvalToken: "browser-secret" },
    { ...source, approvalTokenHash: "secret-hash" },
    { ...source, tenantId: "other" },
    { ...source, bindingId: "other" },
    { ...source, payload },
    { ...source, revision: 0 },
    { ...source, revision: 1.5 },
    { ...source, payloadHash: "model supplied text" },
    { ...source, payloadHash: "a".repeat(63) },
    { ...source, payloadHash: "A".repeat(64) },
    { ...source, proposalId: "x".repeat(129) },
  ]) {
    expect(generalProposalReferenceSchema.safeParse(invalid).success).toBe(
      false,
    )
    expect(
      generalProposalReferencePart(source.proposalId, invalid),
    ).toBeUndefined()
    expect(
      generalPersistentParts([
        { type: "data-general-proposal-reference", data: invalid },
      ]),
    ).toEqual([])
  }
})
