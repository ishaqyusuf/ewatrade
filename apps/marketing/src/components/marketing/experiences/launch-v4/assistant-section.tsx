"use client"
import {
  type ConversationId,
  conversationIds,
} from "@/lib/marketing-conversations"
import { marketingAttrs } from "@/lib/marketing-interactions"
import { useId, useRef, useState } from "react"
import { ChatDemo } from "./chat-demo"
import { WhatsAppCta } from "./cta"

const descriptions = {
  setup: [
    "Draft, then review",
    "Set up my business. I sell eggs and broilers.",
    "Tell it about your business in your own words. It asks for what’s missing and drafts your setup and catalog for you to review.",
  ],
  sales: [
    "Answered in chat",
    "How are sales today? Anything running low?",
    "Sales, orders, low stock and who owes you, straight from your records.",
  ],
  product: [
    "Draft, then review",
    "Add smoked catfish to my catalog.",
    "It asks for anything missing, like the price or the unit, then prepares a draft for you.",
  ],
  money: [
    "Draft, then review",
    "Received ₦7,500 from Mr Okon for manure.",
    "Recorded as a simple sale: money received, with your description. It doesn’t change stock.",
  ],
}
export function AssistantSection() {
  const [scenario, setScenario] = useState<ConversationId>("setup")
  const tabs = useRef<HTMLDivElement>(null)
  const uid = useId()
  return (
    <section className="gg-sec w-ai" id="assistant" aria-labelledby="ai-h">
      <div className="gg-wrap">
        <p className="w-kicker">
          <span className="w-kdot" aria-hidden="true" />
          Your assistant, on the web and on WhatsApp
        </p>
        <h2 className="w-ai-h" id="ai-h">
          <span className="w-ai-l1">Your AI assistant.</span>
          <span className="w-ai-l2">
            Your business, run from <em>WhatsApp.</em>
          </span>
        </h2>
        <div className="w-ai-intro">
          <p className="w-ai-lead">
            Ask how today is going, what’s running low or who owes you, and get
            the answer right in the chat. Draft a product or record money
            received in your own words. Every change comes back to you first.
          </p>
          <p className="w-ai-ambition">
            We’re building towards running your whole business from one chat.
            Today, answers stay in WhatsApp and changes open a secure review in
            ẸwáTrade.
          </p>
        </div>
        <div className="w-ai-grid">
          <div className="w-ai-stage">
            <img
              className="gg-wm"
              src="/brand/ewatrade-mark-precision-rise-v1-reverse.svg"
              alt=""
            />
            <div
              className="w-ai-chat"
              role="tabpanel"
              id={`${uid}-panel`}
              aria-labelledby={`${uid}-${scenario}`}
            >
              <ChatDemo scenario={scenario} onScenarioChange={setScenario} />
            </div>
          </div>
          <div className="w-ai-side">
            <h3 className="w-ai-side-h">Try a conversation</h3>
            <div
              ref={tabs}
              className="w-uses"
              role="tablist"
              aria-label="Sample conversations"
              aria-orientation="vertical"
            >
              {conversationIds.map((key, index) => (
                <button
                  className="w-use"
                  type="button"
                  role="tab"
                  key={key}
                  id={`${uid}-${key}`}
                  aria-controls={`${uid}-panel`}
                  aria-selected={scenario === key}
                  tabIndex={scenario === key ? 0 : -1}
                  {...marketingAttrs("conversation", "assistant", key)}
                  onClick={() => setScenario(key)}
                  onKeyDown={(event) => {
                    if (
                      ![
                        "ArrowUp",
                        "ArrowDown",
                        "ArrowLeft",
                        "ArrowRight",
                        "Home",
                        "End",
                      ].includes(event.key)
                    )
                      return
                    event.preventDefault()
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 3
                          : (index +
                              (event.key === "ArrowUp" ||
                              event.key === "ArrowLeft"
                                ? 3
                                : 1)) %
                            4
                    const button =
                      tabs.current?.querySelectorAll<HTMLButtonElement>(
                        "button",
                      )[next]
                    button?.focus()
                    button?.click()
                  }}
                >
                  <span
                    className={`w-use-tag ${key === "sales" ? "t-mint" : "t-amber"}`}
                  >
                    {descriptions[key][0]}
                  </span>
                  <span className="w-use-q">“{descriptions[key][1]}”</span>
                  <span className="w-use-p">{descriptions[key][2]}</span>
                </button>
              ))}
            </div>
            <div className="w-flow">
              <h3>Review changes before they are saved</h3>
              <ol>
                <li>
                  <b>Ask in WhatsApp</b>
                  <span>In your own words.</span>
                </li>
                <li>
                  <b>Review in ẸwáTrade</b>
                  <span>A secure link opens the draft.</span>
                </li>
                <li>
                  <b>Confirm</b>
                  <span>Only then is it saved.</span>
                </li>
              </ol>
            </div>
            <p className="w-ai-note">
              This chat is between you and your business. Sending messages to
              your customers is a separate feature on Growth and Pro.
            </p>
            <div className="w-ai-cta">
              <WhatsAppCta channel="assistant" paper />
              <p>
                Say hello and your assistant guides setup in the chat. Account
                checks stay in place, and every change still comes back to you
                to review and confirm.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
