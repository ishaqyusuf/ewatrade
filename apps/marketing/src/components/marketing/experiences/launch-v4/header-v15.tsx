"use client"
import { getDashboardLoginUrl } from "@/lib/auth-navigation"
import { marketingAttrs } from "@/lib/marketing-interactions"
import { useEffect, useRef, useState } from "react"
import { WebSignupCta } from "./cta"
import { BrandMark, Icon, TelegramMark, WhatsAppMark } from "./icons"
export function HeaderV15({
  signupEnabled,
  dark,
  onToggleTheme,
}: { signupEnabled: boolean; dark: boolean; onToggleTheme: () => void }) {
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const media = matchMedia("(min-width:901px)")
    const sync = () => {
      if (media.matches) setOpen(false)
    }
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header
        className="site-header"
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            setOpen(false)
            menu.current?.focus()
          }
        }}
      >
        <div className="header-inner">
          <a
            className="brand"
            {...marketingAttrs("navigation", "header", "home")}
            href="#top"
            aria-label="EwaTrade home"
          >
            <BrandMark />
            <span>ẸwáTrade</span>
          </a>
          <nav
            className={`main-nav${open ? " open" : ""}`}
            id="main-nav"
            aria-label="Main"
          >
            {(
              [
                ["Assistant", "assistant", "whatsapp"],
                ["How it works", "journey", "journey"],
                ["Features", "features", "features"],
                ["Pricing", "pricing", "pricing"],
              ] as const
            ).map(([label, id, category]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={() => setOpen(false)}
                {...marketingAttrs(
                  "navigation",
                  open ? "menu" : "header",
                  category,
                )}
              >
                {label}
              </a>
            ))}
            <a
              className="mobile-signin"
              href={getDashboardLoginUrl()}
              {...marketingAttrs("login", "menu")}
            >
              Sign in
            </a>
          </nav>
          <div className="header-actions">
            <a
              className="header-signin"
              href={getDashboardLoginUrl()}
              {...marketingAttrs("login", "header")}
            >
              Sign in
            </a>
            <WebSignupCta
              signupEnabled={signupEnabled}
              channel="header"
              className="button primary header-cta"
            />
            <button
              ref={menu}
              className="icon-button menu-toggle"
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="main-nav"
              {...marketingAttrs(open ? "menu_close" : "menu_open", "header")}
              onClick={() => setOpen(!open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {open ? (
                  <path d="m6 6 12 12M6 18 18 6" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
            <button
              className="icon-button theme-toggle"
              type="button"
              aria-label={
                dark ? "Switch to light theme" : "Switch to dark theme"
              }
              onClick={onToggleTheme}
              {...marketingAttrs("theme", "header", dark ? "light" : "dark")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {dark ? (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
                  </>
                ) : (
                  <path d="M20.8 13A8.7 8.7 0 0 1 11 3.2 8.8 8.8 0 1 0 20.8 13Z" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>
    </>
  )
}
const announcementChannels = {
  wa: { href: "#assistant", category: "whatsapp" },
  tg: { href: "#telegram", category: "telegram" },
} as const
type AnnouncementChannel = keyof typeof announcementChannels

/** Rolls the app name between WhatsApp and Telegram; still for reduced motion. */
export function ChannelAnnouncement() {
  const [channel, setChannel] = useState<AnnouncementChannel>("wa")
  const [swapped, setSwapped] = useState(false)
  const [still, setStill] = useState(false)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setStill(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])
  useEffect(() => {
    if (still || paused) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      setSwapped(true)
      setChannel((current) => (current === "wa" ? "tg" : "wa"))
    }, 3200)
    return () => window.clearInterval(timer)
  }, [still, paused])
  const state = (key: AnnouncementChannel) =>
    key === channel
      ? swapped
        ? "is-in"
        : "is-on"
      : swapped
        ? "is-out"
        : "is-off"
  const shown = still ? "wa" : channel
  return (
    <a
      className={`launch-announcement${still ? " is-still" : ""}`}
      href={announcementChannels[shown].href}
      aria-label="Meet EwaTrade on WhatsApp and Telegram. Record a sale or ask how today went."
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      {...marketingAttrs(
        "navigation",
        "header",
        announcementChannels[shown].category,
      )}
    >
      <span className="wrap">
        <span className="ann-mark" aria-hidden="true">
          <WhatsAppMark className={`whatsapp-mark ann-wa ${state("wa")}`} />
          <TelegramMark className={`telegram-mark ann-tg ${state("tg")}`} />
        </span>
        <strong>
          Meet EwaTrade on{" "}
          <span className="ann-rotor" aria-hidden="true">
            <span className={`ann-wa ${state("wa")}`}>WhatsApp</span>
            <span className={`ann-tg ${state("tg")}`}>Telegram</span>
          </span>
          <span className="ann-both" aria-hidden="true">
            WhatsApp &amp; Telegram
          </span>
        </strong>
        <span className="ann-sub">Record a sale or ask how today went</span>
        <Icon name="arrowRight" />
      </span>
    </a>
  )
}
