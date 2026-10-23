/** Orthogonal to source registration, qualification and deployment status. */
export type VersionAvailability = {
  state: "active" | "retired" | "blocked"
  reason?: string
}
export type VersionIntent = "inspect" | "new-use" | "render" | "rollback"
export type VersionPolicyEntry = {
  availability: VersionAvailability
  components?: readonly { availability: VersionAvailability }[]
}

/** Retain known versions for inspection/recovery; never silently substitute pins. */
export function versionAvailable(
  entry: VersionPolicyEntry,
  intent: VersionIntent,
): boolean {
  if (intent === "inspect") return true
  const permitted = (value: VersionAvailability) =>
    value?.state === "active" ||
    (value?.state === "retired" && intent !== "new-use")
  return (
    permitted(entry.availability) &&
    (entry.components ?? []).every((component) =>
      permitted(component.availability),
    )
  )
}
