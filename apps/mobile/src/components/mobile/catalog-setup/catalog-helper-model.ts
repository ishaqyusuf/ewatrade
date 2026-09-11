import type {
  CatalogSetupHelper,
  CatalogSetupHelperKind,
} from "@ewatrade/utils/catalog-setup-helpers"
export type HelperRowProps = {
  helper: CatalogSetupHelper
  highlighted: boolean
  personalized: boolean
  selected: boolean
  disabled?: boolean
  onPress: () => void
}
export type CatalogSetupHelperPickerProps = {
  businessProfileKey?: string | null
  kind: CatalogSetupHelperKind
  onClose: () => void
  onSelect: (helper: CatalogSetupHelper | null) => void
  selectedKey: string | null
  visible: boolean
  disabled?: boolean
}
export type HelperPickerRow =
  | { type: "heading"; key: string; label: string }
  | {
      type: "helper"
      key: string
      helper: CatalogSetupHelper
      personalized: boolean
    }
