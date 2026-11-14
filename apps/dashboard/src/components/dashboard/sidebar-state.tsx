"use client"

import { SIDEBAR_PIN_COOKIE, SIDEBAR_PIN_VALUE } from "@/lib/navigation"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

const HOVER_DELAY_MS = 500
const PIN_QUERY = "(min-width: 1024px)"

type SidebarState = {
  /** Open: hovered, focused, or kept open on a wide screen. */
  isOpen: boolean
  /** The saved Keep open choice (ignored under 1024px). */
  isPinned: boolean
  /** Keep open is available (1024px and up). */
  canPin: boolean
  togglePinned: () => void
  pointerEnter: () => void
  pointerLeave: () => void
  focusEnter: () => void
  focusLeave: () => void
}

const SidebarStateContext = createContext<SidebarState | null>(null)

function subscribeWide(callback: () => void) {
  const query = window.matchMedia(PIN_QUERY)
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

function writePinCookie(pinned: boolean) {
  document.cookie = pinned
    ? `${SIDEBAR_PIN_COOKIE}=${SIDEBAR_PIN_VALUE}; Max-Age=31536000; Path=/; SameSite=Lax`
    : `${SIDEBAR_PIN_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    Boolean(target.closest("[role=combobox],[role=textbox]"))
  )
}

/**
 * Owns the sidebar's Keep open pin and hover state, and renders the shell
 * frame whose `--sidebar-width` drives the sidebar, content offset and sheet
 * offsets. The server passes the cookie value so first paint has the right
 * width; the pin only applies from 1024px (CSS and `canPin` agree).
 */
export function DashboardShellFrame({
  children,
  initialPinned,
}: {
  children: ReactNode
  initialPinned: boolean
}) {
  const [isPinned, setIsPinned] = useState(initialPinned)
  const [isPointerOpen, setIsPointerOpen] = useState(false)
  const [isFocusOpen, setIsFocusOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Server and hydration assume a wide screen, matching the CSS breakpoint.
  const canPin = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(PIN_QUERY).matches,
    () => true,
  )

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])
  useEffect(() => clearTimer, [clearTimer])

  const togglePinned = useCallback(() => {
    setIsPinned((current) => {
      writePinCookie(!current)
      return !current
    })
    setIsPointerOpen(false)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "[" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.defaultPrevented ||
        isTypingTarget(event.target) ||
        !window.matchMedia(PIN_QUERY).matches
      )
        return
      event.preventDefault()
      togglePinned()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [togglePinned])

  const pinned = isPinned && canPin
  const state = useMemo<SidebarState>(
    () => ({
      isOpen: pinned || isPointerOpen || isFocusOpen,
      isPinned,
      canPin,
      togglePinned,
      pointerEnter() {
        clearTimer()
        timer.current = setTimeout(() => setIsPointerOpen(true), HOVER_DELAY_MS)
      },
      pointerLeave() {
        clearTimer()
        timer.current = setTimeout(
          () => setIsPointerOpen(false),
          HOVER_DELAY_MS,
        )
      },
      focusEnter: () => setIsFocusOpen(true),
      focusLeave: () => setIsFocusOpen(false),
    }),
    [
      pinned,
      isPointerOpen,
      isFocusOpen,
      isPinned,
      canPin,
      togglePinned,
      clearTimer,
    ],
  )

  return (
    <SidebarStateContext.Provider value={state}>
      <div
        className="dashboard-shell relative min-h-screen"
        data-sidebar-pinned={isPinned ? "true" : undefined}
      >
        {children}
      </div>
    </SidebarStateContext.Provider>
  )
}

export function useSidebarState() {
  const state = useContext(SidebarStateContext)
  if (!state)
    throw new Error("useSidebarState must be used inside DashboardShellFrame")
  return state
}
