/** Words that mark a customer record as a business, not a person. */
const businessWords = new Set([
  "bakery",
  "co",
  "company",
  "enterprise",
  "enterprises",
  "farm",
  "farms",
  "global",
  "group",
  "hotel",
  "inc",
  "industries",
  "international",
  "limited",
  "ltd",
  "nig",
  "pharmacy",
  "plc",
  "restaurant",
  "services",
  "shop",
  "store",
  "stores",
  "supermarket",
  "trading",
  "ventures",
])

const personWord = /^\p{L}[\p{L}\p{M}'’.-]*$/u

/**
 * The person's first name for a greeting, or undefined when the name's first
 * word isn't one (a code such as "QA-1103" or "QA", a number, or a business
 * name). Callers then greet without a name.
 */
export function customerFirstName(name: string | null | undefined) {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? []
  const first = words[0]
  if (!first || !personWord.test(first)) return undefined
  // An all-capitals first word before a mixed-case name is a code ("QA Ada").
  const isCode =
    first.length > 1 &&
    first === first.toUpperCase() &&
    words.slice(1).some((word) => word !== word.toUpperCase())
  if (isCode) return undefined
  const isBusiness = words.some((word) =>
    businessWords.has(word.toLowerCase().replace(/[.,]/g, "")),
  )
  return isBusiness ? undefined : first
}
