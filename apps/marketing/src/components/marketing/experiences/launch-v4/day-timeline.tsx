"use client"
import { usePlatform } from "@ewatrade/onboarding/components/product-preview/platform"
import {
  type PreviewView,
  ProductPreview,
} from "@ewatrade/onboarding/components/product-preview/product-preview"
import { usePreviewMotion } from "@ewatrade/onboarding/components/product-preview/use-preview-motion"
import { type CSSProperties, useEffect, useRef, useState } from "react"
const moments = [
  {
    time: "07:05",
    title: "Count the stock",
    copy: "Record what you have before the gate opens. Eggs by the crate or by the egg, feed by the bag, and low stock shows before you run out.",
    web: "stock",
    mobile: "stock",
    chips: [
      ["Low", "rose"],
      ["Units", "sky"],
    ],
  },
  {
    time: "09:42",
    title: "First sale of the day",
    copy: "Pick the item, pick the customer, choose cash, transfer, POS or pay later. Paid and Preparing are kept apart, so a paid order never looks finished.",
    web: "sale",
    mobile: "sale",
    chips: [
      ["Paid", "mint"],
      ["Preparing", "amber"],
    ],
  },
  {
    time: "12:30",
    title: "Who owes you",
    copy: "Every customer balance in one book, with how long it has been owing. The lunchtime call takes a minute, not your memory.",
    web: "owed",
    mobile: "owed",
    chips: [["Owes", "amber"]],
  },
  {
    time: "14:02",
    title: "Your team sells, you see it",
    copy: "Halima and Chidi take orders from their own phone or computer. Set sales reps to “Only their own sales”, and you still see every order and every naira.",
    web: "team",
    mobile: "offline",
    chips: [["Only their own sales", "lilac"]],
  },
  {
    time: "16:15",
    title: "See the whole day",
    copy: "The morning’s orders, stock and money are already here. Open the overview and see where the day stands.",
    web: "overview",
    mobile: "overview",
    chips: [["Same business", "sky"]],
  },
  {
    time: "18:40",
    title: "Close the day",
    copy: "Count the cash, compare it with what was expected, note any difference and close. Tomorrow starts clean.",
    web: "closeday",
    mobile: "closeday",
    chips: [],
  },
] as const
function Digits({ time }: { time: string }) {
  return (
    <span className="gg-digits">
      {Array.from(time, (ch, i) => (
        <span key={`${i}-${ch}`} className={ch === ":" ? "colon" : ""}>
          {ch}
        </span>
      ))}
    </span>
  )
}
export function DayTimeline() {
  const { platform } = usePlatform()
  const [active, setActive] = useState(0)
  const [recorded, setRecorded] = useState(true)
  const [synced, setSynced] = useState(true)
  const [progress, setProgress] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const { ref, visible, staticMode } = usePreviewMotion()
  useEffect(() => {
    const node = list.current
    if (!node) return
    let frame = 0
    const update = () => {
      frame = 0
      const cards = Array.from(node.querySelectorAll<HTMLElement>(".gg-moment"))
      let next = 0
      for (let i = 0; i < cards.length; i++)
        if (
          (cards[i]?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY) <
          innerHeight * 0.5
        )
          next = i
      setActive(next)
      const rect = node.getBoundingClientRect()
      setProgress(
        Math.min(1, Math.max(0, (innerHeight * 0.5 - rect.top) / rect.height)),
      )
    }
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    addEventListener("scroll", scroll, { passive: true })
    addEventListener("resize", scroll)
    update()
    return () => {
      removeEventListener("scroll", scroll)
      removeEventListener("resize", scroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Platform changes restart this moment.
  useEffect(() => {
    if (staticMode || !visible) {
      setRecorded(true)
      setSynced(true)
      return
    }
    setRecorded(active !== 1)
    setSynced(active !== 3)
    const t = setTimeout(() => setRecorded(true), 1200)
    const s = setTimeout(() => setSynced(true), 1600)
    return () => {
      clearTimeout(t)
      clearTimeout(s)
    }
  }, [active, platform, staticMode, visible])
  const moment = moments[active] ?? moments[0]
  const view = moment[platform]
  const time =
    platform === "mobile" && active === 3 && synced ? "14:07" : moment.time
  return (
    <section className="gg-sec b-aware" id="product" aria-labelledby="show-h">
      <div className="gg-wrap" ref={ref}>
        <div className="gg-split-head">
          <h2 className="gg-h2" id="show-h">
            One day at Mama Bisi Farms.
          </h2>
          <p className="gg-lead">
            From the first crate counted to the last naira counted. Six moments
            from a sample day in Ibadan,{" "}
            {platform === "web"
              ? "on the web dashboard."
              : "on the mobile app screens. The app is coming soon."}
          </p>
        </div>
        <div className="gg-day">
          <div className="gg-moments" ref={list}>
            <div className="gg-rail" aria-hidden="true">
              <div
                className="gg-rail-fill"
                style={{ "--p": progress } as CSSProperties}
              />
            </div>
            <ol className="gg-mlist">
              {moments.map((m, i) => {
                const offline = platform === "mobile" && i === 3
                const small = m[platform] === "sale" ? "created" : m[platform]
                return (
                  <li
                    key={m.time}
                    className={`gg-moment${active === i ? " is-active" : ""}${active > i ? " is-past" : ""}`}
                  >
                    <div className="gg-m-copy">
                      <span className="gg-m-time">
                        <span className="gg-dot" />
                        <Digits
                          time={
                            offline && active === i && synced ? "14:07" : m.time
                          }
                        />
                      </span>
                      <h3>
                        {offline
                          ? "The network drops. Sales keep going."
                          : m.title}
                      </h3>
                      <p>
                        {offline
                          ? "Coming with the mobile app: sales save on the phone and show Waiting to sync. When the signal comes back, they sync on their own."
                          : m.copy}
                      </p>
                      <div className="gg-pills">
                        {(offline
                          ? [
                              ["Waiting to sync", "amber"],
                              ["Synced", "mint"],
                            ]
                          : m.chips
                        ).map(([label, tone]) => (
                          <span key={label} className={`ew-pill t-${tone}`}>
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="gg-m-stage">
                      <div
                        className={
                          platform === "web" ? "b-m-web" : "gg-m-phone"
                        }
                      >
                        <ProductPreview
                          platform={platform}
                          view={small as PreviewView}
                          state={{ sold: true, synced: offline && synced }}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
          <div className="gg-day-stage">
            <div className="gg-day-stick">
              <img
                className="gg-wm"
                src="/brand/ewatrade-mark-precision-rise-v1-reverse.svg"
                alt=""
              />
              <div className="gg-dayclock">
                <span>
                  <small>Mama Bisi Farms · sample day</small>
                  <b>
                    <Digits time={time} />
                  </b>
                </span>
              </div>
              <span className="b-stage-tag">
                {platform === "web"
                  ? "Web dashboard"
                  : "Mobile app · coming soon"}
              </span>
              <div
                className={platform === "web" ? "b-day-web" : "gg-day-phone"}
              >
                <ProductPreview
                  platform={platform}
                  view={view === "sale" && recorded ? "created" : view}
                  state={{ sold: true, synced }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
