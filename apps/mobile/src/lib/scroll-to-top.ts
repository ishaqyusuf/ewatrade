export type ScrollToTopState = {
  lastY: number
  returning: boolean
  visible: boolean
}

export function initialScrollToTopState(): ScrollToTopState {
  return { lastY: 0, returning: false, visible: false }
}

/** The arrow shows past this share of a screen and hides again under the lower one. */
export const SCROLL_TO_TOP_SHOW = 0.8
export const SCROLL_TO_TOP_HIDE = 0.4

export function nextScrollToTopState(
  state: ScrollToTopState,
  {
    y,
    contentHeight,
    viewportHeight,
  }: { y: number; contentHeight: number; viewportHeight: number },
): ScrollToTopState {
  if (viewportHeight <= 0) return { ...state, visible: false }
  const maxY = Math.max(0, contentHeight - viewportHeight)
  // Bounce and pull-to-refresh report offsets past either edge; clamp them.
  const scrollY = Math.min(maxY, Math.max(0, y))
  // Tapping hides the arrow for the whole trip back. It ends at the top, or
  // when the user takes over and scrolls down again.
  const returning = state.returning && scrollY > 1 && scrollY <= state.lastY
  // A list too short to reach the show line never shows it, even one that
  // shrank (a filter, a search) while the arrow was up.
  const reachable = maxY > viewportHeight * SCROLL_TO_TOP_SHOW
  const threshold = state.visible ? SCROLL_TO_TOP_HIDE : SCROLL_TO_TOP_SHOW
  const visible =
    reachable && !returning && scrollY > viewportHeight * threshold
  return { lastY: scrollY, returning, visible }
}

export function startScrollToTop(state: ScrollToTopState): ScrollToTopState {
  return { ...state, returning: true, visible: false }
}
