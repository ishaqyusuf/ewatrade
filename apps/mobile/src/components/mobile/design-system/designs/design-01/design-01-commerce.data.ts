export type Design01PaymentStatus = "Paid" | "Payment due" | "Refunded";
export type Design01FulfilmentStatus =
  "Unfulfilled" | "Preparing" | "Ready for pickup" | "Fulfilled" | "Cancelled";
export type Design01OrderStatus = "Open" | "Completed" | "Cancelled";

export type Design01OrderLine = {
  id: string;
  name: string;
  option: string;
  quantity: number;
  unitPriceMinor: number;
};

export type Design01Order = {
  createdAt: string;
  currencyCode: "NGN";
  customerId: string;
  discountMinor: number;
  fulfilmentStatus: Design01FulfilmentStatus;
  id: string;
  lines: Design01OrderLine[];
  number: string;
  paymentStatus: Design01PaymentStatus;
  status: Design01OrderStatus;
  taxMinor: number;
  timeline: Array<{ detail: string; label: string; time: string }>;
};

export type Design01Customer = {
  address: string;
  category: string;
  email: string;
  id: string;
  initials: string;
  location: string;
  name: string;
  note: string;
  phone: string;
  source: string;
  status: "Active" | "Inactive";
};

export const DESIGN_01_CUSTOMERS: Design01Customer[] = [
  {
    address: "14 Adeola Odeku Street, Victoria Island, Lagos",
    category: "Retail",
    email: "amina@example.com",
    id: "amina-bello",
    initials: "AB",
    location: "Lagos",
    name: "Amina Bello",
    note: "Prefers pickup after 4 PM and WhatsApp order updates.",
    phone: "+234 803 555 0142",
    source: "Online store",
    status: "Active",
  },
  {
    address: "8 Udo Udoma Avenue, Uyo, Akwa Ibom",
    category: "Wholesale",
    email: "chidi@example.com",
    id: "chidi-okafor",
    initials: "CO",
    location: "Uyo",
    name: "Chidi Okafor",
    note: "Usually orders in cartons and pays by bank transfer.",
    phone: "+234 806 555 0198",
    source: "Sales rep",
    status: "Active",
  },
  {
    address: "22 Aminu Kano Crescent, Wuse 2, Abuja",
    category: "Retail",
    email: "zainab@example.com",
    id: "zainab-musa",
    initials: "ZM",
    location: "Abuja",
    name: "Zainab Musa",
    note: "Call before dispatching delivery orders.",
    phone: "+234 809 555 0107",
    source: "Share link",
    status: "Active",
  },
  {
    address: "5 Airport Road, Benin City, Edo",
    category: "Retail",
    email: "tolu@example.com",
    id: "tolu-adeyemi",
    initials: "TA",
    location: "Benin City",
    name: "Tolu Adeyemi",
    note: "No special handling instructions.",
    phone: "+234 705 555 0184",
    source: "In store",
    status: "Inactive",
  },
  {
    address: "31 Aba Road, Port Harcourt, Rivers",
    category: "Business",
    email: "ngozi@example.com",
    id: "ngozi-eze",
    initials: "NE",
    location: "Port Harcourt",
    name: "Ngozi Eze",
    note: "Requests a receipt for every completed order.",
    phone: "+234 812 555 0171",
    source: "Online store",
    status: "Active",
  },
];

