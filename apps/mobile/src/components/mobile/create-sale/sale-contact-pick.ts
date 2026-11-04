import { getCountry, toInternationalPhone } from "@ewatrade/utils/countries"
import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js"
import type { CommerceCustomer } from "../commerce/commerce-model"

/** The fields New sale reads from a picked phone contact. */
export type PhoneContact = {
  company?: string | null
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  phoneNumbers?: Array<{
    isPrimary?: boolean | null
    label?: string | null
    number?: string | null
  }> | null
}

export type ContactPhoneOption = { label: string; phone: string }

/**
 * A contact number as an international number, reading a local entry such as
 * 0803 555 0142 in the business country. Empty when it has no digits.
 */
export function normalizeContactPhone(
  value: string | null | undefined,
  countryCode: string,
) {
  const raw = String(value ?? "").trim()
  if (!/\d/.test(raw)) return ""
  const parsed = parsePhoneNumberFromString(raw, countryCode as CountryCode)
  if (parsed?.isPossible()) return parsed.number
  return toInternationalPhone(getCountry(countryCode).dialCode, raw)
}

/** +234 803 555 0142, or the number as given when it can't be read. */
export function formatContactPhone(phone: string) {
  return parsePhoneNumberFromString(phone)?.formatInternational() ?? phone
}

/** National digits a stored number contains however it was typed. */
export function phoneSearchDigits(phone: string) {
  return parsePhoneNumberFromString(phone)?.nationalNumber ?? ""
}

export function contactDisplayName(contact: PhoneContact) {
  const name =
    contact.name?.trim() ||
    [contact.firstName, contact.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ") ||
    contact.company?.trim() ||
    ""
  return name.slice(0, 160)
}

/** Distinct numbers on a contact, primary first, each labelled once. */
export function contactPhoneOptions(
  contact: PhoneContact,
  countryCode: string,
): ContactPhoneOption[] {
  const numbers = [...(contact.phoneNumbers ?? [])].sort(
    (a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)),
  )
  const options: ContactPhoneOption[] = []
  for (const entry of numbers) {
    const phone = normalizeContactPhone(entry.number, countryCode)
    if (!phone || options.some((option) => option.phone === phone)) continue
    options.push({ label: phoneLabel(entry.label), phone })
  }
  return options
}

function phoneLabel(label: string | null | undefined) {
  const value = label?.trim().replace(/^_\$!<(.+)>!\$_$/, "$1") ?? ""
  if (!value) return "Phone"
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * The customer who already has this number: a saved Customer before a
 * previous-sale contact, so picking a contact never makes a duplicate.
 */
export function findCustomerByPhone(
  customers: CommerceCustomer[],
  phone: string,
  countryCode: string,
) {
  if (!phone) return undefined
  const matches = customers.filter(
    (customer) => normalizeContactPhone(customer.phone, countryCode) === phone,
  )
  return matches.find((customer) => customer.directoryId) ?? matches[0]
}
