type Business = {
  key: string
  label: string
  name: string
  city: string
  lines: string[]
  items: [string, string, number, string][]
}
type Order = {
  id: number
  who: string
  ini: string
  tone: string
  meta: string
  amt: number
  pill: [string, string]
}
type SampleData = {
  business: { name: string; city: string; owner: string; initials: string }
  today: { sales: number; orders: number; owed: number; cash: number }
  sale: {
    item: string
    qty: number
    price: number
    customer: string
    id: number
  }
  stock: { eggs: number }
  orders: Order[]
  businesses: [Business, ...Business[]]
  businessTypes: [string, string][]
}
export const data: SampleData = {
  business: {
    name: "Mama Bisi Farms",
    city: "Ibadan",
    owner: "Bisi",
    initials: "MB",
  },
  today: { sales: 184500, orders: 23, owed: 42000, cash: 126000 },
  sale: {
    item: "Crate of eggs",
    qty: 2,
    price: 5500,
    customer: "Tunde Bakare",
    id: 1049,
  },
  stock: { eggs: 120 },
  orders: [
    {
      id: 1048,
      who: "Amara Okeke",
      ini: "AO",
      tone: "t-lilac",
      meta: "2 items · 9:42",
      amt: 16000,
      pill: ["Paid", "t-mint"],
    },
    {
      id: 1047,
      who: "Kunle Adeyemi",
      ini: "KA",
      tone: "t-sky",
      meta: "4 items · 9:15",
      amt: 29000,
      pill: ["Owes ₦9,000", "t-amber"],
    },
    {
      id: 1046,
      who: "Walk-in",
      ini: "WI",
      tone: "t-mint",
      meta: "1 item · 8:51",
      amt: 8000,
      pill: ["Paid", "t-mint"],
    },
  ],
  businesses: [
    {
      key: "poultry",
      label: "Poultry & feed",
      name: "Mama Bisi Farms",
      city: "Ibadan",
      lines: [
        "Crate of eggs, 5500, 120 crates",
        "Live broiler, 8000, 40 birds",
      ],
      items: [
        ["Crate of eggs", "Product", 5500, "120 crates"],
        ["Live broiler", "Product", 8000, "40 birds"],
      ],
    },
    {
      key: "pharmacy",
      label: "Pharmacy",
      name: "Kano Care Pharmacy",
      city: "Kano",
      lines: [
        "ORS sachet, 350, 80 sachets",
        "Hand sanitiser, 1500, 25 bottles",
      ],
      items: [
        ["ORS sachet", "Product", 350, "80 sachets"],
        ["Hand sanitiser", "Product", 1500, "25 bottles"],
      ],
    },
    {
      key: "boutique",
      label: "Boutique",
      name: "Adaeze Styles",
      city: "Enugu",
      lines: [
        "Ankara gown Small Blue, 15000, 5 pieces",
        "Ankara gown Medium Green, 15000, 5 pieces",
      ],
      items: [
        ["Ankara gown Small Blue", "Product", 15000, "5 pieces"],
        ["Ankara gown Medium Green", "Product", 15000, "5 pieces"],
      ],
    },
    {
      key: "laundry",
      label: "Laundry",
      name: "FreshPress Laundry",
      city: "Abuja",
      lines: [
        "Shirt wash and iron service, 1000",
        "Suit dry clean service, 4500",
      ],
      items: [
        ["Shirt wash and iron", "Service", 1000, "Service"],
        ["Suit dry clean", "Service", 4500, "Service"],
      ],
    },
    {
      key: "bakery",
      label: "Bakery",
      name: "Sweet Crumbs Bakery",
      city: "Lagos",
      lines: ["Family bread, 1800, 30 loaves", "Cupcake box, 3600, 12 boxes"],
      items: [
        ["Family bread", "Product", 1800, "30 loaves"],
        ["Cupcake box", "Product", 3600, "12 boxes"],
      ],
    },
  ],
  businessTypes: [
    ["poultry", "Poultry & feed"],
    ["pharmacy", "Pharmacy"],
    ["boutique", "Fashion & boutique"],
    ["laundry", "Laundry & cleaning"],
    ["bakery", "Bakery & food"],
    ["other", "Something else"],
  ],
}

export const money = (value: number | string) =>
  `₦${Math.round(Number(value)).toLocaleString("en-NG")}`
export type SampleBusiness = (typeof data.businesses)[number]
export type SampleOrder = (typeof data.orders)[number]
