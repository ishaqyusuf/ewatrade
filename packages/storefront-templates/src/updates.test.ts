import { expect, test } from "bun:test"
import { type TemplateEntry, templateRegistry } from "./registry"
import {
  liveTemplateUpdates,
  templateUpdatePath,
  templateUpgradePath,
} from "./updates"

const released = (): TemplateEntry[] =>
  templateRegistry.map((entry) => ({
    ...entry,
    status: { ...entry.status, release: "live" },
  }))

test("locally qualified source never announces a release", () => {
  expect(liveTemplateUpdates()).toEqual([])
})
test("only the latest named migration target per template is announced", () => {
  const registry = released()
  const updates = liveTemplateUpdates(registry)
  expect(
    updates.find((entry) => entry.key === "commerce-studio")?.version,
  ).toBe("1.2.0")
  expect(
    updates.find((entry) => entry.key === "commerce-studio")?.fromVersions,
  ).toEqual(["1.0.0", "1.1.0"])
  expect(
    templateUpgradePath("commerce-studio", "1.0.0", "1.2.0", registry),
  ).toEqual(["1.1.0", "1.2.0"])
  expect(
    templateUpgradePath("commerce-studio", "1.2.0", "1.0.0", registry),
  ).toBeNull()
  expect(
    templateUpgradePath("commerce-studio", "1.2.0", "1.2.0", registry),
  ).toBeNull()
  expect(
    templateUpgradePath("another-template", "1.0.0", "1.2.0", registry),
  ).toBeNull()
})
test("retired, blocked and unqualified targets and migration intermediates fail closed", () => {
  for (const state of ["retired", "blocked"] as const) {
    const registry = released().map((entry) =>
      entry.manifest.key === "commerce-studio"
        ? { ...entry, availability: { state } }
        : entry,
    )
    expect(
      liveTemplateUpdates(registry).some(
        (entry) => entry.key === "commerce-studio",
      ),
    ).toBe(false)
  }
  const registry = released().map((entry) =>
    entry.manifest.key === "commerce-studio" &&
    entry.manifest.version === "1.1.0"
      ? {
          ...entry,
          status: {
            ...entry.status,
            qualification: "needs-requalification" as const,
          },
        }
      : entry,
  )
  expect(
    templateUpgradePath("commerce-studio", "1.0.0", "1.2.0", registry),
  ).toBeNull()
  expect(
    templateUpgradePath("commerce-studio", "1.1.0", "1.2.0", registry),
  ).toEqual(["1.2.0"])
})
test("business-bound review paths reject traversal and URL injection", () => {
  expect(templateUpdatePath("business-1", "commerce-studio", "1.2.0")).toBe(
    "/storefront/updates/business-1/commerce-studio/1.2.0",
  )
  for (const input of [
    "..",
    ".",
    "//evil.test",
    "a/b",
    "a?b",
    "a#b",
    "a%2fb",
    "",
  ])
    expect(() =>
      templateUpdatePath(input, "commerce-studio", "1.2.0"),
    ).toThrow()
})
