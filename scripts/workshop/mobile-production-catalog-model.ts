import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BarcodeScanIcon,
  Camera,
  Check,
  CheckmarkSquare01Icon,
  ClipboardList,
  Download01Icon,
  EyeIcon,
  Image01Icon,
  LayoutGrid,
  PackageIcon,
  Plus,
  Search,
  Share,
  SparklesIcon,
  Tag01Icon,
  Upload01Icon,
  ViewOffIcon,
  Warehouse,
  Wind,
  Wrench,
  X,
} from "@hugeicons/core-free-icons"
import type { CatalogRow } from "../../apps/mobile/src/components/mobile/catalog/catalog-presentation"
import {
  catalogAvatarTint,
  catalogCountLabel,
  catalogShelfCounts,
  catalogShelfTitle,
  filterCatalogShelf,
  sortCatalogRows,
} from "../../apps/mobile/src/components/mobile/catalog/catalog-shelf-model"
import { shouldShowListSearch } from "../../apps/mobile/src/lib/list-pagination"
import { THEME, themeColorVars } from "../../apps/mobile/src/lib/theme-palette"
import { catalogAiAllowanceLabel } from "../../packages/utils/src/catalog-ai-images"
import { getCatalogIllustrationSvg } from "../../packages/utils/src/catalog-illustration-artwork"
import {
  productUsageDescriptions,
  productUsageLabels,
} from "../../packages/utils/src/product-usage"

const drawings = {
  alert: AlertTriangle,
  arrow: ArrowLeft,
  back: ArrowLeft01Icon,
  next: ArrowRight01Icon,
  barcode: BarcodeScanIcon,
  camera: Camera,
  check: Check,
  checkSquare: CheckmarkSquare01Icon,
  clipboard: ClipboardList,
  download: Download01Icon,
  eye: EyeIcon,
  image: Image01Icon,
  grid: LayoutGrid,
  package: PackageIcon,
  plus: Plus,
  search: Search,
  share: Share,
  sparkles: SparklesIcon,
  tag: Tag01Icon,
  upload: Upload01Icon,
  hidden: ViewOffIcon,
  warehouse: Warehouse,
  wind: Wind,
  wrench: Wrench,
  close: X,
}
const svgAttributes: Record<string, string> = {
  clipRule: "clip-rule",
  fillRule: "fill-rule",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeWidth: "stroke-width",
}
const icons = Object.fromEntries(
  Object.entries(drawings).map(([key, shapes]) => [
    key,
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${shapes
      .map(
        ([tag, values]) =>
          `<${tag} ${Object.entries(values)
            .map(
              ([attr, value]) =>
                `${svgAttributes[attr] ?? attr}="${attr === "strokeWidth" ? 1.8 : value}"`,
            )
            .join(" ")} />`,
      )
      .join("")}</svg>`,
  ]),
)

type Sample = CatalogRow & {
  category: string
  description?: string
  onHand: number
  reserved: number
}
function sample(
  id: string,
  name: string,
  category: string,
  unitName: string,
  priceLabel: string,
  onHand: number,
  options: Partial<Sample> = {},
): Sample {
  const reserved = options.reserved ?? 0
  return {
    id,
    name,
    category,
    unitName,
    priceLabel,
    onHand,
    reserved,
    kind: "product",
    detail: "",
    availabilityLabel: onHand
      ? `${onHand - reserved} ${unitName} available`
      : `0 ${unitName} left`,
    ...options,
  }
}
function service(id: string, name: string, category: string, price: string) {
  return sample(id, name, category, "Service", price, 0, {
    kind: "service",
    availabilityLabel: "Service",
  })
}
const sampleRows = sortCatalogRows([
  sample("broiler", "Broiler chicken", "Poultry", "bird", "₦12,500", 24, {
    reserved: 2,
    description: "Whole broiler chicken.",
  }),
  sample("catfish", "Catfish", "Fish", "kg", "₦5,500", 8),
  sample("eggs", "Chicken eggs", "Poultry", "crate", "₦6,500", 12),
  sample("feed", "Chicken feed", "Feed", "bag", "₦18,500", 4),
  sample("corn", "Cracked corn", "Feed", "bag", "₦12,000", 7),
  service("delivery", "Local delivery", "Delivery", "₦2,000"),
  service("cleaning", "Poultry cleaning", "Preparation", "₦1,500"),
  sample("gizzard", "Chicken gizzard", "Poultry", "kg", "₦8,000", 0, {
    problem: "out_of_stock",
  }),
  sample(
    "drumsticks",
    "Chicken drumsticks",
    "Poultry",
    "kg",
    "Price not set",
    10,
    { problem: "no_price" },
  ),
  sample("turkey", "Turkey wings", "Poultry", "kg", "₦11,000", 0, {
    problem: "not_counted",
  }),
  sample("smoked-fish", "Smoked fish", "Fish", "pack", "₦4,000", 6, {
    hiddenFromSale: true,
  }),
  sample("quail", "Quail eggs", "Poultry", "pack", "₦2,500", 8),
]) as Sample[]

const palette = { light: themeColorVars("light"), dark: themeColorVars("dark") }
const illustrations = Object.fromEntries(
  (["light", "dark"] as const).map((theme) => {
    const colors = THEME[theme]
    const paint = {
      ink: colors.foreground,
      fill: colors.card,
      accent: colors.primary,
      highlight: colors.accent,
    }
    return [
      theme,
      {
        product: getCatalogIllustrationSvg("ill-chicken", paint),
        service: getCatalogIllustrationSvg("ill-produce-crate", paint),
      },
    ]
  }),
)
const model = {
  illustrations,
  catalogAvatarTint,
  catalogCountLabel,
  catalogShelfCounts,
  catalogShelfTitle,
  filterCatalogShelf,
  shouldShowListSearch,
  catalogAiAllowanceLabel,
  sampleRows,
  productUsageDescriptions,
  productUsageLabels,
  palette,
  icons,
}
Object.assign(window, { MOBILE_CATALOG_MODEL: model })
