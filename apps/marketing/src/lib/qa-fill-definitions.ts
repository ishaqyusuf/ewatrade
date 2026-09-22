import { normalizeOperatingCurrencyCode } from "@ewatrade/utils"
import {
  createQaBusinessFixture,
  createQaStaffFixture,
} from "@ewatrade/utils/qa-quick-fill"
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
  return {
    addressLine1: business.addressLine1,
    businessName: business.businessName,
    businessProfileKey: "general-retail-groceries",
    businessProfileVersion: 1,
    businessSize: "2_5",
    city: business.city,
    countryCode: "NG",
    currencyCode: normalizeOperatingCurrencyCode(business.currencyCode),
    operatingModel: "products",
    orderChannels: ["walk_in"],
    otherBusinessDescription: "",
    phone: business.phone,
    region: "Lagos",
  }
}

export const ownerFill = (
  context: Parameters<typeof createQaStaffFixture>[0],
  sequence: number,
): Partial<OwnerValues> => {
  const owner = createQaStaffFixture(context, sequence)
  return {
    email: owner.email,
    firstName: owner.firstName,
    lastName: owner.lastName,
  }
}
