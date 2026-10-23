"use client"
import {
  type ConversationId,
  type DemoConversation,
  SAMPLE_BUSINESS,
  answerConversation,
  confirmConversation,
  conversationIds,
  conversationLabels,
  sampleMoney,
  startConversation,
} from "@/lib/marketing-conversations"
import {
  type MarketingChannel,
  captureMarketingInteraction,
  marketingAttrs,
} from "@/lib/marketing-interactions"
import { useEvents } from "@ewatrade/events/client"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ewatrade/ui"
import { useEffect, useId, useRef, useState } from "react"

export function ChatDemo({
  scenario,
  onScenarioChange,
  picks = false,
  channel = "assistant",
}: {
  scenario: ConversationId
  onScenarioChange: (id: ConversationId) => void
  picks?: boolean
  channel?: MarketingChannel
}) {
  const [conversations, setConversations] = useState<
    Partial<Record<ConversationId, DemoConversation>>
  >({})
  const [drafts, setDrafts] = useState<Partial<Record<ConversationId, string>>>(
    {},
  )
  const message = drafts[scenario] ?? ""
  const setMessage = (value: string) =>
    setDrafts((prev) => ({ ...prev, [scenario]: value }))
  const [review, setReview] = useState(false)
  const [reviewTheme, setReviewTheme] = useState<string>()
  const [confirmed, setConfirmed] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const id = useId()
  const { track } = useEvents()
  const current = conversations[scenario] ?? startConversation(scenario)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Scroll when a message is appended or the conversation changes.
  useEffect(() => {
    log.current?.scrollTo({
      top: log.current.scrollHeight,
      behavior: "instant",
    })
  }, [current.messages.length, scenario])
  const answer = (value: string) =>
    setConversations((prev) => ({
      ...prev,
      [scenario]: answerConversation(
        scenario,
        prev[scenario] ?? startConversation(scenario),
        value,
        prev.money?.stage === "saved" ? 192000 : 184500,
      ),
    }))
  const reset = () => {
    setConversations({})
    setDrafts({})
    setReview(false)
    setConfirmed(false)
    onScenarioChange("setup")
  }
  const choices =
    current.stage !== "question"
      ? []
      : scenario === "setup"
        ? ["120 crates, 40 birds", "I’ll count later"]
        : scenario === "product"
          ? ["₦4,500 per piece", "₦12,000 per pack of 3"]
          : []
  return (
    <div ref={root} className={`wa wa--${picks ? "hero" : "lg"}`}>
      <div className="wa-top">
        <span className="wa-av" aria-hidden="true">
          <img
            src="/brand/ewatrade-mark-precision-rise-v1-reverse.svg"
            alt=""
          />
        </span>
        <span className="wa-id">
          <b>ẸwáTrade Assistant</b>
          <small>{SAMPLE_BUSINESS}</small>
        </span>
        <button
          className="wa-icon"
          type="button"
          aria-label="Reset conversation"
          onClick={reset}
          {...marketingAttrs("reset", channel, scenario)}
        >
          ↶
        </button>
      </div>
      <div
        ref={log}
        className="wa-log"
        role="log"
        aria-live="polite"
        aria-label="Sample conversation with the ẸwáTrade Assistant"
      >
        <p className="wa-day">Today</p>
        <p className="wa-note">Illustrative conversation · sample data</p>
        {current.messages.map((m, index) =>
          m.from === "sys" ? (
            <p key={m.id} className="wa-sys">
              {m.text}
            </p>
          ) : (
            <div className={`wa-msg wa-msg--${m.from}`} key={m.id}>
              <div className="wa-bub">
                <p className="wa-txt">
                  <span className="ew-sr">
                    {m.from === "me" ? "You: " : "Assistant: "}
                  </span>
                  {m.text}
                </p>
                <span className="wa-meta">
                  10:{index % 2 === 0 ? "14" : "15"}
                  {m.from === "me" && (
                    <span className="wa-ticks" aria-hidden="true">
                      ✓✓
                    </span>
                  )}
                </span>
              </div>
            </div>
          ),
        )}
        {scenario === "sales" && (
          <div className="wa-msg wa-msg--it">
            <div className="wa-bub">
              <div className="wa-card">
                <b>Today at a glance</b>
                <dl>
                  {[
                    [
                      "Sales",
                      sampleMoney(
                        conversations.money?.stage === "saved"
                          ? 192000
                          : 184500,
                      ),
                    ],
                    ["Orders", "23"],
                    ["Owed by customers", "₦42,000"],
                    ["Layer feed", "Low · 6 bags"],
                  ].map(([label, value]) => (
                    <div className="wa-row" key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <button
              className="wa-act"
              type="button"
              onClick={() => answer("Who owes me?")}
              {...marketingAttrs("reply", channel, "sales")}
            >
              Who owes me?
            </button>
          </div>
        )}
        {choices.length > 0 && (
          <div className="wa-msg wa-msg--it">
            <div className="wa-acts">
              {choices.map((choice, choiceIndex) => (
                <button
                  className="wa-act"
                  type="button"
                  key={choice}
                  onClick={() => answer(choice)}
                  {...marketingAttrs(
                    "reply",
                    channel,
                    scenario,
                    scenario === "setup"
                      ? choiceIndex === 0
                        ? "stock_now"
                        : "count_later"
                      : choiceIndex === 0
                        ? "price_piece"
                        : "price_pack",
                  )}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
        )}
        {current.draft && (
          <div className="wa-msg wa-msg--it">
            <div className="wa-bub">
              <div className="wa-card">
                <div className="wa-card-top">
                  <b>{current.draft.title}</b>
                  <span
                    className={`ew-pill ${current.stage === "saved" ? "t-mint" : "t-amber"}`}
                  >
                    {current.stage === "saved"
                      ? "Sample saved"
                      : "Draft · not saved"}
                  </span>
                </div>
                <dl>
                  {current.draft.rows.map(([label, value]) => (
                    <div className="wa-row" key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            {current.stage === "draft" && (
              <button
                className="wa-act"
                type="button"
                {...marketingAttrs("review", channel, scenario)}
                onClick={() => {
                  setReviewTheme(
                    root.current
                      ?.closest(".launch-v4")
                      ?.getAttribute("data-theme") ?? undefined,
                  )
                  setConfirmed(false)
                  setReview(true)
                }}
              >
                Review changes ↗
              </button>
            )}
          </div>
        )}
      </div>
      {picks && (
        <fieldset className="wa-picks" aria-label="Try a conversation">
          {conversationIds.map((key) => (
            <button
              className="wa-pick"
              type="button"
              key={key}
              aria-pressed={scenario === key}
              onClick={() => {
                onScenarioChange(key)
              }}
              {...marketingAttrs("conversation", channel, key)}
            >
              {conversationLabels[key]}
            </button>
          ))}
        </fieldset>
      )}
      <form
        className="wa-compose"
        onSubmit={(e) => {
          e.preventDefault()
          if (!message.trim()) return
          answer(message.trim())
          setMessage("")
          captureMarketingInteraction(track, {
            action: "send_sample",
            channel,
            category: scenario,
          })
        }}
      >
        <label className="ew-sr" htmlFor={id}>
          Message your assistant
        </label>
        <input
          id={id}
          className="wa-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={160}
          placeholder="Message"
          autoComplete="off"
        />
        <button
          className="wa-send"
          type="submit"
          aria-label="Send sample message"
          disabled={!message.trim()}
          data-marketing-submit="sample"
        >
          ➤
        </button>
      </form>
      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent
          hideClose
          className="launch-v4 w-chat-review"
          data-theme={reviewTheme}
        >
          <div className="w-rv-body">
            <DialogClose
              className="w-rv-close"
              aria-label="Close sample review"
              {...marketingAttrs("cancel_review", channel, scenario)}
            >
              ×
            </DialogClose>
            <p className="w-rv-eyebrow">Secure review · illustrative sample</p>
            <DialogTitle className="gg-h2">
              {confirmed
                ? "Sample change confirmed"
                : `Review ${
                    scenario === "setup"
                      ? "business setup"
                      : current.draft?.title
                  }`}
            </DialogTitle>
            <DialogDescription>
              {confirmed
                ? "This demo does not change a real business or send a WhatsApp message."
                : "Signed in as Owner · Al-Jawdah Agro-Biz. Nothing is saved until you confirm."}
            </DialogDescription>
            <dl className="w-rv-rows">
              {current.draft?.rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="gg-ctas">
              {confirmed ? (
                <DialogClose
                  className="gg-btn gg-btn--green"
                  {...marketingAttrs("return_chat", channel, scenario)}
                >
                  Back to WhatsApp
                </DialogClose>
              ) : (
                <>
                  <button
                    className="gg-btn gg-btn--green"
                    type="button"
                    {...marketingAttrs("confirm_sample", channel, scenario)}
                    onClick={() => {
                      setConversations((prev) => ({
                        ...prev,
                        [scenario]: confirmConversation(
                          prev[scenario] ?? startConversation(scenario),
                        ),
                      }))
                      setConfirmed(true)
                    }}
                  >
                    Confirm and save sample
                  </button>
                  <DialogClose
                    className="gg-btn gg-btn--line"
                    {...marketingAttrs("cancel_review", channel, scenario)}
                  >
                    Back to chat
                  </DialogClose>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
