export type OrderCustomerSelection = {
  id?: string
  name: string
  phone: string | null
  email: string | null
}

export function customerDraftFromSearch(search: string) {
  const value = search.trim()
  const phone = /^\+?[\d\s()-]+$/.test(value) && /\d/.test(value)
  return { name: phone ? "" : value, phone: phone ? value : "" }
}

export function orderCustomerContacts(
  orders: Array<{
    customerName: string | null
    customerPhone: string | null
    customerEmail: string | null
  }>,
): OrderCustomerSelection[] {
  const seen = new Set<string>()
  return orders.flatMap((order) => {
    const name = order.customerName?.trim() ?? ""
    const phone = order.customerPhone?.trim() || null
    const email = order.customerEmail?.trim() || null
    if (!name && !phone && !email) return []
    const key = JSON.stringify([
      name.toLowerCase(),
      phone,
      email?.toLowerCase(),
    ])
    if (seen.has(key)) return []
    seen.add(key)
    return [{ name, phone, email }]
  })
}
