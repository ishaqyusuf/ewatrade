import type {
  QaFixtureContext,
  createQaFixtureIdentity,
} from "@ewatrade/utils/qa-fixtures"
import type {
  createQaBusinessFixture,
  createQaCatalogFixture,
  createQaCustomerFixture,
  createQaInventoryConversionFixture,
  createQaInventoryFixture,
  createQaMessageFixture,
  createQaOrderFixture,
  createQaServiceFixture,
  createQaStaffFixture,
} from "@ewatrade/utils/qa-quick-fill"

export type FixtureContext = QaFixtureContext

function unavailable(): never {
  throw new Error("This internal capability is unavailable in this build.")
}

export const createFixtureIdentity: typeof createQaFixtureIdentity = unavailable
export const createBusinessFixture: typeof createQaBusinessFixture = unavailable
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
