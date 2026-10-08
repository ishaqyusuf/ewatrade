"use client"
import { getDashboardLoginUrl } from "@/lib/auth-navigation"
import { getCreateStoreCta } from "@/lib/create-store-url"
import {
  PlatformSwitch,
  usePlatform,
} from "@ewatrade/onboarding/components/product-preview/platform"
import { ProductPreview } from "@ewatrade/onboarding/components/product-preview/product-preview"
import {
  data,
  money,
} from "@ewatrade/onboarding/components/product-preview/sample-data"
import {
  icons,
  typeIcon,
} from "@ewatrade/onboarding/components/product-preview/screens"
import { usePreviewMotion } from "@ewatrade/onboarding/components/product-preview/use-preview-motion"
import type { CSSProperties } from "react"
import { useEffect, useState } from "react"
export function HowItStarts() {
  const { platform } = usePlatform()
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState(4)
  const { ref, visible, staticMode } = usePreviewMotion()
  const biz = data.businesses[index] ?? data.businesses[0]
  // biome-ignore lint/correctness/useExhaustiveDependencies: Business and platform changes replay the illustration.
  useEffect(() => {
    if (staticMode || !visible) {
      setPhase(4)
      return
    }
    setPhase(0)
    const timers = [400, 1200, 2200, 3700].map((time, i) =>
      setTimeout(() => setPhase(i + 1), time),
    )
    return () => timers.forEach(clearTimeout)
  }, [index, platform, staticMode, visible])
  return (
    <>
      <section
        className={"gg-sec b-aware"}
        id={"businesses"}
        aria-labelledby={"how-h"}
      >
        {"\n      "}
        <div className={"gg-wrap gg-how"}>
          {"\n        "}
          <div>
            {"\n          "}
            <h2 className={"gg-h2 ew-reveal is-in"} id={"how-h"}>
              {"From sign-up to your first sale."}
            </h2>
            {"\n          "}
            <p
              className={"gg-lead ew-reveal is-in"}
              style={{ "--d": "80ms" } as CSSProperties}
            >
              {
                "Three steps, in your own words. Pick a business below to see the setup assistant at work"
              }
              <span className={"b-only-web"}>{" on the web dashboard"}</span>
              <span className={"b-only-mobile"}>
                {" in the mobile app, coming soon"}
              </span>
              {"."}
            </p>
            {"\n          "}
            <ol className={"gg-steps"}>
              {"\n            "}
              <li className={"gg-step ew-reveal is-in"}>
                {"\n              "}
                <span className={"gg-num"} aria-hidden={"true"}>
                  {"1"}
                </span>
                {"\n              "}
                <div>
                  <h3>{"Create your store"}</h3>
                  <p>
                    {
                      "Your name, your business name and an email address, in any browser. The Free plan needs no card."
                    }
                  </p>
                </div>
                {"\n            "}
              </li>
              {"\n            "}
              <li
                className={"gg-step ew-reveal is-in"}
                style={{ "--d": "80ms" } as CSSProperties}
              >
                {"\n              "}
                <span className={"gg-num"} aria-hidden={"true"}>
                  {"2"}
                </span>
                {"\n              "}
                <div>
                  {"\n                "}
                  <h3>{"Tell the setup assistant what you sell"}</h3>
                  {"\n                "}
                  <p>
                    {
                      "Type it the way you’d say it. Each line becomes a draft item for you to check."
                    }
                  </p>
                  {"\n                "}
                  <div
                    className="gg-tabs"
                    role="tablist"
                    aria-label="Sample businesses"
                  >
                    {data.businesses.map((b, i) => (
                      <button
                        key={b.key}
                        id={`biz-${b.key}`}
                        className="gg-tab"
                        type="button"
                        role="tab"
                        aria-controls="assistPanel"
                        aria-selected={index === i}
                        tabIndex={index === i ? 0 : -1}
                        onClick={() => setIndex(i)}
                        onKeyDown={(e) => {
                          if (
                            ![
                              "ArrowLeft",
                              "ArrowRight",
                              "Home",
                              "End",
                            ].includes(e.key)
                          )
                            return
                          e.preventDefault()
                          const next =
                            e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? 4
                                : (index + (e.key === "ArrowLeft" ? 4 : 1)) % 5
                          setIndex(next)
                          document
                            .getElementById(
                              `biz-${(data.businesses[next] ?? data.businesses[0]).key}`,
                            )
                            ?.focus()
                        }}
                      >
                        {typeIcon[b.key as keyof typeof typeIcon]}
                        {b.label}
                      </button>
                    ))}
                  </div>
                  {"\n                "}
                  <span className="gg-typed" aria-live="polite">
                    {biz.lines.join("\n")}
                  </span>
                  {"\n              "}
                </div>
                {"\n            "}
              </li>
              {"\n            "}
              <li
                className={"gg-step ew-reveal is-in"}
                style={{ "--d": "160ms" } as CSSProperties}
              >
                {"\n              "}
                <span className={"gg-num"} aria-hidden={"true"}>
                  {"3"}
                </span>
                {"\n              "}
                <div>
                  <h3>{"Make your first sale"}</h3>
                  <p>
                    <span className={"b-only-web"}>
                      {
                        "Click New order, pick the item and the customer, choose how they paid."
                      }
                    </span>
                    <span className={"b-only-mobile"}>
                      {
                        "Tap Sell, pick the item and the customer, choose how they paid."
                      }
                    </span>
                    {" Stock and today’s total update on their own."}
                  </p>
                </div>
                {"\n            "}
              </li>
              {"\n          "}
            </ol>
            {"\n          "}
            <p className={"gg-honest"}>
              {"Setup after signup took 66–75 seconds in our rehearsals."}
            </p>
            {"\n        "}
          </div>
          {"\n        "}
          <div
            className="gg-astage"
            id="assistPanel"
            role="tabpanel"
            aria-labelledby={`biz-${biz.key}`}
            ref={ref}
          >
            <img
              className="gg-wm"
              src="/brand/ewatrade-mark-precision-rise-v1-reverse.svg"
              alt=""
            />
            <div
              className={platform === "web" ? "b-astage-web" : "b-astage-phone"}
            >
              <ProductPreview
                platform={platform}
                view="assistant"
                state={{ biz, phase }}
              />
            </div>
            <p className="gg-astage-cap">
              Typed by the owner. Drafts are checked before they’re added.
              Sample business.
            </p>
          </div>
          {"\n      "}
        </div>
        {"\n    "}
      </section>
      {"\n\n"}
    </>
  )
}
