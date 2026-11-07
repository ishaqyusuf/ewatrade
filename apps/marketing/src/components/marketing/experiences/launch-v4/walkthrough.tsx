"use client"
import {
  captureMarketingInteraction,
  marketingAttrs,
} from "@/lib/marketing-interactions"
import { useEvents } from "@ewatrade/events/client"
import { useEffect, useRef, useState } from "react"
import {
  useMarketingMotion,
  useMarketingSequence,
} from "./use-marketing-motion"
import {
  WalkScene0,
  WalkScene1,
  WalkScene2,
  WalkScene3,
  WalkScene4,
} from "./walkthrough-scenes"
const steps = [
  {
    title: "Open your storefront",
    short: "Store",
    description:
      "Customers browse your products and services, choose their options and send a request.",
  },
  {
    title: "Agree the details",
    short: "Quote",
    description:
      "Review the request, set the price and prepare a quote for the work.",
  },
  {
    title: "Fulfil the order",
    short: "Order",
    description:
      "Keep the items, quantities and fulfilment status together as your team gets the work done.",
  },
  {
    title: "Record the payment",
    short: "Money",
    description:
      "Record money in the account it reached. Keep balances and expenses with the work.",
  },
  {
    title: "See the whole picture",
    short: "Reports",
    description:
      "See sales of products and services, top sellers and the dates that matter.",
  },
] as const
const scenes = [WalkScene0, WalkScene1, WalkScene2, WalkScene3, WalkScene4]
const categories = [
  "storefront",
  "quotes",
  "orders",
  "finance",
  "reports",
] as const
const durations = [6500, 6500, 6500, 6500, 6500] as const
export function Walkthrough({
  request,
}: { request: { index: number } | null }) {
  const { track } = useEvents()
  const motion = useMarketingMotion()
  const { index, playing, choose, toggle } = useMarketingSequence(
    durations,
    motion.active,
  )
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)")
    const sync = () => setNarrow(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])
  useEffect(() => {
    if (request) choose(request.index)
  }, [request, choose])
  const label = motion.reduced
    ? "Reduced motion"
    : playing
      ? "Pause walkthrough"
      : "Resume walkthrough"
  return (
    <section className="walkthrough wrap" id="journey" ref={motion.ref}>
      <div className="walk-copy">
        <div className="walk-heading">
          <h2>How it works</h2>
          <button
            type="button"
            className="motion-icon"
            aria-label={label}
            title={label}
            disabled={motion.reduced}
            onClick={toggle}
            {...marketingAttrs(playing ? "pause" : "play", "timeline")}
          >
            <span aria-hidden="true">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                {playing ? (
                  <path d="M5 3v10M11 3v10" />
                ) : (
                  <path d="m5 3 7 5-7 5Z" />
                )}
              </svg>
            </span>
          </button>
        </div>
        <p className="walk-intro">
          From their first hello <br />
          to the work being done.
        </p>
        <div
          className="walk-steps"
          role="tablist"
          aria-label="Customer journey"
          aria-orientation={narrow ? "horizontal" : "vertical"}
        >
          {steps.map((step, i) => (
            <button
              key={step.short}
              ref={(node) => {
                tabs.current[i] = node
              }}
              type="button"
              className="walk-step"
              role="tab"
              id={`walk-tab-${i}`}
              aria-controls={`walk-panel-${i}`}
              aria-selected={i === index}
              tabIndex={i === index ? 0 : -1}
              data-short={step.short}
              {...marketingAttrs("navigation", "timeline", categories[i])}
              onClick={() => choose(i)}
              onKeyDown={(event) => {
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 4
                      : ["ArrowDown", "ArrowRight"].includes(event.key)
                        ? (i + 1) % 5
                        : ["ArrowUp", "ArrowLeft"].includes(event.key)
                          ? (i + 4) % 5
                          : null
                if (next === null) return
                event.preventDefault()
                choose(next)
                captureMarketingInteraction(track, {
                  action: "navigation",
                  channel: "timeline",
                  category: categories[next],
                })
                tabs.current[next]?.focus()
              }}
            >
              <span className="walk-marker" aria-hidden="true" />
              <span>
                <strong>{step.title}</strong>
                <span className="walk-description">{step.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="walk-stage">
        <div className="walk-mobile-copy">
          <h3>{steps[index]?.title}</h3>
          <p>{steps[index]?.description}</p>
        </div>
        {scenes.map((Scene, i) => (
          <div key={steps[i]?.short} hidden={i !== index}>
            <Scene />
          </div>
        ))}
        <div className="walk-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${(index + 1) / 5})` }} />
        </div>
      </div>
    </section>
  )
}
