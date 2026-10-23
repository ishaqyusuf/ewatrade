/**
 * Source-only storefront template factory: no DB, network, env or provider access.
 *   bun --env-file=/dev/null scripts/template-factory.ts inventory
 *   bun --env-file=/dev/null scripts/template-factory.ts check
 *   bun --env-file=/dev/null scripts/template-factory.ts fixture <populated|empty|unavailable> [template-key]
 *   bun --env-file=/dev/null scripts/template-factory.ts scaffold <template-key>
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { sectionResources } from "../packages/storefront-contracts/src/resources"
import {
  type FixtureName,
  fixture,
} from "../packages/storefront-templates/src/fixtures"
import {
  defaultComposition,
  templateInventory,
  templateRegistry,
} from "../packages/storefront-templates/src/registry"

const [command, arg, templateKey] = process.argv.slice(2)
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2))

if (command === "inventory") {
  print(templateInventory())
} else if (command === "check") {
  let failed = 0
  for (const { manifest } of templateRegistry) {
    try {
      defaultComposition(manifest)
      console.log(`ok ${manifest.key}@${manifest.version}`)
    } catch (error) {
      failed++
      console.log(
        `fail ${manifest.key}: ${error instanceof Error ? error.message : error}`,
      )
    }
  }
  process.exit(failed ? 1 : 0)
} else if (
  command === "fixture" &&
  ["populated", "empty", "unavailable"].includes(arg ?? "")
) {
  const entry = templateRegistry.find(
    (e) => e.manifest.key === (templateKey ?? "catalog-v4"),
  )
  if (!entry) throw new Error("Unknown template.")
  const data = fixture(arg as FixtureName)
  const composition = defaultComposition(entry.manifest)
  // Data-only preview entry until TF03 provides the shared renderer.
  print(
    composition.pages.map((page) => ({
      page: page.key,
      sections: page.sections.map((section) => {
        const definition = entry.manifest.sections.find(
          (d) => d.key === section.type,
        )!
        const resource = definition.resources[0]
        const loaded = resource
          ? sectionResources(data.resources, resource)
          : null
        const count = Array.isArray(loaded)
          ? loaded.length
          : loaded && "items" in loaded
            ? loaded.items.length
            : undefined
        return {
          id: section.id,
          resource: resource ?? null,
          items: count,
          capabilities: Object.fromEntries(
            definition.capabilities.map((c) => [
              c,
              data.capabilities[c].available,
            ]),
          ),
        }
      }),
    })),
  )
} else if (
  command === "scaffold" &&
  arg &&
  /^[a-z][a-z0-9-]{0,63}$/.test(arg)
) {
  const dir = join("packages/storefront-templates/src", arg)
  if (existsSync(dir)) throw new Error(`${dir} already exists.`)
  mkdirSync(dir, { recursive: true })
  // Key stays unchanged; dashes (including doubled/trailing) drop out of the identifier, so foo-1 → foo1Manifest.
  const words = arg.split("-").filter(Boolean)
  const identifier = `${words.map((word, i) => (i ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join("")}Manifest`
  const name = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
  writeFileSync(
    join(dir, "manifest.ts"),
    `import { defineTemplate } from "../../../storefront-contracts/src/manifest"

export const ${identifier} = defineTemplate({
  schemaVersion: 1,
  runtimeVersion: 1,
  key: "${arg}",
  version: "0.1.0",
  name: "${name}",
  description: "TODO: describe this template.",
  businessTypes: ["retail"],
  pages: [{ key: "home", path: "/", label: "Home", allowedSections: ["intro"] }],
  sections: [{
    key: "intro", version: 1, label: "Intro", allowedBlocks: [], resources: ["business"], capabilities: [],
    fields: [{ key: "heading", label: "Heading", kind: "text", maxLength: 120, default: "" }],
  }],
  blocks: [],
})
`,
  )
  console.log(
    `Created ${dir}/manifest.ts. Add it to templateRegistry with explicit availability { state: "active" } and status source-only / not-qualified / not-live, then run check.`,
  )
} else {
  console.log(
    "Usage: template-factory.ts inventory | check | fixture <populated|empty|unavailable> [key] | scaffold <key>",
  )
  process.exit(1)
}
