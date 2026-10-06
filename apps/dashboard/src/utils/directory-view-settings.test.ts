import { describe, expect, test } from "bun:test"
import {
  directoryViewInputSchema,
  directoryViews,
  getDirectoryViewCookie,
  parseSavedDirectoryView,
  resolveDirectoryView,
} from "./directory-view-settings"

describe("directory view preferences", () => {
  test("uses list before cards before table on small screens without a preference", () => {
    const base = { urlView: null, savedView: null, smallScreen: true } as const
    expect(resolveDirectoryView({ ...base, options: directoryViews })).toBe(
      "list",
    )
    expect(resolveDirectoryView({ ...base, options: ["table", "cards"] })).toBe(
      "cards",
    )
    expect(resolveDirectoryView({ ...base, options: ["table"] })).toBe("table")
    expect(
      resolveDirectoryView({
        ...base,
        smallScreen: false,
        options: directoryViews,
      }),
    ).toBe("table")
  })
  test("honors every saved view on either screen size", () => {
    for (const savedView of directoryViews)
      for (const smallScreen of [false, true]) {
        expect(
          resolveDirectoryView({
            urlView: null,
            savedView,
            smallScreen,
            options: directoryViews,
          }),
        ).toBe(savedView)
      }
  })
  test("explicit supported URL wins; unavailable options fall through", () => {
    expect(
      resolveDirectoryView({
        urlView: "list",
        savedView: "cards",
        smallScreen: false,
        options: directoryViews,
      }),
    ).toBe("list")
    expect(
      resolveDirectoryView({
        urlView: "cards",
        savedView: "table",
        smallScreen: true,
        options: ["table", "list"],
      }),
    ).toBe("table")
    expect(
      resolveDirectoryView({
        urlView: null,
        savedView: "list",
        smallScreen: true,
        options: ["table", "cards"],
      }),
    ).toBe("cards")
  })
  test("invalid cookies fall back and cookie keys isolate pages and identity scope", () => {
    expect(parseSavedDirectoryView("grid")).toBeNull()
    expect(parseSavedDirectoryView(undefined)).toBeNull()
    expect(parseSavedDirectoryView("cards")).toBe("cards")
    expect(getDirectoryViewCookie("staff", "a".repeat(24))).not.toBe(
      getDirectoryViewCookie("customers", "a".repeat(24)),
    )
    expect(getDirectoryViewCookie("staff", "a".repeat(24))).not.toBe(
      getDirectoryViewCookie("staff", "b".repeat(24)),
    )
  })
  test("validates server preference input and rejects unknown keys", () => {
    const valid = { pageId: "staff", scope: "a".repeat(24), view: "cards" }
    expect(directoryViewInputSchema.safeParse(valid).success).toBe(true)
    for (const invalid of [
      { ...valid, view: "grid" },
      { ...valid, scope: "other-user" },
      { ...valid, pageId: "arbitrary-cookie" },
      { ...valid, userId: "other-user" },
    ]) {
      expect(directoryViewInputSchema.safeParse(invalid).success).toBe(false)
    }
  })
})
