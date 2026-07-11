export type ProductCategory = {
  imageUrl?: unknown;
  name: string;
  slug: string;
};

export type Product = {
  category: ProductCategory;
  heroImage?: unknown;
  id: number;
  imagesUrl: unknown[];
  maxQuantity: number;
  price: number;
  slug: string;
  title: string;
};
