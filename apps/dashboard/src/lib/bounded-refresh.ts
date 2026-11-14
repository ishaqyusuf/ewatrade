import { isRejectedRead } from "@/trpc/query-read-errors"

/**
 * Bounded background checks for screens that wait on customers (the
 * Conversations inbox and an open conversation). Trigger and frequency:
 *
 * - on window focus, tab becoming visible and coming back online;
 * - right after the attendant sends, claims or hands over (invalidation);
 * - otherwise one check per interval, only while the tab is visible
 *   (React Query pauses hidden tabs) and only for `IDLE_STOP_MS` after the
 *   last tap or key press. After that it stops until focus or input.
 *
 * Inbox: 60s → at most 15 queue reads per idle period per open tab (was one
 * every 5s with no end). Open conversation: 10s while messages are arriving,
 * 30s after two quiet minutes, same idle stop.
 */
export const INBOX_CHECK_MS = 60_000
export const THREAD_CHECK_MS = 10_000
export const THREAD_QUIET_CHECK_MS = 30_000
export const THREAD_QUIET_AFTER_MS = 2 * 60_000
export const IDLE_STOP_MS = 15 * 60_000

let lastInputAt = Date.now()
let listening = false
const listeners = new Set<() => void>()

function noteInput() {
  const wasIdle = Date.now() - lastInputAt > IDLE_STOP_MS
  lastInputAt = Date.now()
  if (wasIdle) for (const listener of listeners) listener()
}

function ensureListening() {
  if (listening || typeof window === "undefined") return
  listening = true
  for (const type of ["pointerdown", "keydown", "touchstart"] as const)
    window.addEventListener(type, noteInput, { capture: true, passive: true })
}

/** When the person last tapped, clicked or typed on this page. */
export function lastUserInputAt() {
  ensureListening()
  return lastInputAt
}

/** Runs `listener` when input arrives after an idle stop. */
export function onInputAfterIdle(listener: () => void) {
  ensureListening()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isIdle(now = Date.now()) {
  return now - lastUserInputAt() > IDLE_STOP_MS
}

/** React Query `refetchInterval`: never repeat a refusal, stop when idle. */
export function boundedCheckInterval(
  error: unknown,
  milliseconds: number,
  now = Date.now(),
) {
  if (isRejectedRead(error)) return false
  return isIdle(now) ? false : milliseconds
}

/** Delay before the next open-conversation check, or null to stop. */
export function threadCheckDelay(lastChangeAt: number, now = Date.now()) {
  if (isIdle(now)) return null
  return now - lastChangeAt < THREAD_QUIET_AFTER_MS
    ? THREAD_CHECK_MS
    : THREAD_QUIET_CHECK_MS
}

/** Test helper. */
export function setLastUserInputAtForTest(at: number) {
  lastInputAt = at
}
