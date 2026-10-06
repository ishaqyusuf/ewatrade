import { normalizeOperatingCurrencyCode } from "@ewatrade/utils"
import {
  createQaBusinessFixture,
  createQaStaffFixture,
} from "@ewatrade/utils/qa-quick-fill"
import { createReadableQaEmail } from "./qa-readable-email"
import { createQaSignupPhone } from "./qa-signup-phone"
import type {
  BusinessValues,
  OwnerValues,
  WorkspaceValues,
} from "./signup-schemas"

export const workspaceFill = (
  _context: Parameters<typeof createQaBusinessFixture>[0],
  sequence: number,
): Partial<WorkspaceValues> => ({
  subdomain: `qa-workspace-${Date.now().toString().slice(-5)}-${sequence}`,
})

export const businessFill = (
  context: Parameters<typeof createQaBusinessFixture>[0],
  sequence: number,
): Partial<BusinessValues> => {
  const business = createQaBusinessFixture(context, sequence)
  const phone = createQaSignupPhone(business.phone)
  // Business identity is already provided by entry or manual input; never fill it.
  return {
    addressLine1: business.addressLine1,
    businessProfileKey: "general-retail-groceries",
    businessProfileVersion: 1,
    businessSize: "2_5",
    city: business.city,
    countryCode: phone.countryCode,
    currencyCode: normalizeOperatingCurrencyCode(business.currencyCode),
    operatingModel: "products",
    orderChannels: ["walk_in"],
    otherBusinessDescription: "",
    phone: phone.phone,
    region: "Lagos",
  }
}

export const ownerFill = (
  context: Parameters<typeof createQaStaffFixture>[0],
  sequence: number,
  approvedEmail?: string,
): Partial<OwnerValues> => {
  const owner = createQaStaffFixture(context, sequence)
  return {
    email: approvedEmail || createReadableQaEmail(context, owner, sequence),
    firstName: owner.firstName,
    lastName: owner.lastName,
  }
}
