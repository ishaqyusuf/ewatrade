"use client"
import type { ConversationId } from "@/lib/marketing-conversations"
import { marketingAttrs } from "@/lib/marketing-interactions"
import { usePlatform } from "@ewatrade/onboarding/components/product-preview/platform"
import { ProductPreview } from "@ewatrade/onboarding/components/product-preview/product-preview"
import {
  data,
  money,
} from "@ewatrade/onboarding/components/product-preview/sample-data"
import { usePreviewMotion } from "@ewatrade/onboarding/components/product-preview/use-preview-motion"
import { useEffect, useState } from "react"
import { BusinessRibbon } from "./business-ribbon"
import { ChatDemo } from "./chat-demo"
import { WebSignupCta, WhatsAppCta, WhatsAppIcon } from "./cta"
import { HeroHeadline } from "./hero-headline"
const platforms = ["web", "mobile", "whatsapp"] as const
const captions = [
  "Your whole business at a glance.",
  "Pick the item. Record the order.",
  "Paid and Preparing. Two different things.",
  "Stock and today’s total, already updated.",
]
export function Hero({ signupEnabled }: { signupEnabled: boolean }) {
  const { platform, picked, pick } = usePlatform()
  const { ref, visible, staticMode } = usePreviewMotion()
  const [auto, setAuto] = useState<"web" | "mobile">("web")
  const [whatsapp, setWhatsapp] = useState(false)
  const [scenario, setScenario] = useState<ConversationId>("setup")
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const [replay, setReplay] = useState(0)
  const active = whatsapp ? "whatsapp" : picked ? platform : auto
  const selectedStep = staticMode ? 3 : step
  useEffect(() => {
    if (!visible || paused || staticMode || whatsapp) return
    const timer = setTimeout(() => {
      setStep((step + 1) % 4)
      if (step === 3 && !picked)
        setAuto((value) => (value === "web" ? "mobile" : "web"))
    }, [2800, 1600, 2000, 3200][step])
    return () => clearTimeout(timer)
  }, [step, visible, paused, staticMode, whatsapp, picked])
  const view =
    selectedStep === 0 || selectedStep === 3
      ? "overview"
      : selectedStep === 1
        ? "sale"
        : "created"
  const select = (value: (typeof platforms)[number]) => {
    setWhatsapp(value === "whatsapp")
    if (value !== "whatsapp") pick(value)
  }
  return (
    <section className="gg-hero" id="hero" aria-labelledby="hero-h">
      <img
        className="gg-wm big"
        src="/brand/ewatrade-mark-precision-rise-v1-reverse.svg"
        alt=""
      />
      <div className="gg-wrap gg-hero-grid">
        <div className="gg-hero-copy">
          <p className="w-eyebrow">
            <span>Web</span>
            <span>Mobile</span>
            <span className="w-eyebrow-wa">WhatsApp assistant</span>
          </p>
          <HeroHeadline paused={paused} replay={replay} />
          <p className="gg-hero-sub">
            Sell, count stock and see who owes you on the web or the mobile app.
            Or ask your AI assistant on WhatsApp: it answers from your numbers
            and sends every change back for you to confirm.
          </p>
          <div className="gg-ctas w-ctas">
            <WebSignupCta signupEnabled={signupEnabled} channel="hero" />
            <WhatsAppCta channel="hero" />
          </div>
          <p className="w-cta-sub">
            Say hello and your assistant guides setup in the chat.
            <a
              className="gg-textlink"
              href="#assistant"
              {...marketingAttrs("navigation", "hero", "assistant")}
            >
              Meet your assistant
            </a>
          </p>
          <p className="gg-assure">
            <span>10 catalog items</span>
            <span>50 orders/month</span>
            <span>Assistant included</span>
          </p>
        </div>
        <div className="gg-stage b-stage" ref={ref}>
          <div className="b-switch-row">
            <fieldset
              className="b-switch"
              aria-label="Show the hero on"
              data-on={active}
            >
              {platforms.map((value, index) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active === value}
                  {...marketingAttrs("platform", "hero", value)}
                  onClick={() => select(value)}
                  onKeyDown={(event) => {
                    if (
                      ![
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
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
                          ? 2
                          : (index +
                              (event.key === "ArrowLeft" ||
                              event.key === "ArrowUp"
                                ? 2
                                : 1)) %
                            3
                    const button =
                      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                        "button",
                      )[next]
                    button?.focus()
                    button?.click()
                  }}
                >
                  {value === "whatsapp" && <WhatsAppIcon />}
                  <span>
                    {value === "web"
                      ? "Web"
                      : value === "mobile"
                        ? "Mobile"
                        : "WhatsApp"}
                  </span>
                </button>
              ))}
            </fieldset>
          </div>
          <div className="b-duo" data-active={active}>
            <div
              className={`b-layer b-layer--web${active === "web" ? " is-front" : ""}`}
              data-layer="web"
              aria-hidden={active !== "web"}
              inert={active !== "web"}
            >
              <ProductPreview
                view={view}
                state={{ sold: selectedStep === 3, press: selectedStep === 1 }}
                label="Al-Jawdah Agro-Biz in Ilorin, sample web dashboard"
              />
            </div>
            <div
              className={`b-layer b-layer--phone${active === "mobile" ? " is-front" : ""}`}
              data-layer="mobile"
              aria-hidden={active !== "mobile"}
              inert={active !== "mobile"}
            >
              <div className="b-phone-in">
                <ProductPreview
                  platform="mobile"
                  view={view}
                  state={{
                    sold: selectedStep === 3,
                    press: selectedStep === 1,
                  }}
                  label="Al-Jawdah Agro-Biz in Ilorin, sample mobile app"
                />
                <span className="b-soon-tag w-tag" aria-hidden="true">
                  Mobile app
                </span>
              </div>
            </div>
            <div
              className={`b-layer b-layer--wa${active === "whatsapp" ? " is-front" : ""}`}
              data-layer="whatsapp"
              aria-hidden={active !== "whatsapp"}
              inert={active !== "whatsapp"}
            >
              <div className="w-wa-in">
                <ChatDemo
                  key={replay}
                  scenario={scenario}
                  onScenarioChange={setScenario}
                  picks
                  channel="hero"
                />
              </div>
            </div>
            <div
              className={`gg-chip gg-chip--paid${selectedStep >= 2 ? " is-on" : ""}`}
              aria-hidden="true"
            >
              <span className="ew-pill t-mint">Paid</span>Order #1049
            </div>
            <div
              className={`gg-chip gg-chip--prep${selectedStep >= 2 ? " is-on" : ""}`}
              aria-hidden="true"
            >
              <span className="ew-pill t-amber">Preparing</span>2 × Crate of
              eggs
            </div>
            <div
              className={`gg-chip gg-chip--plus${selectedStep >= 3 ? " is-on" : ""}`}
              aria-hidden="true"
            >
              <small>Sales today</small>
              <span className="gg-chip-row">
                <b className="ew-num">
                  {money(
                    data.today.sales +
                      (selectedStep === 3
                        ? data.sale.qty * data.sale.price
                        : 0),
                  )}
                </b>
                <span className="ew-pill t-mint">+₦11,000</span>
              </span>
            </div>
          </div>
          <div className="gg-loopbar">
            <p className="gg-caption" aria-live="off">
              {whatsapp
                ? "Your assistant, right in the chat."
                : captions[selectedStep]}{" "}
              <span className="sample-note">Sample business.</span>
            </p>
            <button
              className="gg-ctl"
              type="button"
              disabled={staticMode}
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
              {...marketingAttrs(paused ? "play" : "pause", "hero")}
            >
              {paused ? "Play" : "Pause"}
            </button>
            <button
              className="gg-ctl"
              type="button"
              disabled={staticMode}
              onClick={() => {
                setStep(0)
                setPaused(false)
                setReplay((n) => n + 1)
                setScenario("setup")
              }}
              {...marketingAttrs("replay", "hero")}
            >
              Replay
            </button>
          </div>
        </div>
      </div>
      <BusinessRibbon />
    </section>
  )
}
