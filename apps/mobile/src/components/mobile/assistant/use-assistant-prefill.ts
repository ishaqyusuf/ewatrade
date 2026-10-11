import { useLocalSearchParams } from "expo-router"
import { type RefObject, useEffect, useRef } from "react"
import type { TextInput } from "react-native"

/**
 * When the screen opened with a `draft` (e.g. "For order ORD-020:\n"), focus the
 * composer once it can type and put the cursor after the prefilled text.
 */
export function useAssistantPrefillFocus(
  input: RefObject<TextInput | null>,
  draft: string,
  ready: boolean,
) {
  const { draft: handedOver } = useLocalSearchParams<{ draft?: string }>()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !ready || typeof handedOver !== "string" || !draft)
      return
    done.current = true
    const frame = requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelection(draft.length, draft.length)
    })
    return () => cancelAnimationFrame(frame)
  }, [draft, handedOver, input, ready])
}
