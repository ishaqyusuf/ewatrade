export type CatalogAiClientJob = {
  id: string
  state: string
  mode: string
  sourceAssetId: string | null
  rootAssetId: string | null
  outputAssetId: string | null
  appliedAt: Date | string | null
}
export type CatalogImageReplacement = { from: string; to: string }
export type CatalogImageAssignments = Readonly<Record<string, string | null>>
export type CatalogImageOption = { id: string; name: string }
export type CatalogImageOptionEditor = {
  options: readonly CatalogImageOption[]
  assignments: CatalogImageAssignments
  onAssign(assetId: string, variantId: string | null): void
}

export function catalogImageOptions(
  variants: readonly (CatalogImageOption & {
    status: string
    isDefault: boolean
    selections: readonly unknown[]
  })[],
) {
  const active = variants.filter((variant) => variant.status !== "archived")
  const first = active[0]
  return active.length === 1 && first?.isDefault && !first.selections.length
    ? []
    : active
}

export function catalogImageAssignments(
  assetIds: readonly string[],
  variantIds: readonly (string | null)[],
): CatalogImageAssignments {
  return Object.fromEntries(
    assetIds.map((id, index) => [id, variantIds[index] ?? null]),
  )
}

export function catalogImageVariantIds(
  assetIds: readonly string[],
  assignments: CatalogImageAssignments,
  replacements: readonly CatalogImageReplacement[] = [],
) {
  const next = { ...assignments }
  for (const { from, to } of replacements) {
    if (!Object.hasOwn(next, to)) next[to] = next[from] ?? null
    delete next[from]
  }
  return assetIds.map((id) => next[id] ?? null)
}

/** Prefer a selected option's group; general and pre-assignment photos share the fallback group. */
export function catalogImagesForOption<
  T extends { optionVariantId?: string | null },
>(photos: readonly T[], variantId?: string) {
  if (variantId) {
    const assigned = photos.filter(
      (photo) => photo.optionVariantId === variantId,
    )
    if (assigned.length) return assigned
  }
  return photos.filter((photo) => photo.optionVariantId == null)
}

/** Apply once in completion order. A refinement replaces its image slot; it
 * never adds a second copy of the original to the item. */
export function applyCatalogAiJobs(
  ids: string[],
  jobs: CatalogAiClientJob[],
  seen: Set<string>,
  replacements?: CatalogImageReplacement[],
) {
  const next = [...ids]
  const roots = new Map<string, string>()
  for (const job of jobs)
    if (job.outputAssetId)
      roots.set(job.outputAssetId, job.rootAssetId ?? job.outputAssetId)
  for (const job of [...jobs].reverse()) {
    if (
      job.state !== "DELIVERED" ||
      !job.outputAssetId ||
      job.appliedAt ||
      seen.has(job.id)
    )
      continue
    if (next.includes(job.outputAssetId)) {
      seen.add(job.id)
      continue
    }
    const index =
      job.mode === "refine"
        ? next.findIndex(
            (id) =>
              id === job.sourceAssetId ||
              id === job.rootAssetId ||
              roots.get(id) === job.rootAssetId,
          )
        : -1
    const from = next[index]
    if (from !== undefined) {
      replacements?.push({ from, to: job.outputAssetId })
      next[index] = job.outputAssetId
    } else if (next.length < 8) next.push(job.outputAssetId)
    else continue
    seen.add(job.id)
  }
  return next
}
export function catalogRefinementDescendants(
  versions: Array<{ assetId: string; sourceAssetId: string | null }>,
  assetId: string,
) {
  const removed = new Set([assetId])
  let changed = true
  while (changed) {
    changed = false
    for (const version of versions)
      if (
        version.sourceAssetId &&
        removed.has(version.sourceAssetId) &&
        !removed.has(version.assetId)
      ) {
        removed.add(version.assetId)
        changed = true
      }
  }
  return [...removed]
}
