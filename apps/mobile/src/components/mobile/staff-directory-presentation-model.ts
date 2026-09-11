export function getStaffDirectoryPresentation({
  hasError,
  isAtStaffLimit,
  isLoading,
  isOffline,
  staffCount,
}: {
  hasError: boolean
  isAtStaffLimit: boolean
  isLoading: boolean
  isOffline: boolean
  staffCount: number
}) {
  const showInitialInviteAction =
    staffCount === 0 && !isLoading && !hasError && !isOffline && !isAtStaffLimit

  return {
    showInitialInviteAction,
    showStandardInviteFab: !showInitialInviteAction,
  }
}
