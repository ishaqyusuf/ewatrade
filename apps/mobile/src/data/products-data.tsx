import type { Product } from "@/types/product-types"

export const PRODUCTS: Product[] = [
  {
    id: 1,
    title: "Rice",
    slug: "rice",
    imagesUrl: [],
    price: 18500,
    category: {
      name: "Staple Goods",
      slug: "staple-goods",
    },
    maxQuantity: 42,
  },
  {
    id: 2,
    title: "Beans",
    slug: "beans",
    imagesUrl: [],
    price: 17800,
    category: {
      name: "Staple Goods",
      slug: "staple-goods",
    },
    maxQuantity: 36,
  },
  {
    id: 3,
    title: "Garri",
    slug: "garri",
    imagesUrl: [],
    price: 19200,
    category: {
      name: "Staple Goods",
      slug: "staple-goods",
    },
    maxQuantity: 18,
  },
  {
    id: 4,
    title: "Palm Oil",
    slug: "palm-oil",
    imagesUrl: [],
    price: 9600,
    category: {
      name: "Cooking Essentials",
      slug: "cooking-essentials",
    },
    maxQuantity: 8,
  },
  {
    id: 5,
    title: "Cooking Gas",
    slug: "cooking-gas",
    imagesUrl: [],
    price: 3200,
    category: {
      name: "Household Supplies",
      slug: "household-supplies",
    },
    maxQuantity: 15,
  },
]
