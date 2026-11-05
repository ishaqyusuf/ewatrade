"use client"
import { marketingAttrs } from "@/lib/marketing-interactions"
import { useState } from "react"
import { WHATSAPP_START_URL } from "./cta"
import { BrandMark, Icon, WhatsAppMark } from "./icons"
import {
  useMarketingMotion,
  useMarketingSequence,
} from "./use-marketing-motion"

const durations = [700, 1000, 2000, 0] as const
export function WhatsAppV15() {
  const motion = useMarketingMotion(0.2)
  const sequence = useMarketingSequence(durations, motion.active)
  const phase = motion.reduced ? 3 : sequence.index
  const [note, setNote] = useState("")
  return (
    <section
      className="whatsapp-launch"
      id="assistant"
      ref={motion.ref}
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("[data-watch-chat]")) {
          setNote("")
          sequence.restart()
        }
      }}
    >
      <div className="launch-layout wrap">
        <div className="launch-copy">
          <h2>
            Your business. <br />
            On <span>WhatsApp.</span>
          </h2>
          <div className="launch-argument">
            <h3>
              Turn a message <br />
              into an order draft.
            </h3>
            <p>
              Tell EwaTrade what you sold. It prepares the order with the
              customer, items and amount, ready for you to review.
            </p>
          </div>
          <div className="launch-actions">
            <a
              className="button launch-primary"
              href={WHATSAPP_START_URL}
              target="_blank"
              rel="noopener noreferrer"
              {...marketingAttrs("whatsapp", "assistant", "whatsapp")}
            >
              <WhatsAppMark className="whatsapp-mark" />
              Start on WhatsApp
              <span className="ew-sr"> (opens in a new tab)</span>
            </a>
            <a
              className="launch-watch"
              href="#whatsapp-demo"
              data-watch-chat=""
              {...marketingAttrs("conversation", "assistant", "whatsapp")}
            >
              Watch the conversation <Icon name="arrowRight" />
            </a>
          </div>
          <p className="launch-approval">
            You check the details. You decide what gets saved.
          </p>
        </div>
        <figure className="chat-proof" id="whatsapp-demo">
          <div
            className="whatsapp-window"
            data-playback={
              motion.active && sequence.playing ? "playing" : "paused"
            }
          >
            <div className="wa-status">
              <strong>9:41</strong>
              <span>▮▮▮ ▰</span>
            </div>
            <div className="wa-title">
              <Icon name="chevronLeft" />
              <span className="wa-logo">
                <BrandMark />
              </span>
              <div>
                <strong>EwaTrade</strong>
                <small id="wa-presence">
                  {phase === 2 ? "typing…" : "Business account"}
                </small>
              </div>
              <Icon name="more" />
            </div>
            <div
              className="wa-conversation"
              aria-label="WhatsApp draft-review demonstration"
            >
              <span className="wa-day">TODAY</span>
              <div
                className="wa-message wa-out"
                data-chat-step="0"
                hidden={phase < 1}
              >
                <p>
                  Draft 4 Small crates of eggs for Jawdah QA Customer, ₦4,500
                  each + ₦1,500 service charge.
                </p>
                <small>
                  10:12 <span>✓✓</span>
                </small>
              </div>
              <div
                className="wa-typing"
                aria-label="EwaTrade is typing"
                hidden={phase !== 2}
              >
                <i />
                <i />
                <i />
              </div>
              <div
                className="wa-message wa-in"
                data-chat-step="1"
                hidden={phase < 3}
              >
                <p>🧾 Draft ready for Jawdah Poultry QA · Jawdah Poultry QA.</p>
                <p>Order draft: ₦19,500.00 Jawdah QA Customer</p>
                <p>
                  Review draft: <br />
                  <button
                    className="wa-review-link"
                    id="wa-review"
                    {...marketingAttrs("review", "assistant", "whatsapp")}
                    onClick={() =>
                      setNote(
                        "In EwaTrade, this opens your signed-in draft review. This is an example; nothing is saved.",
                      )
                    }
                    type="button"
                  >
                    dash.ewatrade.com/r/…
                  </button>
                </p>
                <p>
                  Expires in 15 minutes. Nothing is saved until you approve it.
                </p>
                <small>10:12</small>
                <button
                  className="wa-cancel"
                  id="wa-cancel"
                  {...marketingAttrs("cancel_review", "assistant", "whatsapp")}
                  onClick={() =>
                    setNote(
                      "In WhatsApp, Cancel draft cancels the pending draft. This example sends no message.",
                    )
                  }
                  type="button"
                >
                  Cancel draft
                </button>
              </div>
            </div>
            <div className="wa-compose">
              <span>
                <Icon name="plus" />
              </span>
              <div>
                Message <span>☺</span>
              </div>
              <Icon name="mic" />
            </div>
            <div className="wa-home" aria-hidden="true" />
          </div>
          <p id="wa-review-note" className="wa-review-note" hidden={!note}>
            {note}
          </p>
        </figure>
        <ol className="launch-sequence">
          <li>
            <span>1</span>
            <div>
              <strong>Say what you need.</strong>
              <p>Use your own words, in a chat you already know.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Get a draft to review.</strong>
              <p>Check the customer, quantities and amount.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Make it official.</strong>
              <p>Open EwaTrade and approve when it looks right.</p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  )
}
