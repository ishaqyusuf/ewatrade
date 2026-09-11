import type {
  createQaCatalogFixture,
  createQaCustomerFixture,
  createQaInventoryConversionFixture,
  createQaInventoryFixture,
  createQaMessageFixture,
  createQaOrderFixture,
  createQaServiceFixture,
  createQaStaffFixture,
} from "@ewatrade/utils/qa-quick-fill"

function unavailable(): never {
  throw new Error("This internal capability is unavailable in this build.")
}

export const createCatalogFixture: typeof createQaCatalogFixture = unavailable
export const createCustomerFixture: typeof createQaCustomerFixture = unavailable
export const createInventoryFixture: typeof createQaInventoryFixture =
  unavailable
export const createInventoryConversionFixture: typeof createQaInventoryConversionFixture =
  unavailable
export const createMessageFixture: typeof createQaMessageFixture = unavailable
export const createOrderFixture: typeof createQaOrderFixture = unavailable
export const createServiceFixture: typeof createQaServiceFixture = unavailable
export const createStaffFixture: typeof createQaStaffFixture = unavailable
