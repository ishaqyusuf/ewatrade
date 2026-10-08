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
import { useEffect, useRef, useState } from "react"
const captions = [
  "Your whole business at a glance.",
  "Pick the item. Record the order.",
  "Paid and Preparing. Two different things.",
  "Stock and today’s total, already updated.",
]
export function Hero({ signupEnabled }: { signupEnabled: boolean }) {
  const cta = getCreateStoreCta(signupEnabled)
  const { platform, picked, pick } = usePlatform()
  const { ref, visible, staticMode } = usePreviewMotion()
  const [auto, setAuto] = useState<"web" | "mobile">("web")
  const [step, setStep] = useState(3)
  const [paused, setPaused] = useState(false)
  const [replay, setReplay] = useState(0)
  const [total, setTotal] = useState(
    data.today.sales + data.sale.qty * data.sale.price,
  )
  const currentTotal = useRef(total)
  const active = picked ? platform : auto
  useEffect(() => {
    if (staticMode) {
      setStep(3)
      return
    }
    setStep(0)
  }, [staticMode])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Replay deliberately restarts the same stage.
  useEffect(() => {
    if (!visible || paused || staticMode) return
    const timer = setTimeout(() => {
      setStep((step + 1) % 4)
      if (step === 3 && !picked)
        setAuto((value) => (value === "web" ? "mobile" : "web"))
    }, [2800, 1600, 2000, 3200][step])
    return () => clearTimeout(timer)
  }, [step, visible, paused, staticMode, picked, replay])
  useEffect(() => {
    const base = data.today.sales
    const added = data.sale.qty * data.sale.price
    if (step !== 3) {
      currentTotal.current = base
      setTotal(base)
      return
    }
    if (staticMode) {
      currentTotal.current = base + added
      setTotal(base + added)
      return
    }
    if (paused || !visible) return
    let frame = 0
    const start = performance.now()
    const from = currentTotal.current
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 1100)
      currentTotal.current = Math.round(
        from + (base + added - from) * (1 - (1 - progress) ** 3),
      )
      setTotal(currentTotal.current)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [step, staticMode, paused, visible])
  const view =
    step === 0 || step === 3 ? "overview" : step === 1 ? "sale" : "created"
  return (
    <>
      <section className={"gg-hero"} aria-labelledby={"hero-h"}>
        {"\n    "}
        <img
          className={"gg-wm big"}
          src={"/brand/ewatrade-mark-precision-rise-v1-reverse.svg"}
          alt={""}
        />
        {"\n    "}
        <div className={"gg-wrap gg-hero-grid"}>
          {"\n      "}
          <div className={"gg-hero-copy"}>
            {"\n        "}
            <h1 className={"gg-h1"} id={"hero-h"}>
              {"Run your shop from any screen."}
            </h1>
            {"\n        "}
            <p className={"gg-hero-sub"}>
              {
                "Record a sale, count your stock and see who owes you. The web dashboard works today in any browser, on a computer or a phone. The mobile app is coming soon."
              }
            </p>
            {"\n        "}
            <div className={"gg-ctas"}>
              {"\n          "}
              <a className={"gg-btn gg-btn--gold"} href={cta.href}>
                {cta.label}
              </a>
              {"\n          "}
              <a className={"gg-btn gg-btn--ghost"} href={"#product"}>
                {"See it work"}
              </a>
              {"\n        "}
            </div>
            {"\n        "}
            <p className={"gg-assure"}>
              <span>{"Free forever plan"}</span>
              <span>{"Works in any browser"}</span>
              <span>{"No card needed"}</span>
            </p>
            {"\n      "}
          </div>
          {"\n\n      "}
          <div className="gg-stage b-stage" ref={ref}>
            {"\n        "}
            <div className={"b-switch-row"}>
              {"\n          "}
              <PlatformSwitch current={active} label="Show the hero on" />
              {"\n        "}
            </div>
            {"\n        "}
            <div className={"b-duo"} id={"duo"} data-active={active}>
              {"\n          "}
              <div className={"b-layer b-layer--web"} data-layer={"web"}>
                {"\n            "}
                <ProductPreview
                  view={view}
                  state={{ sold: step === 3, press: step === 1 }}
                />
                {"\n            "}
                <button
                  className={"b-peek"}
                  type={"button"}
                  onClick={() => pick("web")}
                  data-pick="web"
                  tabIndex={-1}
                  aria-hidden={"true"}
                >
                  <span>{"Web dashboard"}</span>
                </button>
                {"\n          "}
              </div>
              {"\n          "}
              <div className={"b-layer b-layer--phone"} data-layer={"mobile"}>
                {"\n            "}
                <div className={"b-phone-in"}>
                  {"\n              "}
                  <ProductPreview
                    platform="mobile"
                    view={view}
                    state={{ sold: step === 3, press: step === 1 }}
                  />
                  {"\n              "}
                  <span className={"b-soon-tag"} aria-hidden={"true"}>
                    {"Mobile app · coming soon"}
                  </span>
                  {"\n            "}
                </div>
                {"\n            "}
                <button
                  className={"b-peek"}
                  type={"button"}
                  onClick={() => pick("mobile")}
                  data-pick="mobile"
                  tabIndex={-1}
                  aria-hidden={"true"}
                >
                  <span>{"Mobile app · coming soon"}</span>
                </button>
                {"\n          "}
              </div>
              {"\n          "}
              <div
                className={`gg-chip gg-chip--paid${step >= 2 ? " is-on" : ""}`}
                data-chip={"paid"}
                aria-hidden={"true"}
              >
                <span className={"ew-pill t-mint"}>{"Paid"}</span>
                {"Order #1049"}
              </div>
              {"\n          "}
              <div
                className={`gg-chip gg-chip--prep${step >= 2 ? " is-on" : ""}`}
                data-chip={"prep"}
                aria-hidden={"true"}
              >
                <span className={"ew-pill t-amber"}>{"Preparing"}</span>
                {"2 × Crate of eggs"}
              </div>
              {"\n          "}
              <div
                className={`gg-chip gg-chip--plus${step >= 3 ? " is-on" : ""}`}
                data-chip={"plus"}
                aria-hidden={"true"}
              >
                <small>
                  <span className={"gg-l-long"}>
                    <span className={"b-l-web"}>{"Sales today"}</span>
                    <span className={"b-l-mobile"}>{"Today so far"}</span>
                  </span>
                  <span className={"gg-l-short"}>{"Just now"}</span>
                </small>
                <span className={"gg-chip-row"}>
                  <b className="ew-num">{money(total)}</b>
                  <span className="ew-pill t-mint">
                    +{money(data.sale.qty * data.sale.price)}
                  </span>
                </span>
              </div>
              {"\n        "}
            </div>
            {"\n        "}
            <div className={"gg-loopbar"}>
              {"\n          "}
              <p className="gg-caption" aria-live="off">
                {captions[step]}{" "}
                <span className="sample-note">Sample business.</span>
              </p>
              {"\n          "}
              <button
                className="gg-ctl"
                type="button"
                aria-pressed={paused}
                onClick={() => setPaused(!paused)}
                disabled={staticMode}
              >
                {paused ? "Play" : "Pause"}
              </button>
              {"\n          "}
              <button
                className="gg-ctl"
                type="button"
                onClick={() => {
                  setStep(0)
                  setPaused(false)
                  setReplay((v) => v + 1)
                }}
                disabled={staticMode}
              >
                Replay
              </button>
              {"\n        "}
            </div>
            {"\n      "}
          </div>
          {"\n    "}
        </div>
        {"\n\n    "}
        <div className={"gg-truth"}>
          {"\n      "}
          <div className={"gg-wrap"}>
            {"\n        "}
            <p>{"Made for the businesses on your street"}</p>
            {"\n        "}
            <ul aria-label="Business types">
              {data.businesses.map((b) => (
                <li key={b.key} className="gg-tchip">
                  {typeIcon[b.key as keyof typeof typeIcon]}
                  {b.label}
                </li>
              ))}
              <li className="gg-tchip more">and more</li>
            </ul>
            {"\n      "}
          </div>
          {"\n    "}
        </div>
        {"\n  "}
      </section>
      {"\n\n"}
    </>
  )
}
