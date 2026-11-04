import { useAuthContext } from "@/hooks/use-auth"
import { businessCountryCode } from "@/lib/business-country"
import { useBusinessStore } from "@/store/businessStore"
import { useTRPC } from "@/trpc/client"
import { useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import type { CommerceCustomer } from "../commerce/commerce-model"
import {
  type SelectedCustomer,
  customerFromSuggestion,
} from "./create-sale-model"
import {
  phoneContactsAvailable,
  pickPhoneContact,
} from "./phone-contact-picker"
import {
  type ContactPhoneOption,
  contactDisplayName,
  contactPhoneOptions,
  findCustomerByPhone,
  phoneSearchDigits,
} from "./sale-contact-pick"
import { buildSaleCustomerSuggestions } from "./sale-customer-suggestions"

export type SaleContactNumberChoice = {
  name: string
  options: Array<ContactPhoneOption & { savedName?: string }>
}

export type SaleContactNotice =
  | { kind: "match"; contactName: string; customer: SelectedCustomer }
  | { kind: "denied" }
  | { kind: "failed" }

/**
 * New sale's "Contacts" tile: pick a phone contact, then select the customer
 * who already has that number or open Add customer filled with it.
 */
export function useSaleContactPick({
  customers,
  isLocked,
  isOffline,
  onMatch,
  onNew,
}: {
  customers: CommerceCustomer[]
  isLocked: () => boolean
  isOffline: boolean
  onMatch: (customer: SelectedCustomer) => void
  onNew: (contact: { name: string; phone: string }) => void
}) {
  const { profile } = useAuthContext()
  const businessCountry = useBusinessStore(
    (s) => s.businesses.find((b) => b.id === profile?.businessId)?.country,
  )
  // Local numbers in a contact are read in the business's own country.
  const countryCode = businessCountryCode(profile?.countryCode, businessCountry)
  // Scoped staff don't read the business-wide Customer directory.
  const scopedStaff =
    profile?.staffAccessMode === "SCOPED" &&
    !["OWNER", "ADMIN"].includes(profile?.role?.toUpperCase() ?? "")
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [numberChoice, setNumberChoice] =
    useState<SaleContactNumberChoice | null>(null)
  const [notice, setNotice] = useState<SaleContactNotice | null>(null)
  const busy = useRef(false)

  // Loaded rows first; online, the saved directory and past sales are asked
  // too. A failed lookup falls through: saving still refuses a duplicate.
  async function findExisting(phone: string) {
    const loaded = findCustomerByPhone(customers, phone, countryCode)
    const query = phoneSearchDigits(phone)
    if (loaded || isOffline || !query) return loaded
    try {
      const [orders, directory] = await Promise.all([
        queryClient.fetchQuery(
          trpc.orders.listPage.queryOptions({
            limit: 20,
            query,
            queryMode: "customer",
          }),
        ),
        scopedStaff
          ? Promise.resolve({ items: [] })
          : queryClient.fetchQuery(
              trpc.customers.listPage.queryOptions({ limit: 20, query }),
            ),
      ])
      return findCustomerByPhone(
        buildSaleCustomerSuggestions(orders.items, directory.items),
        phone,
        countryCode,
      )
    } catch {
      return undefined
    }
  }

  async function applyNumber(name: string, phone: string) {
    const existing = await findExisting(phone)
    if (isLocked()) return
    if (existing) {
      const customer = customerFromSuggestion(existing)
      onMatch(customer)
      setNotice({ kind: "match", contactName: name, customer })
      return
    }
    onNew({ name, phone })
  }

  async function pick() {
    if (busy.current || isLocked()) return
    busy.current = true
    setNotice(null)
    try {
      const result = await pickPhoneContact()
      if (result.status === "denied") {
        setNotice({ kind: "denied" })
        return
      }
      if (result.status !== "picked") return
      const name = contactDisplayName(result.contact)
      const options = contactPhoneOptions(result.contact, countryCode)
      if (options.length > 1) {
        setNumberChoice({
          name,
          options: options.map((option) => ({
            ...option,
            savedName: findCustomerByPhone(customers, option.phone, countryCode)
              ?.name,
          })),
        })
        return
      }
      await applyNumber(name, options[0]?.phone ?? "")
    } catch {
      setNotice({ kind: "failed" })
    } finally {
      busy.current = false
    }
  }

  async function chooseNumber(phone: string) {
    const choice = numberChoice
    setNumberChoice(null)
    if (!choice || busy.current) return
    busy.current = true
    try {
      await applyNumber(choice.name, phone)
    } finally {
      busy.current = false
    }
  }

  return {
    available: phoneContactsAvailable,
    chooseNumber,
    closeNumberChoice: () => setNumberChoice(null),
    dismissNotice: () => setNotice(null),
    notice,
    numberChoice,
    pick,
  }
}
