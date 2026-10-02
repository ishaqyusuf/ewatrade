export type BottomDockScrollState = {
  direction: -1 | 0 | 1
  hidden: boolean
  lastMaxY: number | null
  lastY: number | null
  travel: number
}

export function initialBottomDockScrollState(): BottomDockScrollState {
  return { direction: 0, hidden: false, lastMaxY: null, lastY: null, travel: 0 }
}

export function nextBottomDockScrollState(
  state: BottomDockScrollState,
  {
    y,
    contentHeight,
    viewportHeight,
  }: {
    y: number
    contentHeight: number
    viewportHeight: number
  },
): BottomDockScrollState {
  const maxY = Math.max(0, contentHeight - viewportHeight)
  // Native bounce/refresh can report offsets beyond either edge. Those are
  // edge feedback, not a reversal of the user's scroll direction.
  const scrollY = Math.min(maxY, Math.max(0, y))
  if (scrollY <= 24 || maxY - scrollY <= 1) {
    return {
      direction: 0,
      hidden: false,
      lastMaxY: maxY,
      lastY: scrollY,
      travel: 0,
    }
  }
  if (state.lastY === null || state.lastMaxY !== maxY) {
    return { ...state, direction: 0, lastMaxY: maxY, lastY: scrollY, travel: 0 }
  }
  const delta = scrollY - state.lastY
  const direction = delta > 0 ? 1 : delta < 0 ? -1 : 0
  if (direction === 0) return state
  const travel =
    direction === state.direction
      ? state.travel + Math.abs(delta)
      : Math.abs(delta)
  const hidden =
    direction === 1 && travel >= 28
      ? true
      : direction === -1 && travel >= 12
        ? false
        : state.hidden
  return { direction, hidden, lastMaxY: maxY, lastY: scrollY, travel }
}
