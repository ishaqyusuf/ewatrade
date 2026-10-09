import { describe, expect, test } from "bun:test"
import { selectCatalogAvatar } from "./catalog-avatar-model"

describe("Catalog selected-media avatar", () => {
  test("the selected Store illustration replaces the initial and legacy image", () => {
    expect(
      selectCatalogAvatar(
        {
          name: "Eggs",
          illustrations: [{ storeId: "store-a", illustrationId: "eggs" }],
        },
        "store-a",
        "https://example.com/old.jpg",
      ),
    ).toEqual({ kind: "illustration", illustrationId: "eggs" })
  })
  test("uses the first attached photo in selection order within the current Store", () => {
    const photos = [
      {
        assetId: "unranked",
        storeId: "store-a",
        sortOrder: null,
        state: "APPROVED",
      },
      {
        assetId: "other-store",
        storeId: "store-b",
        sortOrder: 0,
        state: "APPROVED",
      },
      {
        assetId: "second",
        storeId: "store-a",
        sortOrder: 2,
        state: "APPROVED",
      },
      {
        assetId: "first",
        storeId: "store-a",
        sortOrder: 1,
        state: "PENDING_REVIEW",
      },
    ]
    expect(selectCatalogAvatar({ name: "Eggs", photos }, "store-a")).toEqual({
      kind: "photo",
      assetId: "first",
      storeId: "store-a",
    })
    expect(photos.map((photo) => photo.assetId)).toEqual([
      "unranked",
      "other-store",
      "second",
      "first",
    ])
    expect(
      selectCatalogAvatar(
        { name: "Eggs", photos: photos.slice(0, 1) },
        "store-a",
      ),
    ).toEqual({ kind: "photo", assetId: "unranked", storeId: "store-a" })
  })
  test("never borrows another Store's media or a removed/rejected photo", () => {
    const item = {
      name: " Eggs",
      illustrations: [{ storeId: "store-b", illustrationId: "eggs" }],
      photos: [
        {
          assetId: "removed",
          storeId: "store-a",
          sortOrder: 0,
          state: "REMOVED",
        },
        {
          assetId: "rejected",
          storeId: "store-a",
          sortOrder: 1,
          state: "REJECTED",
        },
      ],
    }
    expect(selectCatalogAvatar(item, "store-a")).toEqual({
      kind: "initial",
      label: "E",
    })
    expect(selectCatalogAvatar(item)).toEqual({ kind: "initial", label: "E" })
  })
  test("retains an existing image URL and uses an initial only with no selection", () => {
    expect(
      selectCatalogAvatar(
        { name: "Eggs" },
        "store-a",
        " https://example.com/eggs.jpg ",
      ),
    ).toEqual({ kind: "image", uri: "https://example.com/eggs.jpg" })
    expect(selectCatalogAvatar({ name: " eggs" }, "store-a")).toEqual({
      kind: "initial",
      label: "E",
    })
    expect(selectCatalogAvatar({ name: "🐔 Chicken" }, "store-a")).toEqual({
      kind: "initial",
      label: "🐔",
    })
  })
})
