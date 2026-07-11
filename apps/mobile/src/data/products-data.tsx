import type { Product } from "@/types/product-types";

export const PRODUCTS: Product[] = [
  {
    id: 1,
    title: "Starter Poultry Feed",
    slug: "starter-poultry-feed",
    imagesUrl: [],
    price: 18500,
    category: {
      name: "Feed",
      slug: "feed",
    },
    maxQuantity: 42,
  },
  {
    id: 2,
    title: "Grower Feed",
    slug: "grower-feed",
    imagesUrl: [],
    price: 17800,
    category: {
      name: "Feed",
      slug: "feed",
    },
    maxQuantity: 36,
  },
  {
    id: 3,
    title: "Layer Mash",
    slug: "layer-mash",
    imagesUrl: [],
    price: 19200,
    category: {
      name: "Feed",
      slug: "feed",
    },
    maxQuantity: 18,
  },
  {
    id: 4,
    title: "Maize Bran",
    slug: "maize-bran",
    imagesUrl: [],
    price: 9600,
    category: {
      name: "Raw Material",
      slug: "raw-material",
    },
    maxQuantity: 8,
  },
  {
    id: 5,
    title: "Vitamin Premix",
    slug: "vitamin-premix",
    imagesUrl: [],
    price: 3200,
    category: {
      name: "Supplement",
      slug: "supplement",
    },
    maxQuantity: 15,
  },
];
