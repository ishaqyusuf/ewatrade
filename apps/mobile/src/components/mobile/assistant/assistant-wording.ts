/** Exact system titles only: never rewrite names, chat messages or review facts. */
const MOBILE_SYSTEM_TITLES: Record<string, string> = {
  "Add a product": "Add an item",
  "Read a product and its prices": "Read an item and its prices",
  "Update a product price": "Update an item price",
  "Update product details": "Update item details",
  "Return a fulfilled product line": "Return a fulfilled goods line",
  "Fulfil a reserved product line": "Fulfil a reserved goods line",
  "Fulfil remaining product and catalog-free lines":
    "Fulfil remaining goods and catalog-free lines",
  "Product added": "Item added",
  "Product price updated": "Item price updated",
  "Product details updated": "Item details updated",
  "Product identifiers updated": "Item identifiers updated",
  "Product fulfilment recorded": "Goods fulfilment recorded",
  "Product return recorded": "Goods return recorded",
}

export function mobileAssistantSystemTitle(title: string) {
  return Object.hasOwn(MOBILE_SYSTEM_TITLES, title)
    ? (MOBILE_SYSTEM_TITLES[title] ?? title)
    : title
}
