import { PRODUCTS } from "@/data/products-data";
import type { Order } from "@/types/order-types";

export const ORDERS: Order[] = [
  {
    id: "1",
    item: "Sale #1001",
    details: "2 bags of Starter Poultry Feed paid by cash",
    status: "Completed",
    slug: "sale-1001",
    date: "2026-07-10",
    items: PRODUCTS.slice(0, 1),
  },
  {
    id: "2",
    item: "Sale #1002",
    details: "1 bag of Grower Feed paid by transfer",
    status: "Synced",
    slug: "sale-1002",
    date: "2026-07-10",
    items: PRODUCTS.slice(1, 2),
  },
  {
    id: "3",
    item: "Sale #1003",
    details: "Quarter bag stock sale pending sync",
    status: "Pending",
    slug: "sale-1003",
    date: "2026-07-10",
    items: PRODUCTS.slice(2, 3),
  },
];
