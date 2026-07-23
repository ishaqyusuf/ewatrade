import type { IconKeys } from "@/components/ui/icon";
import type { LinkProps } from "expo-router";
import type { ImageSourcePropType } from "react-native";

export const DESIGN_01_ID = "design-01";
export const DESIGN_01_LEGACY_REFERENCE_ID = "home-shell";

export const DESIGN_01_ROUTES = {
  customers: "/design-system/design-01/customers" as LinkProps["href"],
  home: "/design-system/design-01",
  image: "/design-system/design-01/image",
  more: "/design-system/design-01/more" as LinkProps["href"],
  moreImage: "/design-system/design-01/more-image" as LinkProps["href"],
  messages: "/design-system/design-01/messages",
  orders: "/design-system/design-01/orders",
  profile: "/design-system/design-01/profile",
  reference: "/design-system/design-01/reference",
  stock: "/design-system/design-01/stock",
} satisfies Record<string, LinkProps["href"]>;

export function design01CustomerHref(customerId: string) {
  return `/design-system/design-01/customer/${encodeURIComponent(customerId)}` as LinkProps["href"];
}

export function design01OrderHref(orderId: string) {
  return `/design-system/design-01/order/${encodeURIComponent(orderId)}` as LinkProps["href"];
}

export function design01SourceHref(referenceId: string) {
  return `/design-system/design-01/source/${encodeURIComponent(referenceId)}` as LinkProps["href"];
}

export type Design01ReferenceImage = {
  adoption: string[];
  id: string;
  implementationLabel?: string;
  implementationRoute?: LinkProps["href"];
  route: LinkProps["href"];
  source: ImageSourcePropType;
  sourceLabel: string;
  subtitle: string;
  title: string;
};

export const DESIGN_01_PRIMARY_REFERENCE: Design01ReferenceImage = {
  adoption: [
    "Deep contextual header",
    "Integrated search",
    "Operational hero card",
    "Category tiles",
    "Rounded floating navigation",
  ],
  id: DESIGN_01_LEGACY_REFERENCE_ID,
  implementationLabel: "Design 01 home",
  implementationRoute: DESIGN_01_ROUTES.home,
  route: DESIGN_01_ROUTES.image,
  source: require("@assets/images/design-system/reference-home-shell.jpg"),
  sourceLabel: "Pin 2 / home shell reference",
  subtitle: "First approval target before any other reference is implemented.",
  title: "Home Shell Reference",
};

export const DESIGN_01_ADMIN_MORE_REFERENCE: Design01ReferenceImage = {
  adoption: [
    "Four stable admin roots",
    "Raised center create action",
    "Flat divider-based Menu rows",
    "Workspace switcher card",
    "Production App theme access",
  ],
  id: "admin-more-menu",
  implementationLabel: "Menu preview",
  implementationRoute: DESIGN_01_ROUTES.more,
  route: DESIGN_01_ROUTES.moreImage,
  source: require("@assets/images/design-system/reference-admin-more.png"),
  sourceLabel: "Admin Menu / More reference",
  subtitle:
    "Reference for the admin tab dock, Menu hierarchy, and quick-settings access.",
  title: "Admin Menu Reference",
};

export const DESIGN_01_COMMERCE_REFERENCE: Design01ReferenceImage = {
  adoption: [
    "Compact commerce metrics",
    "Search and short date filters",
    "Payment and fulfilment badges",
    "Flat order rows",
    "Clear operational hierarchy",
  ],
  id: "commerce-home-customer-orders",
  implementationLabel: "Orders preview",
  implementationRoute: DESIGN_01_ROUTES.orders,
  route: design01SourceHref("commerce-home-customer-orders"),
  source: require("@design/reference-commerce-home-customer-orders.png"),
  sourceLabel: "Commerce home, customer, and orders board",
  subtitle:
    "Primary visual source for the Orders list and synthesized Order overview.",
  title: "Commerce And Orders Reference",
};

