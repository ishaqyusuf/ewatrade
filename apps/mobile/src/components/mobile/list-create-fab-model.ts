export function getListCreateFabBottom({
  bottomInset,
  bottomOffset = 0,
  dockHidden = false,
  sitsAboveDock = false,
}: {
  bottomInset: number
  bottomOffset?: number
  dockHidden?: boolean
  sitsAboveDock?: boolean
}) {
  const normalBottom = Math.max(bottomInset + 16, 24) + bottomOffset
  const dockBottom = Math.max(bottomInset + 100, 112) + bottomOffset
  return sitsAboveDock && !dockHidden ? dockBottom : normalBottom
}

/**
 * The bottomOffset that seats a FAB 14 points above a floating bottom search
 * footer of the given height, matching the space between the search pill and
 * the screen edge. Zero when the footer is hidden or absent.
 */
export function getListCreateFabFooterOffset({
  bottomInset,
  footerHeight,
}: {
  bottomInset: number
  footerHeight: number
}) {
  return Math.max(0, footerHeight + 14 - Math.max(bottomInset + 16, 24))
}
