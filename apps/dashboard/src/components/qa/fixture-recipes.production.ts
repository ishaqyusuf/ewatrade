import type {
  createQaCatalogFixture,
  createQaCustomerFixture,
  createQaExpenseFixture,
  createQaInventoryConversionFixture,
  createQaInventoryFixture,
  createQaMessageFixture,
  createQaOrderFixture,
  createQaServiceFixture,
  createQaStaffFixture,
  createQaSupplierFixture,
} from "@ewatrade/utils/qa-quick-fill"

function unavailable(): never {
  throw new Error("This internal capability is unavailable in this build.")
}

export const createCatalogFixture: typeof createQaCatalogFixture = unavailable
export const createCustomerFixture: typeof createQaCustomerFixture = unavailable
export const createExpenseFixture: typeof createQaExpenseFixture = unavailable
export const createInventoryFixture: typeof createQaInventoryFixture =
  unavailable
export const createInventoryConversionFixture: typeof createQaInventoryConversionFixture =
  unavailable
export const createMessageFixture: typeof createQaMessageFixture = unavailable
export const createOrderFixture: typeof createQaOrderFixture = unavailable
export const createServiceFixture: typeof createQaServiceFixture = unavailable
export const createStaffFixture: typeof createQaStaffFixture = unavailable
export const createSupplierFixture: typeof createQaSupplierFixture = unavailable
