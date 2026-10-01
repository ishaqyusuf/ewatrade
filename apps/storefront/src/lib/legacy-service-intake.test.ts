import { describe, expect, it } from "bun:test"

import { findPublishedEntryForLegacyServiceForm } from "./legacy-service-intake"

describe("legacy Service form forwarding", () => {
  it("only selects the published entry belonging to the submitted form", async () => {
    const entries = [
      { publicToken: "other-store", formId: "other-form", status: "PUBLISHED" },
      { publicToken: "draft-store", formId: "form-1", status: "DRAFT" },
      { publicToken: "current-store", formId: "form-1", status: "PUBLISHED" },
    ]
    const db = {
      customerEntryPoint: {
        findFirst: async ({
          where,
        }: {
          where: {
            status: string
            store: { serviceRequestForms: { some: { id: string } } }
          }
        }) =>
          entries.find(
            (entry) =>
              entry.status === where.status &&
              entry.formId === where.store.serviceRequestForms.some.id,
          ) ?? null,
      },
    }

    await expect(
      findPublishedEntryForLegacyServiceForm(db as never, "form-1"),
    ).resolves.toEqual({
      publicToken: "current-store",
      formId: "form-1",
      status: "PUBLISHED",
    })
    await expect(
      findPublishedEntryForLegacyServiceForm(db as never, "missing-form"),
    ).resolves.toBeNull()
  })
})
