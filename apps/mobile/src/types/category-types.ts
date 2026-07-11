import type { Product } from "./product-types";

export type Category = {
  imageUrl?: unknown;
  name: string;
  products: Product[];
  slug: string;
};
