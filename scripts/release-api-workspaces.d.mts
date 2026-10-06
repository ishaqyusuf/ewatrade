import type { ApiSourceInventory } from "./release-api-source-stage.mjs"

export declare function apiBuildWorkspaceFilters(input: {
  stage: string
  inventory: ApiSourceInventory
}): readonly string[]
