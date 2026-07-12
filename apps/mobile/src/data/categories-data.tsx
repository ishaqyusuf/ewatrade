import { PRODUCTS } from "@/data/products-data"
import type { Category } from "@/types/category-types"

export const CATEGORIES: Category[] = [
  {
    name: "Staple Goods",
    slug: "staple-goods",
    products: PRODUCTS.filter(
      (product) => product.category.slug === "staple-goods",
    ),
  },
  {
    name: "Cooking Essentials",
    slug: "cooking-essentials",
    products: PRODUCTS.filter(
      (product) => product.category.slug === "cooking-essentials",
    ),
  },
  {
    name: "Household Supplies",
    slug: "household-supplies",
    products: PRODUCTS.filter(
      (product) => product.category.slug === "household-supplies",
    ),
  },
]
