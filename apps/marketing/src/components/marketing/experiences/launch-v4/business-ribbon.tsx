"use client"
import { marketingAttrs } from "@/lib/marketing-interactions"
import { usePreviewMotion } from "@ewatrade/onboarding/components/product-preview/use-preview-motion"
import { useState } from "react"
import { businessTiles } from "./business-illustrations"

export function BusinessRibbon() {
  const [paused, setPaused] = useState(false)
  const { ref, visible, staticMode } = usePreviewMotion()
  return (
    <div
      ref={ref}
      className={`gg-truth w-ribbon${paused || staticMode ? " is-paused" : ""}${!visible ? " is-away" : ""}`}
    >
      <div className="gg-wrap w-ribbon-head">
        <p id="ribbon-h">Made for the businesses on your street</p>
        <button
          className="gg-ctl w-ribbon-ctl"
          type="button"
          aria-controls="ribbon-rail"
          aria-pressed={paused}
          disabled={staticMode}
          onClick={() => setPaused(!paused)}
          {...marketingAttrs(paused ? "play" : "pause", "business_ribbon")}
        >
          {paused ? "Play" : "Pause"}
        </button>
      </div>
      <section
        className="w-rail"
        id="ribbon-rail"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users can scroll the business rail.
        tabIndex={0}
        aria-labelledby="ribbon-h"
      >
        <div className="w-track">
          {[false, true].map((copy) => (
            <ul
              key={String(copy)}
              className={`w-biz${copy ? " is-copy" : ""}`}
              aria-label={copy ? undefined : "Business types"}
              aria-hidden={copy || undefined}
              inert={copy}
            >
              {businessTiles.map((b) => (
                <li key={b.key} className="w-tile">
                  <span className="w-ill" aria-hidden="true">
                    {b.illustration}
                  </span>
                  <span className="w-tile-l">{b.label}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </section>
    </div>
  )
}
