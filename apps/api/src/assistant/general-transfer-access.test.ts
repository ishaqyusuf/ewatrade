import { expect, test } from "bun:test"
import type { TenantContext } from "@ewatrade/db/tenant-context"
import { assertGeneralTransferAccess } from "./general-transfer-access"

function tenant() {
  return {
    membership: { role: "MANAGER" },
    activeStore: { id: "target" },
    stores: [{ id: "source" }, { id: "target" }],
    staffAccess: {
      businessRole: "MANAGER",
      status: "ACTIVE",
      mode: "SCOPED",
      catalogEditor: false,
      assignments: [
        { storeId: "source", role: "MANAGER", status: "ACTIVE" },
        { storeId: "target", role: "MANAGER", status: "ACTIVE" },
      ],
    },
  } as unknown as TenantContext
}
const receipt = {
  sourceStoreId: "source",
  targetStoreId: "target",
  stage: "receive" as const,
}

test("receipt confirmation belongs to destination; dispatch and cancel to source", () => {
  const ctx = tenant()
  expect(assertGeneralTransferAccess(ctx, receipt)).toBe("target")
  expect(() =>
    assertGeneralTransferAccess(ctx, { ...receipt, stage: "dispatch" }),
  ).toThrow()
  expect(() =>
    assertGeneralTransferAccess(ctx, { ...receipt, stage: "cancel" }),
  ).toThrow()
  ctx.activeStore!.id = "source"
  expect(() => assertGeneralTransferAccess(ctx, receipt)).toThrow()
  expect(
    assertGeneralTransferAccess(ctx, { ...receipt, stage: "dispatch" }),
  ).toBe("source")
  expect(
    assertGeneralTransferAccess(ctx, { ...receipt, stage: "cancel" }),
  ).toBe("source")
})

test("access loss at either Store prevents receipt even if dispatch was authorized", () => {
  for (const storeId of ["source", "target"]) {
    const ctx = tenant()
    expect(assertGeneralTransferAccess(ctx, receipt)).toBe("target")
    ctx.staffAccess = {
      ...ctx.staffAccess!,
      assignments: ctx.staffAccess!.assignments.filter(
        (row) => row.storeId !== storeId,
      ),
    }
    expect(() => assertGeneralTransferAccess(ctx, receipt)).toThrow()
  }
  const ctx = tenant()
  ctx.staffAccess!.status = "REVOKED"
  expect(() => assertGeneralTransferAccess(ctx, receipt)).toThrow()
})

test("foreign Store and role downgrade fail without disclosing a transfer", () => {
  const ctx = tenant()
  expect(() =>
    assertGeneralTransferAccess(ctx, { ...receipt, sourceStoreId: "foreign" }),
  ).toThrow()
  expect(() =>
    assertGeneralTransferAccess(ctx, { ...receipt, sourceStoreId: "target" }),
  ).toThrow()
  ctx.membership.role = "CASHIER"
  expect(() => assertGeneralTransferAccess(ctx, receipt)).toThrow()
})
