export type CartItemType = {
  id: number;
  price: number;
  quantity: number;
  title: string;
};

export type CartState = {
  addItem: (item: CartItemType) => void;
  decrementItem: (id: number) => void;
  getItemCount: () => number;
  getTotalPrice: () => string;
  incrementItem: (id: number) => void;
  items: CartItemType[];
  removeItem: (id: number) => void;
};
