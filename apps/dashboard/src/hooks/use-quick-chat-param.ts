"use client"
import { parseAsString, useQueryState } from "nuqs"

/**
 * `?chatId=` — the chat open in the quick assistant widget, on any dashboard
 * page. Replaces the history entry, so switching chats doesn't fill Back.
 */
export function useQuickChatParam() {
  return useQueryState(
    "chatId",
    parseAsString.withOptions({ history: "replace", scroll: false }),
  )
}
