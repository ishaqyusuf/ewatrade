import type { IconKeys } from "@/components/ui/icon"
import type { LinkProps } from "expo-router"
import type { ImageSourcePropType } from "react-native"

export const DESIGN_01_ID = "design-01"
export const DESIGN_01_LEGACY_REFERENCE_ID = "home-shell"

export const DESIGN_01_ROUTES = {
  home: "/design-system/design-01",
  image: "/design-system/design-01/image",
  messages: "/design-system/design-01/messages",
  orders: "/design-system/design-01/orders",
  profile: "/design-system/design-01/profile",
  reference: "/design-system/design-01/reference",
  stock: "/design-system/design-01/stock",
} satisfies Record<string, LinkProps["href"]>

export type Design01ReferenceImage = {
  adoption: string[]
  id: string
  route: LinkProps["href"]
  source: ImageSourcePropType
  sourceLabel: string
  subtitle: string
  title: string
}

export const DESIGN_01_PRIMARY_REFERENCE: Design01ReferenceImage = {
  adoption: [
    "Deep contextual header",
    "Integrated search",
    "Operational hero card",
    "Category tiles",
    "Rounded floating navigation",
  ],
  id: DESIGN_01_LEGACY_REFERENCE_ID,
  route: DESIGN_01_ROUTES.reference,
  source: require("@assets/images/design-system/reference-home-shell.jpg"),
  sourceLabel: "Pin 2 / home shell reference",
  subtitle: "First approval target before any other reference is implemented.",
  title: "Home Shell Reference",
}

export const DESIGN_01_REFERENCE_IMAGES = [DESIGN_01_PRIMARY_REFERENCE]

export const DESIGN_01_HOME_TAB = {
  href: DESIGN_01_ROUTES.home,
  icon: "House",
  label: "Home",
} satisfies { href: LinkProps["href"]; icon: IconKeys; label: string }

export const DESIGN_01_ORDERS_TAB = {
  href: DESIGN_01_ROUTES.orders,
  icon: "Calendar",
  label: "Orders",
} satisfies { href: LinkProps["href"]; icon: IconKeys; label: string }

export const DESIGN_01_MESSAGES_TAB = {
  href: DESIGN_01_ROUTES.messages,
  icon: "Mail",
  label: "Messages",
} satisfies { href: LinkProps["href"]; icon: IconKeys; label: string }

export const DESIGN_01_PROFILE_TAB = {
  href: DESIGN_01_ROUTES.profile,
  icon: "User",
  label: "Profile",
} satisfies { href: LinkProps["href"]; icon: IconKeys; label: string }
