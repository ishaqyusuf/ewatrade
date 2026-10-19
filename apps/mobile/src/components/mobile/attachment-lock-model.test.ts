import { expect, test } from "bun:test"
import { attachmentEntitlementFrom } from "./attachment-lock-model"

const base = {
  fresh: true,
  failed: false,
  ownerMatches: true,
  role: "OWNER",
}

test("paid plans allow attachments; Free locks them", () => {
  for (const planId of ["starter", "growth", "pro"])
    expect(attachmentEntitlementFrom({ ...base, planId })).toEqual({
      status: "allowed",
    })
  expect(attachmentEntitlementFrom({ ...base, planId: "free" })).toEqual({
    status: "locked",
    canSeePlans: true,
  })
})

test("only owners and admins are offered plan information", () => {
  expect(
    attachmentEntitlementFrom({ ...base, planId: "free", role: "admin" }),
  ).toEqual({ status: "locked", canSeePlans: true })
  for (const role of ["MANAGER", "CASHIER", undefined])
    expect(
      attachmentEntitlementFrom({ ...base, planId: "free", role }),
    ).toEqual({ status: "locked", canSeePlans: false })
})

test("never assumes Free or a default plan while unconfirmed", () => {
  expect(
    attachmentEntitlementFrom({ ...base, fresh: false, planId: "free" }),
  ).toEqual({ status: "checking" })
  expect(
    attachmentEntitlementFrom({ ...base, ownerMatches: false, planId: "pro" }),
  ).toEqual({ status: "checking" })
  expect(
    attachmentEntitlementFrom({ ...base, failed: true, planId: "pro" }),
  ).toEqual({ status: "unknown" })
  for (const planId of [undefined, null, "enterprise"])
    expect(attachmentEntitlementFrom({ ...base, planId })).toEqual({
      status: "unknown",
    })
})
