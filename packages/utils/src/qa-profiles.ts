/** Additive QA display metadata; older servers may omit it. Services are a subset. */
export type QaProfileCounts = {
  catalogItems: number | null
  services: number | null
  orders: number | null
}

export type QaProfile = {
  business: { id: string; name: string; slug?: string }
  identity: { id: string; email: string; name: string }
  membership: { role: string }
  store: { id: string; name: string }
  profileReference: string
  counts?: QaProfileCounts
}

export function qaProfileKey(profile: QaProfile) {
  return JSON.stringify([
    profile.business.id,
    profile.identity.id,
    profile.store.id,
    profile.membership.role,
  ])
}

export function qaProfileLabel(profile: QaProfile) {
  return [
    profile.identity.email,
    profile.business.name,
    ...(profile.store.name !== profile.business.name
      ? [profile.store.name]
      : []),
    profile.membership.role,
  ].join(" · ")
}

/** Avoid showing an email when an older profile uses it as the name fallback. */
export function qaProfileDisplayName(profile: QaProfile) {
  const name = profile.identity.name.trim()
  return name && !name.includes("@")
    ? name
    : `Tester ${profile.identity.id.slice(-6)}`
}

export function filterQaProfiles<T extends QaProfile>(
  profiles: T[],
  search: string,
): T[] {
  const query = search.trim().toLowerCase()
  if (!query) return profiles
  return profiles.filter((profile) =>
    [
      profile.business.name,
      profile.business.slug ?? "",
      profile.store.name,
      profile.identity.email,
      profile.identity.name,
      profile.membership.role,
    ].some((value) => value.toLowerCase().includes(query)),
  )
}

/** Group by identity, never name; retain each exact Store/user/role selection. */
export function groupQaProfiles<T extends QaProfile>(profiles: T[]) {
  const groups = new Map<string, { business: T["business"]; profiles: T[] }>()
  for (const profile of profiles) {
    let group = groups.get(profile.business.id)
    if (!group) {
      group = { business: profile.business, profiles: [] }
      groups.set(profile.business.id, group)
    }
    group.profiles.push(profile)
  }
  return [...groups.values()]
}

export function formatQaCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value.toLocaleString("en-US")
    : "—"
}
