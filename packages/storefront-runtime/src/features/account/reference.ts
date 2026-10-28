import { storefrontRequestReferenceSchema } from "@ewatrade/storefront-contracts/orders"
export function parseReference(value: string) {
  const parsed = storefrontRequestReferenceSchema.safeParse(value.trim())
  return parsed.success
    ? { reference: parsed.data, problem: null }
    : {
        reference: null,
        problem: value.trim()
          ? "Enter the reference from your receipt, like R-7KQ2MX."
          : "Enter your request reference.",
      }
}
