"use client"

import { useTRPC } from "@/trpc/client"
import { useChat } from "@ai-sdk/react"
import {
  SETUP_QUICK_PROMPTS,
  type SetupAssistantDataParts,
} from "@ewatrade/assistant/setup/messages"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@ewatrade/ui"
import { ArrowUp02Icon, StopIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useEffect, useMemo, useRef, useState } from "react"
import { StickToBottom } from "use-stick-to-bottom"
import { SetupMessage } from "./setup-message"

type SetupChatMessage = UIMessage<never, SetupAssistantDataParts>

const ERROR_COPY: Record<string, string> = {
  BUDGET_EXHAUSTED:
    "You've used this business's setup assistant allowance. Your setup list is still here to finish.",
  ASSISTANT_UNAVAILABLE:
    "The assistant is unavailable right now. You can keep editing your list or set things up yourself.",
  REQUEST_REPLAYED: "That message was already sent. Refresh to see the reply.",
}

function readableError(error: Error | undefined) {
  if (!error) return null
  try {
    const body = JSON.parse(error.message) as { code?: string; error?: string }
    return (body.code && ERROR_COPY[body.code]) ?? body.error ?? null
  } catch {
    return "Something went wrong. Your setup list is safe, please try again."
  }
}

export function SetupChat({
  conversationId,
  status,
  initialMessages,
  offerPending,
  onBegin,
  onSkip,
}: {
  conversationId: string
  status: "OFFERED" | "ACTIVE"
  initialMessages: SetupChatMessage[]
  offerPending: boolean
  onBegin: () => void
  onSkip: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const refreshDraft = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.setupAssistant.state.queryKey(),
    })

  const transport = useMemo(
    () =>
      new DefaultChatTransport<SetupChatMessage>({
        api: "/api/assistant/chat",
        credentials: "same-origin",
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages.at(-1)
          return {
            body: {
              conversationId,
              requestId: `req_${last?.id ?? crypto.randomUUID()}`,
              message: {
                id: last?.id,
                role: "user",
                parts: (last?.parts ?? []).filter(
                  (part) => part.type === "text",
                ),
              },
            },
          }
        },
      }),
    [conversationId],
  )

  const chat = useChat<SetupChatMessage>({
    id: conversationId,
    messages: initialMessages,
    transport,
    onData: (part) => {
      if (part.type === "data-setup-draft") void refreshDraft()
    },
    onFinish: () => void refreshDraft(),
  })
  const { setMessages } = chat

  // Server-authored messages (the begin prompt) arrive through the state query.
  useEffect(() => {
    if (
      chat.status === "ready" &&
      initialMessages.length > chat.messages.length
    )
      setMessages(initialMessages)
  }, [initialMessages, chat.status, chat.messages.length, setMessages])

  useEffect(() => {
    if (status === "ACTIVE") inputRef.current?.focus()
  }, [status])

  const busy = chat.status === "submitted" || chat.status === "streaming"
  const canType = status === "ACTIVE"
  const send = (text: string) => {
    const value = text.trim()
    if (!value || busy || !canType) return
    void chat.sendMessage({ text: value })
    setInput("")
  }
  const error = readableError(chat.error)
  const last = chat.messages.at(-1)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StickToBottom
        className="relative min-h-0 flex-1 overflow-y-auto"
        initial="instant"
        resize="smooth"
        role="log"
      >
        <StickToBottom.Content className="flex flex-col gap-5 px-4 py-6 sm:px-6">
          {chat.messages.map((message) => (
            <SetupMessage
              key={message.id}
              message={message}
              streaming={busy && message.id === last?.id}
              offer={{
                offerOpen: status === "OFFERED",
                pending: offerPending,
                onBegin,
                onSkip,
              }}
            />
          ))}
          {chat.status === "submitted" ? (
            <p className="animate-pulse pl-10 text-xs text-muted-foreground">
              Thinking…
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="pl-10 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </StickToBottom.Content>
      </StickToBottom>

      {canType ? (
        <div className="border-t border-border px-4 py-3 sm:px-6">
          {chat.messages.every((message) => message.role !== "user") ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {SETUP_QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    setInput(`${prompt.replace("…", "")}\n`)
                    inputRef.current?.focus()
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              send(input)
            }}
          >
            <InputGroup>
              <InputGroupTextarea
                ref={inputRef}
                aria-label="Tell the assistant about your business"
                placeholder="Tell me what you sell, your prices and how many you have…"
                rows={2}
                maxLength={8000}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    send(input)
                  }
                }}
              />
              <InputGroupAddon align="block-end" className="justify-end">
                {busy ? (
                  <InputGroupButton
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="Stop"
                    onClick={() => void chat.stop()}
                  >
                    <HugeiconsIcon icon={StopIcon} className="size-4" />
                  </InputGroupButton>
                ) : (
                  <InputGroupButton
                    type="submit"
                    size="icon-sm"
                    variant="default"
                    aria-label="Send"
                    disabled={!input.trim()}
                  >
                    <HugeiconsIcon icon={ArrowUp02Icon} className="size-4" />
                  </InputGroupButton>
                )}
              </InputGroupAddon>
            </InputGroup>
          </form>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Nothing is added to your business until you confirm it. The
            assistant can make mistakes, so check each record.
          </p>
        </div>
      ) : null}
    </div>
  )
}
