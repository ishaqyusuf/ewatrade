export type SavedMessageState = "composed" | "missing" | "disabled"
export type SavedMessageScope = "business" | "store" | null

/** Text status for saved wording; colour is never the only signal. */
export function savedMessageLabel(
  state: SavedMessageState,
  scope: SavedMessageScope,
) {
  if (state === "missing") return "Not written"
  if (state === "disabled")
    return scope === "store" ? "Off at this store" : "Off"
  return scope === "store" ? "Own message" : "Ready"
}

/** One Settings row: what this view sends for the event. */
export type SavedMessageRowState =
  | "missing"
  | "ready"
  | "off"
  | "own"
  | "ownoff"
  | "inherit"
  | "inheritoff"

export const SAVED_MESSAGE_ROW: Record<
  SavedMessageRowState,
  { label: string; tone: SavedMessageState }
> = {
  missing: { label: "Not written", tone: "missing" },
  ready: { label: "Ready", tone: "composed" },
  off: { label: "Off", tone: "disabled" },
  own: { label: "Own message", tone: "composed" },
  ownoff: { label: "Off at this store", tone: "disabled" },
  inherit: { label: "Business message", tone: "composed" },
  inheritoff: { label: "Off", tone: "disabled" },
}

export const SAVED_MESSAGE_TONE: Record<SavedMessageState, string> = {
  composed:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent",
  missing: "bg-muted text-muted-foreground border-transparent",
  disabled:
    "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent",
}

export const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly" },
  { value: "short", label: "Short" },
  { value: "professional", label: "Professional" },
] as const

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "pcm", label: "Pidgin" },
] as const

export type MessageTone = (typeof TONE_OPTIONS)[number]["value"]
export type MessageLanguage = (typeof LANGUAGE_OPTIONS)[number]["value"]

/** A tRPC CONFLICT means someone saved first; keep the typed text. */
export function saveFailureText(failure: unknown) {
  const code =
    failure && typeof failure === "object" && "data" in failure
      ? (failure as { data?: { code?: string } }).data?.code
      : undefined
  if (code === "CONFLICT")
    return "Someone else changed this message. Reload to see it, then save again. Your text is kept here."
  return failure instanceof Error
    ? failure.message
    : "This message wasn’t saved. Try again."
}

/**
 * A failed background refresh keeps what's on screen (and any typed text);
 * lost access or a vanished record hides it.
 */
export function hidesCachedData(failure: unknown) {
  const code =
    failure && typeof failure === "object" && "data" in failure
      ? (failure as { data?: { code?: string } }).data?.code
      : undefined
  return code === "FORBIDDEN" || code === "UNAUTHORIZED" || code === "NOT_FOUND"
}