export const DESIGN_01_PRODUCT_FLOW_REFERENCE: Design01ReferenceImage = {
  adoption: [
    "Compact list rhythm",
    "Simple field hierarchy",
    "Focused bottom actions",
    "Reusable selection surfaces",
  ],
  id: "products-create-media",
  route: design01SourceHref("products-create-media"),
  source: require("@design/reference-products-create-media.png"),
  sourceLabel: "Products, create, and media board",
  subtitle:
    "Supporting interaction reference for row density, controls, and action placement.",
  title: "Product Flow Reference",
};

export const DESIGN_01_CUSTOMER_ORDERS_REFERENCE: Design01ReferenceImage = {
  adoption: [
    "Customer identity summary",
    "Order history filters",
    "Compact analytics hierarchy",
    "Profile-to-order navigation",
  ],
  id: "customer-orders-insights",
  implementationLabel: "Customers preview",
  implementationRoute: DESIGN_01_ROUTES.customers,
  route: design01SourceHref("customer-orders-insights"),
  source: require("@design/reference-customer-orders-insights.png"),
  sourceLabel: "Customer orders and insights board",
  subtitle:
    "Reference for customer order history and profile-level commerce context.",
  title: "Customer Orders Reference",
};

export const DESIGN_01_CUSTOMERS_REFERENCE: Design01ReferenceImage = {
  adoption: [
    "Avatar-led customer rows",
    "Search and bounded filters",
    "Contact and address details",
    "Order value and count summary",
  ],
  id: "customers-profile-orders",
  implementationLabel: "Customers preview",
  implementationRoute: DESIGN_01_ROUTES.customers,
  route: design01SourceHref("customers-profile-orders"),
  source: require("@design/reference-customers-profile-orders.png"),
  sourceLabel: "Customers, profile, and orders board",
  subtitle:
    "Primary visual source for Customers and the core Customer overview.",
  title: "Customers And Profile Reference",
};

export const DESIGN_01_CUSTOMER_TABS_REFERENCE: Design01ReferenceImage = {
  adoption: [
    "Stable customer summary",
    "Scrollable profile sections",
    "Review and loyalty hierarchy",
    "Focused contextual actions",
  ],
  id: "customer-wishlist-reviews-loyalty",
  implementationLabel: "Customers preview",
  implementationRoute: DESIGN_01_ROUTES.customers,
  route: design01SourceHref("customer-wishlist-reviews-loyalty"),
  source: require("@design/reference-customer-wishlist-reviews-loyalty.png"),
  sourceLabel: "Customer wishlist, reviews, and loyalty board",
  subtitle:
    "Future-facing customer tab reference; only the approved core profile is implemented now.",
  title: "Extended Customer Reference",
};

export const DESIGN_01_REFERENCE_IMAGES = [
  DESIGN_01_PRIMARY_REFERENCE,
  DESIGN_01_ADMIN_MORE_REFERENCE,
  DESIGN_01_COMMERCE_REFERENCE,
  DESIGN_01_PRODUCT_FLOW_REFERENCE,
  DESIGN_01_CUSTOMER_ORDERS_REFERENCE,
  DESIGN_01_CUSTOMERS_REFERENCE,
  DESIGN_01_CUSTOMER_TABS_REFERENCE,
];

export function getDesign01Reference(referenceId: string) {
  return DESIGN_01_REFERENCE_IMAGES.find(
    (reference) => reference.id === referenceId,
  );
}

export const DESIGN_01_HOME_TAB = {
  href: DESIGN_01_ROUTES.home,
  icon: "House",
  label: "Home",
} satisfies { href: LinkProps["href"]; icon: IconKeys; label: string };

export const DESIGN_01_ORDERS_TAB = {
  href: DESIGN_01_ROUTES.orders,
  icon: "Calendar",
  label: "Orders",
} satisfies { href: LinkProps["href"]; icon: IconKeys; label: string };

export const DESIGN_01_MESSAGES_TAB = {
  href: DESIGN_01_ROUTES.messages,
  icon: "Mail",
  label: "Messages",
} satisfies { href: LinkProps["href"]; icon: IconKeys; label: string };

export const DESIGN_01_PROFILE_TAB = {
  href: DESIGN_01_ROUTES.profile,
  icon: "User",
  label: "Profile",
} satisfies { href: LinkProps["href"]; icon: IconKeys; label: string };
