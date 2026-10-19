/** Local queue ownership is captured at creation, never inferred on restore. */
export type OfflineCommandScope = {
  actorUserId: string
  businessId: string
  storeId: string
}

export type OfflineCommandOwner = Partial<OfflineCommandScope>

export function offlineCommandScopeKey(scope: OfflineCommandScope) {
  return JSON.stringify([scope.actorUserId, scope.businessId, scope.storeId])
}

/** Compare wire facts independent of JSONB object-key order. Not an authority hash. */
export function sameOfflineCommandFacts(left: unknown, right: unknown) {
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered)
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, ordered(entry)]),
      )
    return value
  }
  return (
    JSON.stringify(ordered(JSON.parse(JSON.stringify(left)))) ===
    JSON.stringify(ordered(JSON.parse(JSON.stringify(right))))
  )
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value
}

export function offlineCommandScope(
  profile:
    | {
        id?: string
        businessId?: string
        storeId?: string
      }
    | null
    | undefined,
): OfflineCommandScope | null {
  if (
    !identifier(profile?.id) ||
    !identifier(profile?.businessId) ||
    !identifier(profile?.storeId)
  )
    return null
  return {
    actorUserId: profile.id,
    businessId: profile.businessId,
    storeId: profile.storeId,
  }
}

export function ownsOfflineCommand(
  command: OfflineCommandOwner,
  scope: OfflineCommandScope | null,
) {
  return Boolean(
    scope &&
      command.actorUserId === scope.actorUserId &&
      command.businessId === scope.businessId &&
      command.storeId === scope.storeId,
  )
}

export function scopedOfflineCommands<T extends OfflineCommandOwner>(
  commands: readonly T[],
  scope: OfflineCommandScope | null,
): T[] {
  return commands.filter((command) => ownsOfflineCommand(command, scope))
}