export const DESIGN_01_ORDERS: Design01Order[] = [
  {
    createdAt: "2026-07-22T09:20:00.000Z",
    currencyCode: "NGN",
    customerId: "amina-bello",
    discountMinor: 500000,
    fulfilmentStatus: "Unfulfilled",
    id: "order-12567",
    lines: [
      {
        id: "line-1",
        name: "Premium body lotion",
        option: "500 ml · 2 units",
        quantity: 2,
        unitPriceMinor: 3650000,
      },
      {
        id: "line-2",
        name: "Travel skincare set",
        option: "Vanilla · 1 set",
        quantity: 1,
        unitPriceMinor: 1840000,
      },
    ],
    number: "Order-12567",
    paymentStatus: "Paid",
    status: "Open",
    taxMinor: 450000,
    timeline: [
      {
        detail: "Order created from the online store.",
        label: "Order received",
        time: "9:20 AM",
      },
      {
        detail: "Bank transfer confirmed by A. Ibrahim.",
        label: "Payment recorded",
        time: "9:28 AM",
      },
    ],
  },
  {
    createdAt: "2026-07-21T13:45:00.000Z",
    currencyCode: "NGN",
    customerId: "chidi-okafor",
    discountMinor: 0,
    fulfilmentStatus: "Preparing",
    id: "order-12566",
    lines: [
      {
        id: "line-3",
        name: "Cosmos standing fan",
        option: "Black · 3 cartons",
        quantity: 3,
        unitPriceMinor: 6800000,
      },
    ],
    number: "Order-12566",
    paymentStatus: "Paid",
    status: "Open",
    taxMinor: 0,
    timeline: [
      {
        detail: "Recorded by the sales team.",
        label: "Order received",
        time: "Yesterday",
      },
      {
        detail: "Items are being prepared for pickup.",
        label: "Fulfilment started",
        time: "Today",
      },
    ],
  },
  {
    createdAt: "2026-07-20T16:15:00.000Z",
    currencyCode: "NGN",
    customerId: "zainab-musa",
    discountMinor: 0,
    fulfilmentStatus: "Cancelled",
    id: "order-12565",
    lines: [
      {
        id: "line-4",
        name: "Air condenser portable",
        option: "White · 1 unit",
        quantity: 1,
        unitPriceMinor: 10800000,
      },
    ],
    number: "Order-12565",
    paymentStatus: "Refunded",
    status: "Cancelled",
    taxMinor: 0,
    timeline: [
      {
        detail: "Created from a shared product link.",
        label: "Order received",
        time: "20 Jul",
      },
      {
        detail: "Customer requested cancellation before dispatch.",
        label: "Order cancelled",
        time: "20 Jul",
      },
    ],
  },
  {
    createdAt: "2026-07-18T11:05:00.000Z",
    currencyCode: "NGN",
    customerId: "amina-bello",
    discountMinor: 0,
    fulfilmentStatus: "Fulfilled",
    id: "order-12564",
    lines: [
      {
        id: "line-5",
        name: "Hair care bundle",
        option: "Complete set",
        quantity: 1,
        unitPriceMinor: 5679800,
      },
    ],
    number: "Order-12564",
    paymentStatus: "Paid",
    status: "Completed",
    taxMinor: 0,
    timeline: [
      {
        detail: "Recorded at the Victoria Island store.",
        label: "Order received",
        time: "18 Jul",
      },
      {
        detail: "Customer collected the complete order.",
        label: "Order completed",
        time: "18 Jul",
      },
    ],
  },
  {
    createdAt: "2026-07-15T08:40:00.000Z",
    currencyCode: "NGN",
    customerId: "ngozi-eze",
    discountMinor: 250000,
    fulfilmentStatus: "Ready for pickup",
    id: "order-12563",
    lines: [
      {
        id: "line-6",
        name: "Retail starter bundle",
        option: "Assorted · 4 packs",
        quantity: 4,
        unitPriceMinor: 2400000,
      },
    ],
    number: "Order-12563",
    paymentStatus: "Payment due",
    status: "Open",
    taxMinor: 0,
    timeline: [
      {
        detail: "Created by the Port Harcourt sales rep.",
        label: "Order received",
        time: "15 Jul",
      },
      {
        detail: "Items have been packed and set aside.",
        label: "Ready for pickup",
        time: "Today",
      },
    ],
  },
];

export function getDesign01Customer(customerId: string) {
  return DESIGN_01_CUSTOMERS.find((customer) => customer.id === customerId);
}

export function getDesign01Order(orderId: string) {
  return DESIGN_01_ORDERS.find((order) => order.id === orderId);
}

export function getDesign01CustomerOrders(customerId: string) {
  return DESIGN_01_ORDERS.filter((order) => order.customerId === customerId);
}

export function getDesign01OrderSubtotal(order: Design01Order) {
  return order.lines.reduce(
    (total, line) => total + line.quantity * line.unitPriceMinor,
    0,
  );
}

export function getDesign01OrderTotal(order: Design01Order) {
  return getDesign01OrderSubtotal(order) - order.discountMinor + order.taxMinor;
}

export function getDesign01CustomerValue(customerId: string) {
  return getDesign01CustomerOrders(customerId)
    .filter((order) => order.status !== "Cancelled")
    .reduce((total, order) => total + getDesign01OrderTotal(order), 0);
}
