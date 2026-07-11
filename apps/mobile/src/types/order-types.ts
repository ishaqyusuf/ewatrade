import type { Product } from "./product-types";

export type OrderStatus = "Pending" | "Completed" | "Synced";

export type Order = {
  date: string;
  details: string;
  id: string;
  item: string;
  items: Product[];
  slug: string;
  status: OrderStatus;
};
