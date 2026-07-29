import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)

const contracts = [
  {
    file: "src/app/_layout.tsx",
    markers: ['name="catalog-item/[catalogItemId]"'],
  },
  {
    file: "src/app/catalog-item/[catalogItemId].tsx",
    markers: ["CatalogItemScreen", "useLocalSearchParams"],
  },
  {
    file: "src/components/mobile/catalog-items-sheet.tsx",
    forbiddenMarkers: [
      "CatalogItemOverview",
      "initialCatalogItemId",
      "selectedItemId",
    ],
    markers: [
      'pathname: "/catalog-item/[catalogItemId]"',
      'className="mx-2 px-2 active:bg-accent"',
    ],
  },
  {
    file: "src/app/(admin-tabs)/catalog.tsx",
    forbiddenMarkers: ["useLocalSearchParams", "initialCatalogItemId"],
    markers: ["CatalogItemsContent", 'presentation="tab"'],
  },
  {
    file: "src/components/mobile/global-search-screen.tsx",
    markers: ['pathname: "/catalog-item/[catalogItemId]"'],
  },
  {
    file: "src/components/mobile/simple-catalog-item-screen.tsx",
    markers: ["trpc.catalog.listItemsPage.queryFilter()", 'refetchType: "all"'],
  },
]

const failures = []

for (const contract of contracts) {
  const path = join(MOBILE_DIR, contract.file)
  if (!existsSync(path)) {
    failures.push(`${contract.file} is missing`)
    continue
  }

  const source = readFileSync(path, "utf8")
  for (const marker of contract.markers ?? []) {
    if (!source.includes(marker)) {
      failures.push(`${contract.file} is missing marker: ${marker}`)
    }
  }
  for (const marker of contract.forbiddenMarkers ?? []) {
    if (source.includes(marker)) {
      failures.push(`${contract.file} must not contain marker: ${marker}`)
    }
  }
}

if (failures.length > 0) {
  console.error("Catalog overview route check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Catalog overview route check passed.")
