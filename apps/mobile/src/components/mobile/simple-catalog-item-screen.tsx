// Compatibility entry point. Feature behavior lives in catalog-setup.
export { SimpleCatalogItemScreen } from "./catalog-setup/catalog-setup-screen"
export type {
  CatalogItemKind,
  CatalogItemCompletion,
} from "./catalog-setup/catalog-setup-model"
export { SellingUnitEditorQaFixture } from "./catalog-setup/selling-unit-editor"
export {
  OptionalDetailAction,
  ServiceDetailAction,
  ServiceAuthorizationOption,
  ServiceWorkTrackingSwitch,
  ServiceChoicesSectionHeader,
  EmptyServiceChoiceGroupActions,
  CatalogEssentialsFields,
  ProductOptionsSectionHeader,
  ProductFirstOptionAction,
  ProductFirstOptionValueAction,
  ProductUseOnePriceAction,
} from "./appearances/classic/catalog-setup"
