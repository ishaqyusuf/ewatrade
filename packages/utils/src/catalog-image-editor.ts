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
export type CatalogImageUsage = (string | null)[]
export type CatalogImageAssignments = Readonly<
  Record<string, CatalogImageUsage>
>
export type CatalogImageOption = { id: string; name: string }
export type CatalogImageOptionEditor = {
  options: readonly CatalogImageOption[]
  assignments: CatalogImageAssignments
  onAssign(assetId: string, usage: CatalogImageUsage): void
}

export function normalizeCatalogImageUsage(
  usage: readonly (string | null)[],
): CatalogImageUsage {
  const variants = [...new Set(usage.filter((id) => id !== null))].sort()
  return usage.includes(null) ? [null, ...variants] : variants
}

export function toggleCatalogImageUsage(
  usage: CatalogImageUsage,
  scope: string | null,
) {
  if (usage.includes(scope))
    return usage.length === 1 ? usage : usage.filter((id) => id !== scope)
  return normalizeCatalogImageUsage([...usage, scope])
}

export function catalogImageUsage(photo: {
  optionVariantId?: string | null
  usage?: CatalogImageUsage
}): CatalogImageUsage {
  return photo.usage ?? [photo.optionVariantId ?? null]
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
  usages: readonly CatalogImageUsage[],
): CatalogImageAssignments {
  return Object.fromEntries(
    assetIds.map((id, index) => [id, usages[index] ?? [null]]),
  )
}

export function catalogImageUsages(
  assetIds: readonly string[],
  assignments: CatalogImageAssignments,
  replacements: readonly CatalogImageReplacement[] = [],
) {
  const next = { ...assignments }
  for (const { from, to } of replacements) {
    if (!Object.hasOwn(next, to)) next[to] = next[from] ?? [null]
    delete next[from]
  }
  return assetIds.map((id) => next[id] ?? [null])
}

/** Prefer a selected option's group; general and pre-assignment photos share the fallback group. */
export function catalogImagesForOption<
  T extends Parameters<typeof catalogImageUsage>[0],
>(photos: readonly T[], variantId?: string) {
  if (variantId) {
    const assigned = photos.filter((photo) =>
      catalogImageUsage(photo).includes(variantId),
    )
    if (assigned.length) return assigned
  }
  return photos.filter((photo) => catalogImageUsage(photo).includes(null))
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
