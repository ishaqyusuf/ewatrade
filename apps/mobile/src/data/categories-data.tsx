import { PRODUCTS } from "@/data/products-data";
import type { Category } from "@/types/category-types";

export const CATEGORIES: Category[] = [
  {
    name: "Feed",
    slug: "feed",
    products: PRODUCTS.filter((product) => product.category.slug === "feed"),
  },
  {
    name: "Raw Material",
    slug: "raw-material",
    products: PRODUCTS.filter(
      (product) => product.category.slug === "raw-material",
    ),
  },
  {
    name: "Supplement",
    slug: "supplement",
    products: PRODUCTS.filter(
      (product) => product.category.slug === "supplement",
    ),
  },
];
