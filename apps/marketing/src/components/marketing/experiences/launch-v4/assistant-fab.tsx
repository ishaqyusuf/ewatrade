"use client"
import {
  captureMarketingInteraction,
  marketingAttrs,
} from "@/lib/marketing-interactions"
import { useEvents } from "@ewatrade/events/client"
import {
  isSignupChatCompletion,
  signupChatDismiss,
  signupChatProgress,
  signupChatStatus,
} from "@ewatrade/onboarding/lib/signup-chat"
import { getDashboardRouteUrl } from "@ewatrade/onboarding/lib/signup-navigation"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ewatrade/ui"
import { useEffect, useId, useRef, useState } from "react"
import { WHATSAPP_START_URL } from "./cta"
import { usePublicAssistant } from "./use-public-assistant"
import "./assistant-fab.css"

function AssistantMark() {
  return (
    <span className="w-guide-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 3v-6a7.5 7.5 0 0 1 1-10.5A9 9 0 0 1 20 11.5Z" />
        <path d="M8 10h8M8 14h5" />
      </svg>
    </span>
  )
}

export function AssistantFab({
  signupEnabled,
  dark,
}: { signupEnabled: boolean; dark: boolean }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [register, setRegister] = useState(false)
  const [registrationStarted, setRegistrationStarted] = useState(false)
  const [registrationBusy, setRegistrationBusy] = useState(false)
  const [created, setCreated] = useState(false)
  const [registrationSuggested, setRegistrationSuggested] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const frame = useRef<HTMLIFrameElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const id = useId()
  const { track } = useEvents()
  const registrationUrl = getDashboardRouteUrl("/signup/chat")
  const registrationOrigin = new URL(registrationUrl).origin
  function startRegistration() {
    setRegister(true)
    setRegistrationStarted(true)
    captureMarketingInteraction(track, {
      action: "registration_start",
      channel: "assistant_fab",
      category: "setup",
    })
  }
  const chat = usePublicAssistant(
    () => setRegistrationSuggested(true),
    (outcome) =>
      captureMarketingInteraction(track, {
        action: outcome === "answered" ? "assistant_answer" : "assistant_error",
        channel: "assistant_fab",
      }),
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: Scroll on new messages and reopening, while leaving verification controls isolated.
  useEffect(() => {
    if (open && !register)
      log.current?.scrollTo({
        top: log.current.scrollHeight,
        behavior: "instant",
      })
  }, [chat.messages, chat.pending, chat.error, open, register])
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== registrationOrigin ||
        !frame.current?.contentWindow ||
        event.source !== frame.current.contentWindow
      )
        return
      if (
        isSignupChatCompletion(
          event,
          registrationOrigin,
          frame.current.contentWindow,
        )
      )
        setCreated(true)
      if (signupChatDismiss.safeParse(event.data).success) {
        setOpen(false)
        captureMarketingInteraction(track, {
          action: "chat_close",
          channel: "assistant_fab",
        })
      }
      const progress = signupChatProgress.safeParse(event.data)
      if (progress.success)
        captureMarketingInteraction(track, {
          action: `registration_${progress.data.action}`,
          channel: "assistant_fab",
          category: "setup",
        })
      const status = signupChatStatus.safeParse(event.data)
      if (status.success) setRegistrationBusy(status.data.pending)
    }
    window.addEventListener("message", receive)
    return () => window.removeEventListener("message", receive)
  }, [registrationOrigin, track])
  function changeOpen(value: boolean) {
    setOpen(value)
    captureMarketingInteraction(track, {
      action: value ? "chat_open" : "chat_close",
      channel: "assistant_fab",
    })
  }
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        className="w-guide-fab"
        aria-label="Open EwaTrade assistant"
        data-marketing-control="chat_visibility"
      >
        <AssistantMark />
        <span className="w-guide-fab-label">Ask EwaTrade</span>
      </PopoverTrigger>
      <PopoverContent
        keepMounted
        side="top"
        align="end"
        sideOffset={12}
        className="launch-v4 w-guide-panel"
        data-theme={dark ? "dark" : "light"}
      >
        <header className="w-guide-head">
          <AssistantMark />
          <div className="w-guide-heading">
            <PopoverTitle>EwaTrade Assistant</PopoverTitle>
            <PopoverDescription>
              Questions to your first business
            </PopoverDescription>
          </div>
          <button
            className="w-guide-icon"
            type="button"
            aria-label="Reset assistant chat"
            disabled={registrationBusy || register}
            onClick={() => {
              chat.reset()
              setMessage("")
              setRegister(false)
              setRegistrationStarted(false)
              setCreated(false)
              setRegistrationSuggested(false)
              setAttempt((value) => value + 1)
            }}
            {...marketingAttrs("reset", "assistant_fab")}
          >
            ↶
          </button>
          <button
            className="w-guide-icon"
            type="button"
            aria-label="Close assistant chat"
            data-marketing-control="chat_visibility"
            onClick={() => changeOpen(false)}
          >
            ×
          </button>
        </header>
        <div
          ref={log}
          className="w-guide-log"
          hidden={register}
          role="log"
          aria-live="polite"
          aria-label="Website assistant conversation"
        >
          <p className="w-guide-welcome">
            Your business starts with a conversation
          </p>
          <p className="w-guide-message">
            Hi! Ask me about EwaTrade or let’s register your business here.
            Verification and your final confirmation stay in this chat.
          </p>
          {chat.messages.map((item) => (
            <p
              key={item.id}
              className={`w-guide-message${item.role === "user" ? " w-guide-message--you" : ""}`}
            >
              <span className="ew-sr">
                {item.role === "user" ? "You: " : "Assistant: "}
              </span>
              {item.content}
            </p>
          ))}
          {chat.pending && (
            <output className="w-guide-message">Thinking…</output>
          )}
          {chat.error && (
            <p className="w-guide-message" role="alert">
              {chat.error}
            </p>
          )}
          <div className="w-guide-choices">
            <button
              type="button"
              className="w-guide-choice"
              onClick={startRegistration}
              data-marketing-control="registration"
            >
              {created
                ? "View your registration"
                : registrationSuggested
                  ? "Continue registration here"
                  : "Register my business"}
            </button>
            {[
              "What can EwaTrade do for my business?",
              "Explain the pricing plans",
            ].map((text) => (
              <button
                key={text}
                type="button"
                className="w-guide-choice"
                disabled={chat.pending}
                onClick={() => {
                  void chat.send(text)
                  captureMarketingInteraction(track, {
                    action: "assistant_message",
                    channel: "assistant_fab",
                  })
                }}
                data-marketing-control="assistant_question"
              >
                {text}
              </button>
            ))}
            <a
              className="w-guide-choice"
              href={WHATSAPP_START_URL}
              target="_blank"
              rel="noopener noreferrer"
              {...marketingAttrs("whatsapp", "assistant_fab", "whatsapp")}
            >
              Use WhatsApp ↗
            </a>
          </div>
          {!signupEnabled && (
            <p>
              Public signup may be unavailable; registration checks the current
              status before continuing.
            </p>
          )}
        </div>
        <div className="w-guide-registration" hidden={!register}>
          {registrationStarted && (
            <iframe
              key={attempt}
              ref={frame}
              src={registrationUrl}
              title="Secure business registration inside assistant chat"
              className="w-guide-registration-frame"
              referrerPolicy="no-referrer"
            />
          )}
          <button
            className="w-guide-choice"
            type="button"
            disabled={registrationBusy}
            onClick={() => setRegister(false)}
            {...marketingAttrs("return_chat", "assistant_fab", "setup")}
          >
            Back to questions
          </button>
        </div>
        <form
          className="w-guide-compose"
          hidden={register}
          onSubmit={(event) => {
            event.preventDefault()
            if (!message.trim() || chat.pending) return
            void chat.send(message)
            setMessage("")
            captureMarketingInteraction(track, {
              action: "assistant_message",
              channel: "assistant_fab",
            })
          }}
        >
          <label htmlFor={id} className="ew-sr">
            Ask the website assistant
          </label>
          <input
            id={id}
            className="w-guide-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask a question or start your business…"
            maxLength={1000}
            autoComplete="off"
            disabled={chat.pending}
          />
          <button
            className="w-guide-send"
            type="submit"
            aria-label="Send to website assistant"
            disabled={!message.trim() || chat.pending}
            data-marketing-submit="assistant"
          >
            ↑
          </button>
        </form>
        <p className="w-guide-foot">
          AI answers · Verification details stay out of the AI conversation.
        </p>
      </PopoverContent>
    </Popover>
  )
}
