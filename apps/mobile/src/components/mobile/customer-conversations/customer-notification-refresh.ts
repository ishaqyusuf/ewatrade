export async function refreshCustomerNotificationSettingsWhenExpanded({
  expanded,
  refetch,
}: {
  expanded: boolean
  refetch(): Promise<unknown>
}) {
  if (!expanded) return

  await refetch()
}
