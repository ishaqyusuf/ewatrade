"use client"
import { marketingAttrs } from "@/lib/marketing-interactions"
import { useState } from "react"
import { TELEGRAM_START_URL } from "./cta"
import { BrandMark, Icon, TelegramMark } from "./icons"
import {
  useMarketingMotion,
  useMarketingSequence,
} from "./use-marketing-motion"

const durations = [700, 1000, 1800, 0] as const
const notes = {
  unpaid:
    "In Telegram, this lists the unpaid orders in the same message. This is an example; nothing is sent.",
  week: "In Telegram, this switches the same message to this week’s sales. This is an example; nothing is sent.",
} as const

/** The WhatsApp band mirrored: phone left, copy right, a read instead of a draft. */
export function TelegramV15() {
  const motion = useMarketingMotion(0.2)
  const sequence = useMarketingSequence(durations, motion.active)
  const phase = motion.reduced ? 3 : sequence.index
  const [note, setNote] = useState("")
  return (
    <section
      className="tg-launch"
      id="telegram"
      ref={motion.ref}
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("[data-watch-tg]")) {
          setNote("")
          sequence.restart()
        }
      }}
    >
      <div className="tg-layout wrap">
        <figure className="tg-proof" id="telegram-demo">
          <div className="tg-window">
            <div className="tg-status">
              <strong>6:40</strong>
              <span>▮▮▮ ▰</span>
            </div>
            <div className="tg-bar">
              <Icon name="chevronLeft" />
              <span className="tg-avatar">
                <BrandMark />
              </span>
              <div>
                <strong>EwaTrade</strong>
                <small>{phase === 2 ? "typing…" : "bot"}</small>
              </div>
              <Icon name="more" />
            </div>
            <div
              className="tg-wall"
              aria-label="Telegram question demonstration"
            >
              <span className="tg-date">Today</span>
              <div className="tg-msg tg-out" hidden={phase < 1}>
                <p>
                  How did we do today?
                  <span className="tg-meta">
                    6:40 PM <i>✓✓</i>
                  </span>
                </p>
              </div>
              <div
                className="tg-msg tg-in tg-typing"
                aria-label="EwaTrade is typing"
                hidden={phase !== 2}
              >
                <i />
                <i />
                <i />
              </div>
              <div className="tg-group" hidden={phase < 3}>
                <div className="tg-msg tg-in">
                  <p>
                    <b>Today so far · Main store</b>
                    <br />
                    Sales: <b>₦184,500</b> (11 orders)
                    <br />
                    Received: ₦165,000
                    <br />
                    Not yet paid: ₦19,500 (1 order)
                    <em>Jawdah Poultry · as of 6:40 PM</em>
                    <span className="tg-meta">6:40 PM</span>
                  </p>
                </div>
                <div className="tg-kb">
                  <button
                    type="button"
                    {...marketingAttrs("reply", "assistant", "telegram")}
                    onClick={() => setNote(notes.unpaid)}
                  >
                    Unpaid orders
                  </button>
                  <button
                    type="button"
                    {...marketingAttrs("reply", "assistant", "telegram")}
                    onClick={() => setNote(notes.week)}
                  >
                    This week
                  </button>
                </div>
              </div>
            </div>
            <div className="tg-compose">
              <span className="tg-menu">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
                Menu
              </span>
              <span className="tg-input">Message</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
              </svg>
              <Icon name="mic" />
            </div>
            <div className="tg-home" aria-hidden="true" />
          </div>
          <p className="tg-note" hidden={!note}>
            {note}
          </p>
        </figure>
        <div className="tg-copy">
          <h2>
            Same business. <br />
            On <span>Telegram.</span>
          </h2>
          <div className="tg-argument">
            <h3>Ask how today went.</h3>
            <p>
              Ask for today’s sales, unpaid orders or who owes you. EwaTrade
              answers from your records.
            </p>
          </div>
          <div className="tg-actions">
            <a
              className="button tg-primary"
              href={TELEGRAM_START_URL}
              target="_blank"
              rel="noopener noreferrer"
              {...marketingAttrs("telegram", "assistant", "telegram")}
            >
              <TelegramMark />
              Start on Telegram
              <span className="ew-sr"> (opens in a new tab)</span>
            </a>
            <a
              className="tg-watch"
              href="#telegram-demo"
              data-watch-tg=""
              {...marketingAttrs("conversation", "assistant", "telegram")}
            >
              Watch the conversation <Icon name="arrowRight" />
            </a>
          </div>
          <p className="tg-approval">
            Record sales here too. Nothing is saved until you approve.
          </p>
        </div>
      </div>
    </section>
  )
}
