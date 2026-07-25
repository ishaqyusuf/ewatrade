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
