import { useLocalSearchParams } from "expo-router"
import { type RefObject, useEffect, useRef } from "react"
import type { TextInput } from "react-native"

/**
 * When the screen opened with a `draft` (e.g. "For order ORD-020:\n"), focus the
 * composer once it can type and put the cursor after the prefilled text.
 * `focus=1` (Home's Ask bar) focuses the empty composer the same way.
 */
export function useAssistantPrefillFocus(
  input: RefObject<TextInput | null>,
  draft: string,
  ready: boolean,
) {
  const { draft: handedOver, focus } = useLocalSearchParams<{
    draft?: string
    focus?: string
  }>()
  const focusEmpty = focus === "1"
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !ready) return
    if (!focusEmpty && (typeof handedOver !== "string" || !draft)) return
    // Android ignores focus while the screen is still sliding in.
    const timer = setTimeout(() => {
      done.current = true
      input.current?.focus()
      input.current?.setSelection(draft.length, draft.length)
    }, 450)
    return () => clearTimeout(timer)
  }, [draft, focusEmpty, handedOver, input, ready])
}

/**
 * When the screen opened with `send` (a Home suggestion chip), ask that
 * question once, as soon as the assistant can take it.
 */
export function useAssistantStarterQuestion(
  ask: (question: string) => unknown,
  ready: boolean,
) {
  const { send } = useLocalSearchParams<{ send?: string }>()
  const done = useRef(false)
  const question = typeof send === "string" ? send.trim().slice(0, 160) : ""
  useEffect(() => {
    if (done.current || !ready || !question) return
    done.current = true
    void ask(question)
  }, [ask, question, ready])
}
