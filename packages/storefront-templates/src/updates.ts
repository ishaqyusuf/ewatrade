import { versionAvailable } from "@ewatrade/storefront-contracts/availability"
import { type TemplateEntry, draftUpgrades, templateRegistry } from "./registry"

/** Immutable customer-facing notes for an exact version. Source notes are not a release. */
export const templateUpdateNotes = [
  {
    key: "catalog-v4",
    version: "1.1.0",
    title: "Give your storefront a cover image",
    changes: ["Add an optional cover illustration to welcome your customers."],
  },
  {
    key: "commerce-studio",
    version: "1.1.0",
    title: "Put your favourite products first",
    changes: ["Choose the products you want to feature on your home page."],
  },
  {
    key: "commerce-studio",
    version: "1.2.0",
    title: "Make your storefront feel more like your business",
    changes: [
      "Use your product photos in your home page welcome and story sections.",
      "Choose the words on your main shop button.",
      "Show products in three or four columns on larger screens.",
    ],
  },
] as const

export type TemplateUpdate = {
  key: string
  version: string
  title: string
  changes: readonly string[]
  fromVersions: string[]
}

const selectable = (entry: TemplateEntry | undefined) =>
  Boolean(
    entry &&
      entry.status.registration === "runtime-registered" &&
      entry.status.qualification === "qualified" &&
      versionAvailable(entry, "new-use") &&
      entry.components?.every((component) =>
        versionAvailable(component, "new-use"),
      ) !== false,
  )

/** Named forward migrations only; never infer ordering from version strings. */
export function templateUpgradePath(
  key: string,
  from: string,
  to: string,
  registry: readonly TemplateEntry[] = templateRegistry,
) {
  const path: string[] = []
  const seen = new Set<string>()
  let current = from
  while (current !== to && !seen.has(current)) {
    seen.add(current)
    const hop = draftUpgrades.find(
      (entry) => entry.from.key === key && entry.from.version === current,
    )
    if (
      !hop ||
      !selectable(
        registry.find(
          (entry) =>
            entry.manifest.key === key && entry.manifest.version === hop.to,
        ),
      )
    )
      return null
    current = hop.to
    path.push(current)
  }
  return current === to && path.length ? path : null
}

/** Only an explicitly LIVE, usable target can be announced. No source/local qualification sends. */
export function liveTemplateUpdates(
  registry: readonly TemplateEntry[] = templateRegistry,
): TemplateUpdate[] {
  const result: TemplateUpdate[] = []
  for (const note of [...templateUpdateNotes].reverse()) {
    if (result.some((entry) => entry.key === note.key)) continue
    const target = registry.find(
      (entry) =>
        entry.manifest.key === note.key &&
        entry.manifest.version === note.version,
    )
    if (!selectable(target) || target?.status.release !== "live") continue
    const fromVersions = draftUpgrades
      .filter(
        (hop) =>
          hop.from.key === note.key &&
          templateUpgradePath(
            note.key,
            hop.from.version,
            note.version,
            registry,
          ),
      )
      .map((hop) => hop.from.version)
    if (fromVersions.length) result.push({ ...note, fromVersions })
  }
  return result
}

export function templateUpdatePath(
  tenantId: string,
  key: string,
  version: string,
) {
  const parts = [tenantId, key, version]
  if (
    parts.some(
      (part) =>
        !/^[A-Za-z0-9_.-]{1,160}$/.test(part) || part === "." || part === "..",
    )
  )
    throw new Error("Invalid template update reference.")
  return `/storefront/updates/${parts.map(encodeURIComponent).join("/")}`
}
