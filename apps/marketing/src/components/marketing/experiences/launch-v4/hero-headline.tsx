"use client"

import { usePreviewMotion } from "@ewatrade/onboarding/components/product-preview/use-preview-motion"
import { useEffect, useState } from "react"

const words = ["shop", "business", "pharmacy", "workshop"]

export function HeroHeadline({
  paused,
  replay,
}: { paused: boolean; replay: number }) {
  const { ref, visible, staticMode } = usePreviewMotion()
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (staticMode) setCurrent(0)
  }, [staticMode])

  useEffect(() => {
    if (!visible || paused || staticMode) return
    const timer = setTimeout(() => {
      setCurrent((current + 1) % words.length)
    }, 3000)
    return () => clearTimeout(timer)
  }, [current, visible, paused, staticMode])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Replay resets the headline along with the illustration.
  useEffect(() => {
    setCurrent(0)
  }, [replay])

  return (
    <div ref={ref}>
      <h1
        className="gg-h1 gg-headline"
        id="hero-h"
        aria-label="Run your business from any screen."
      >
        <span aria-hidden="true">
          <span className="gg-headline-line">Run your</span>
          <span className="gg-headline-words" data-static={staticMode}>
            {words.map((word, index) => (
              <span
                key={word}
                className={`gg-headline-word${index === current ? " is-current" : index === (current + words.length - 1) % words.length ? " is-previous" : ""}`}
              >
                {word}
              </span>
            ))}
          </span>
          <span className="gg-headline-line">from any screen.</span>
        </span>
      </h1>
    </div>
  )
}
