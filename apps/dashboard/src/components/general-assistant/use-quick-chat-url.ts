"use client"
import { useQuickChatParam } from "@/hooks/use-quick-chat-param"
import { useEffect, useRef } from "react"
import type { GeneralAssistantVM } from "./general-chat"

/**
 * Keeps the widget's open chat and `?chatId=` in step. A pasted link or a
 * changed URL opens its chat; picking or starting a chat in the open widget
 * writes it to the URL (also after page navigation drops the query).
 */
export function useQuickChatUrl(vm: GeneralAssistantVM, active: boolean) {
  const [chatId, setChatId] = useQuickChatParam()
  const seen = useRef<string | null | undefined>(undefined)
  const wanted = useRef<string | null>(null)
  // URL → chat. Runs first, so the chat → URL step below waits for it.
  useEffect(() => {
    if (chatId !== seen.current) {
      seen.current = chatId
      if (chatId) wanted.current = chatId
    }
    const want = wanted.current
    if (!want) return
    if (want === vm.conversationId) {
      wanted.current = null
      return
    }
    // A reply in progress keeps its chat; the linked chat opens after it.
    if (vm.busy || vm.runId || vm.pending) return
    vm.choose(want)
  }, [chatId, vm.conversationId, vm.busy, vm.runId, vm.pending, vm.choose])
  // Chat → URL, only while the widget is open.
  useEffect(() => {
    if (!active || !vm.conversationId || wanted.current) return
    if (vm.conversationId === chatId) return
    seen.current = vm.conversationId
    void setChatId(vm.conversationId)
  }, [active, vm.conversationId, chatId, setChatId])
}
