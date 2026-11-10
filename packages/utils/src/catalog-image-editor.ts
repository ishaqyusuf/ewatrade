export type CatalogAiClientJob = {
  id: string
  state: string
  mode: string
  sourceAssetId: string | null
  rootAssetId: string | null
  outputAssetId: string | null
  appliedAt: Date | string | null
}
/** Apply once in completion order. A refinement replaces its image slot; it
 * never adds a second copy of the original to the item. */
export function applyCatalogAiJobs(
  ids: string[],
  jobs: CatalogAiClientJob[],
  seen: Set<string>,
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
    if (index >= 0) next[index] = job.outputAssetId
    else if (next.length < 8) next.push(job.outputAssetId)
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
