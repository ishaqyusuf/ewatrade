import { expect, test } from "bun:test"
import {
  generalPendingQuoteApprovalsInput,
  generalQuoteApprovalReadInput,
  quoteApprovalTargetSchema,
} from "./quote-reads"

test("requires the original decision, quotation and version without model scope", () => {
  const target = {
    approvalId: "decision-1",
    quoteId: "quote-1",
    quoteVersionId: "version-1",
  }
  expect(generalQuoteApprovalReadInput.parse(target)).toEqual(target)
  for (const field of ["approvalId", "quoteId", "quoteVersionId"]) {
    expect(
      generalQuoteApprovalReadInput.safeParse({ ...target, [field]: "" })
        .success,
    ).toBe(false)
  }
  for (const field of [
    "tenantId",
    "storeId",
    "actorUserId",
    "canApprove",
    "status",
  ]) {
    expect(
      generalQuoteApprovalReadInput.safeParse({ ...target, [field]: "spoofed" })
        .success,
    ).toBe(false)
  }
  expect(
    quoteApprovalTargetSchema.parse({
      kind: "commerce_quote_approval",
      ...target,
    }),
  ).toEqual({ kind: "commerce_quote_approval", ...target })
})

test("page continuation cannot request unbounded limits or a different actor", () => {
  expect(
    generalPendingQuoteApprovalsInput.parse({ cursor: "decision-10" }),
  ).toEqual({ cursor: "decision-10" })
  for (const field of [
    "limit",
    "tenantId",
    "storeId",
    "actorUserId",
    "includeClinical",
  ]) {
    expect(
      generalPendingQuoteApprovalsInput.safeParse({ [field]: 10000 }).success,
    ).toBe(false)
  }
})
