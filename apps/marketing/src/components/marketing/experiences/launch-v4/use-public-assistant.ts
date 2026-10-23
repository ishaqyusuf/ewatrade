"use client"
import {
  containsRegistrationProof,
  publicAssistantReply,
} from "@ewatrade/api/public-assistant-contracts"
import { useEffect, useRef, useState } from "react"

export type PublicChatMessage = {
  id: number
  role: "user" | "assistant"
  content: string
}
export function usePublicAssistant(
  onRegistration: () => void,
  onOutcome: (outcome: "answered" | "failed") => void,
) {
  const [messages, setMessages] = useState<PublicChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const current = useRef<PublicChatMessage[]>([])
  const sequence = useRef(0)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  function reset() {
    generation.current++
    controller.current?.abort()
    controller.current = null
    current.current = []
    setMessages([])
    setPending(false)
    setError("")
  }
  async function send(text: string) {
    if (controller.current || !text.trim()) return
    if (containsRegistrationProof(text)) {
      setError(
        "Enter contact details and codes in registration, where they stay out of the AI conversation.",
      )
      onRegistration()
      return
    }
    const turn = generation.current
    const abort = new AbortController()
    controller.current = abort
    const history = [
      ...current.current,
      {
        id: ++sequence.current,
        role: "user" as const,
        content: text.trim().slice(0, 1000),
      },
    ].slice(-6)
    current.current = history
    setMessages(history)
    setError("")
    setPending(true)
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
        signal: abort.signal,
      })
      const body = await response.json().catch(() => null)
      if (turn !== generation.current) return
      if (!response.ok)
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : "The assistant is unavailable. Try again.",
        )
      const parsed = publicAssistantReply.safeParse(body)
      if (!parsed.success)
        throw new Error(
          "The assistant returned an incomplete answer. Please try again.",
        )
      const result = parsed.data
      const next = [
        ...history,
        {
          id: ++sequence.current,
          role: "assistant" as const,
          content: result.reply,
        },
      ].slice(-12)
      current.current = next
      setMessages(next)
      onOutcome("answered")
      if (result.startRegistration) onRegistration()
    } catch (cause) {
      if (turn === generation.current && !abort.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message.slice(0, 220)
            : "The assistant could not connect.",
        )
        onOutcome("failed")
      }
    } finally {
      if (turn === generation.current) {
        controller.current = null
        setPending(false)
      }
    }
  }
  return { messages, pending, error, send, reset }
}
