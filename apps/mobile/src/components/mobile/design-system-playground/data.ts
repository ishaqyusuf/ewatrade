import type { IconKeys } from "@/components/ui/icon"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"

export type DesignSystemSectionId =
  | "actions"
  | "analytics"
  | "forms"
  | "headers"
  | "lists"
  | "modals"
  | "navigation"
  | "patterns"
  | "status"
  | "tokens"
  | "typography"

export type DesignSystemCatalogSection = {
  description: string
  icon: IconKeys
  id: DesignSystemSectionId
  title: string
}

export type DesignSystemPatternId =
  | "analytics"
  | "detail"
  | "headers"
  | "list"
  | "retail-ops"

export type DesignSystemPattern = {
  description: string
  icon: IconKeys
  id: DesignSystemPatternId
  title: string
}

export type PlaygroundStatusExample = {
  icon: IconKeys
  label: string
  tone: MobileDesignStatusTone
}

export type PlaygroundMetric = {
  detail: string
  label: string
  tone: "neutral" | "primary" | "success" | "warning"
  value: number
}

export type PlaygroundChartDatum = {
  barClassName: string
  label: string
  toneClassName: string
  value: number
}

export const DESIGN_SYSTEM_CATALOG_SECTIONS: DesignSystemCatalogSection[] = [
  {
    description: "Semantic light and dark color roles for the mobile app.",
    icon: "SlidersHorizontal",
    id: "tokens",
    title: "Tokens",
  },
  {
    description: "Screen titles, totals, section labels, rows, and helpers.",
    icon: "FileText",
    id: "typography",
    title: "Typography",
  },
  {
    description: "Auth, dashboard, sheet, and detail header variants.",
    icon: "LayoutDashboard",
    id: "headers",
    title: "Headers",
  },
  {
    description: "Buttons, icon buttons, loading, disabled, and selected states.",
    icon: "CheckCircle2",
    id: "actions",
    title: "Actions",
  },
  {
    description: "Inputs, search, OTP, toggles, segmented controls, and quantity.",
    icon: "Search",
    id: "forms",
    title: "Forms",
  },
  {
    description: "Product, sale, staff, customer, report, and sync row language.",
    icon: "List",
    id: "lists",
    title: "Lists",
  },
  {
    description: "Badges, banners, empty states, loading, errors, and conflicts.",
    icon: "Info",
    id: "status",
    title: "Status",
  },
  {
    description: "Confirmation modal, destructive modal, and bottom sheets.",
    icon: "AppWindow",
    id: "modals",
    title: "Modals/Sheets",
  },
  {
    description: "Bottom nav, sticky actions, two-action footers, and help copy.",
    icon: "House",
    id: "navigation",
    title: "Navigation/Footers",
  },
  {
    description: "KPI cards, report rows, filters, legends, and bar charts.",
    icon: "BarChart3",
    id: "analytics",
    title: "Analytics",
  },
  {
    description: "Retail Ops previews for sale, stock, staff, links, and sync.",
    icon: "Warehouse",
    id: "patterns",
    title: "Retail Ops Patterns",
  },
]

export const DESIGN_SYSTEM_PATTERNS: DesignSystemPattern[] = [
  {
    description: "A compact operations list with product, staff, and sync rows.",
    icon: "ListChecks",
    id: "list",
    title: "List Pattern",
  },
  {
    description: "Header hierarchy for detail, sheet, and review screens.",
    icon: "LayoutDashboard",
    id: "headers",
    title: "Header Pattern",
  },
  {
    description: "Detail composition with badges, actions, and metadata rows.",
    icon: "FileText",
    id: "detail",
    title: "Detail Pattern",
  },
  {
    description: "Retail Ops component grouping across sales and inventory.",
    icon: "Warehouse",
    id: "retail-ops",
    title: "Retail Ops Pattern",
  },
  {
    description: "Mobile report and bar-chart treatment with operational data.",
    icon: "BarChart3",
    id: "analytics",
    title: "Analytics Pattern",
  },
]

export const PLAYGROUND_STATUS_EXAMPLES: PlaygroundStatusExample[] = [
  { icon: "Info", label: "Default", tone: "default" },
  { icon: "Clock", label: "Pending sync", tone: "warning" },
  { icon: "CheckCircle2", label: "Synced", tone: "success" },
  { icon: "TriangleAlert", label: "Conflict", tone: "destructive" },
  { icon: "Activity", label: "Live", tone: "primary" },
  { icon: "Eye", label: "Muted", tone: "muted" },
]

export const PLAYGROUND_METRICS: PlaygroundMetric[] = [
  {
    detail: "Cash and transfer combined",
    label: "Today sales",
    tone: "success",
    value: 284000,
  },
  {
    detail: "Needs replenishment",
    label: "Low stock",
    tone: "warning",
    value: 6,
  },
  {
    detail: "Open cashier sessions",
    label: "Staff sessions",
    tone: "primary",
    value: 4,
  },
  {
    detail: "Generated product links",
    label: "Link orders",
    tone: "neutral",
    value: 18,
  },
]

export const PLAYGROUND_CHART_DATA: PlaygroundChartDatum[] = [
  {
    barClassName: "h-10",
    label: "Mon",
    toneClassName: "bg-primary",
    value: 42,
  },
  {
    barClassName: "h-16",
    label: "Tue",
    toneClassName: "bg-success",
    value: 68,
  },
  {
    barClassName: "h-12",
    label: "Wed",
    toneClassName: "bg-warn",
    value: 55,
  },
  {
    barClassName: "h-24",
    label: "Thu",
    toneClassName: "bg-primary",
    value: 91,
  },
  {
    barClassName: "h-20",
    label: "Fri",
    toneClassName: "bg-success",
    value: 74,
  },
]

export const PLAYGROUND_SAMPLE_TOTALS = {
  cashTransferSplit: "Cash 58% / Transfer 42%",
  inventoryMovement: "+42 bags received",
  salesToday: "NGN 284,000",
  shareLinkViews: "1,284 views",
  syncConflicts: "2 conflicts",
}
