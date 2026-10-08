"use client"
import { type CSSProperties, useEffect, useRef } from "react"
import { data } from "./sample-data"
import {
  NAV,
  type ScreenState,
  icons,
  navFor,
  screens,
  webViews,
} from "./screens"
export type PreviewView = keyof typeof screens | keyof typeof webViews
export function ProductPreview({
  platform = "web",
  view = "overview",
  state = {},
  label = "Sample business · Mama Bisi Farms, Ibadan",
}: {
  platform?: "web" | "mobile"
  view?: PreviewView
  state?: ScreenState
  label?: string
}) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = outer.current
    const content = inner.current
    if (!box || !content) return
    const resize = () => {
      if (!box.clientWidth) return
      if (platform === "mobile") {
        const scale = box.clientWidth / 360
        content.style.setProperty("--s", String(scale))
        content.style.setProperty("--ah", `${box.clientHeight / scale}px`)
      } else {
        const narrow = window.matchMedia("(max-width:720px)").matches
        const base = narrow ? box.clientWidth : Math.max(box.clientWidth, 780)
        box.style.setProperty("--k", String(box.clientWidth / base))
        content.style.width = `${base}px`
        content.style.transform = `scale(${box.clientWidth / base})`
      }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(box)
    resize()
    return () => ro.disconnect()
  }, [platform])
  if (platform === "mobile") {
    const name = view === "overview" || view === "team" ? "home" : view
    return (
      <div className="ew-phone" role="img" aria-label={label}>
        <div className="ew-phone-screen" ref={outer} aria-hidden="true">
          <div className="ew-island" />
          <div className="ew-app" ref={inner}>
            <div className="ew-status">
              <span>9:41</span>
              <i />
            </div>
            <div className="ew-scene" key={name}>
              {screens[name](state)}
            </div>
            <div className="ew-dock">
              <span className="on">{icons.home}Home</span>
              <span>{icons.orders}Orders</span>
              <span className="sell">{icons.plus}</span>
              <span>{icons.catalog}Catalogue</span>
              <span>{icons.more}More</span>
            </div>
          </div>
        </div>
      </div>
    )
  }
  const name = view === "home" || view === "offline" ? "overview" : view
  const screen =
    name === "created"
      ? webViews.sale({ ...state, created: true })
      : webViews[name](state)
  const active = navFor[name as keyof typeof navFor] ?? name
  const business = state.business ?? data.business
  return (
    <div className="b-browser" role="img" aria-label={label}>
      <div className="b-bar" aria-hidden="true">
        <span className="b-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="b-url">dashboard.ewatrade.com</span>
      </div>
      <div className="b-view" ref={outer} aria-hidden="true">
        <div className="b-view-in" ref={inner}>
          <div className="b-web ew-dash ew-web">
            <div className="ew-dash-side">
              <img
                className="ew-logo-light"
                src="/brand/ewatrade-logo-precision-rise-v1.svg"
                alt=""
              />
              <img
                className="ew-logo-dark"
                src="/brand/ewatrade-logo-precision-rise-v1-reverse.svg"
                alt=""
              />
              {NAV.map(([key, label]) => (
                <span key={key} className={active === key ? "on" : ""}>
                  <i />
                  {label}
                </span>
              ))}
            </div>
            <div className="ew-dash-main">
              <div className="ew-web-view" key={name}>
                <div className="ew-dash-top">
                  <div>
                    <h5>{screen.title}</h5>
                    <small>
                      {name === "overview"
                        ? `${business.name} · ${business.city} store · Today`
                        : screen.sub}
                    </small>
                  </div>
                  <span className="ew-dash-btn">{screen.action}</span>
                </div>
                {screen.body}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
