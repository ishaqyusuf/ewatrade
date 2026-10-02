export type StoreConversationAssignmentPermissions = {
  canRelease: boolean
  canReassign: boolean
}

export type StoreConversationAssignmentOption = {
  value: "handoff" | "reassign" | "release"
  label: string
}

export function getStoreConversationAssignmentOptions(
  permissions: StoreConversationAssignmentPermissions,
): StoreConversationAssignmentOption[] {
  return [
    ...(permissions.canRelease
      ? [
          { value: "handoff" as const, label: "Hand off" },
          { value: "release" as const, label: "Return to queue" },
        ]
      : []),
    ...(permissions.canReassign
      ? [{ value: "reassign" as const, label: "Reassign" }]
      : []),
  ]
}
