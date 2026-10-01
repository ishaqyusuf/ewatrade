import { z } from "zod"

const storeProductSchema = z
  .object({
    store: z.enum(["app_store", "play_store"]),
    productId: z.string().min(1).max(200).regex(/^\S+$/u),
    planId: z.enum(["starter", "growth", "pro"]),
  })
  .strict()

export function getStoreProducts(
  source = process.env.STORE_SUBSCRIPTION_PRODUCTS,
) {
  const products = z
    .array(storeProductSchema)
    .max(30)
    .parse(JSON.parse(source || "[]"))
  const identities = new Set(
    products.map((product) => `${product.store}:${product.productId}`),
  )
  if (identities.size !== products.length)
    throw new Error("Duplicate store product mapping.")
  return products
}

export function resolveStorePlan(
  store: "app_store" | "play_store",
  productId: string,
) {
  const product = getStoreProducts().find(
    (item) => item.store === store && item.productId === productId,
  )
  if (!product)
    throw new Error("This product is not an enabled EwaTrade subscription.")
  return product.planId
}
