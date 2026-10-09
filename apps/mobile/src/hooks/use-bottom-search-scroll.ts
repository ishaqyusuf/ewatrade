import { useBottomDockScroll } from "@/hooks/use-bottom-dock-scroll"
import { useState } from "react"

/**
 * Hides a screen's bottom search footer while the list scrolls down and
 * brings it back on scroll up, at the top or at the end of the list.
 * Pass `onScroll` to the list and `hidden` to BottomSearchFooter (and to a
 * ListCreateFab that sits above the footer).
 */
export function useBottomSearchScroll() {
  const [hidden, setHidden] = useState(false)
  const onScroll = useBottomDockScroll(setHidden)
  return { hidden, onScroll }
}
