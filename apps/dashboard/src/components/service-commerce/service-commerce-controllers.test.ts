import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_SHEET_MODES,
  SERVICE_COMMERCE_SHEET_RESET_PARAMS,
} from "@/hooks/use-service-commerce-params"

import { SERVICE_COMMERCE_CONTROLLERS } from "./service-commerce-controllers"

describe("Service Commerce sheet controllers", () => {
  test("maps every allowlisted URL mode through one fail-closed controller registry", () => {
    expect(Object.keys(SERVICE_COMMERCE_CONTROLLERS).sort()).toEqual(
      [...SERVICE_COMMERCE_SHEET_MODES].sort(),
    )
    expect(SERVICE_COMMERCE_CONTROLLERS.catalog_draft).toMatchObject({
      implemented: true,
      requiredIds: ["sourceKind", "sourceId", "sourceLineId"],
    })
    expect(
      Object.entries(SERVICE_COMMERCE_CONTROLLERS)
        .filter(([mode]) => mode !== "catalog_draft")
        .every(([, controller]) => !controller.implemented),
    ).toBe(true)
  })

  test("clears only sheet-owned mode and entity state on close", () => {
    expect(
      Object.values(SERVICE_COMMERCE_SHEET_RESET_PARAMS).every(
        (value) => value === null,
      ),
    ).toBe(true)
    expect(SERVICE_COMMERCE_SHEET_RESET_PARAMS).not.toHaveProperty("query")
    expect(SERVICE_COMMERCE_SHEET_RESET_PARAMS).not.toHaveProperty("sort")
    expect(SERVICE_COMMERCE_SHEET_RESET_PARAMS).not.toHaveProperty("storeId")
  })
})
