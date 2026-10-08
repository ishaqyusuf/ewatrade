"use client"
import { getDashboardLoginUrl } from "@/lib/auth-navigation"
import { getCreateStoreCta } from "@/lib/create-store-url"
import { useEffect, useRef, useState } from "react"
const links = [
  ["Product", "product"],
  ["Businesses", "businesses"],
  ["Pricing", "pricing"],
  ["FAQ", "faq"],
]
export function Header({ signupEnabled }: { signupEnabled: boolean }) {
  const cta = getCreateStoreCta(signupEnabled)
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", update, { passive: true })
    update()
    return () => window.removeEventListener("scroll", update)
  }, [])
  useEffect(() => {
    if (!open) return
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = "hidden"
    sheet.current?.querySelector("button")?.focus()
    const background = document.querySelector<HTMLElement>(".launch-content")
    if (background) background.inert = true
    const media = matchMedia("(min-width:961px)")
    const close = () => {
      if (media.matches) setOpen(false)
    }
    media.addEventListener("change", close)
    return () => {
      document.documentElement.style.overflow = prev
      if (background) background.inert = false
      media.removeEventListener("change", close)
      button.current?.focus()
    }
  }, [open])
  const logo = (
    <img
      className="ew-logo"
      src="/brand/ewatrade-logo-precision-rise-v1-reverse.svg"
      alt="ẸwáTrade"
      width={132}
      height={28}
    />
  )
  return (
    <>
      <a className="launch-skip" href="#main">
        Skip to content
      </a>
      <header className={`gg-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="gg-wrap">
          <a className="gg-home" href="#top" aria-label="ẸwáTrade home">
            {logo}
          </a>
          <nav className="gg-nav" aria-label="Main">
            <ul>
              {links.map(([label, id]) => (
                <li key={id}>
                  <a href={`#${id}`}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="gg-head-right">
            <a className="gg-signin" href={getDashboardLoginUrl()}>
              Sign in
            </a>
            <a className="gg-btn gg-btn--cream gg-btn--sm" href={cta.href}>
              {cta.label}
            </a>
          </div>
          <button
            ref={button}
            className="gg-menu-btn"
            type="button"
            aria-expanded={open}
            aria-controls="launch-menu"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M4 8h16M4 16h16" />
            </svg>
          </button>
        </div>
      </header>
      <dialog
        open={open}
        ref={sheet}
        id="launch-menu"
        className={`gg-sheet${open ? " is-open" : ""}`}
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false)
          if (e.key !== "Tab") return
          const items = sheet.current?.querySelectorAll<HTMLElement>("a,button")
          if (!items?.length) return
          const first = items[0]
          const last = items[items.length - 1]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }}
      >
        <div className="gg-sheet-top">
          {logo}
          <button
            className="gg-menu-btn"
            style={{ display: "grid" }}
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <nav aria-label="Menu">
          <ul>
            {links.map(([label, id]) => (
              <li key={id}>
                <a href={`#${id}`} onClick={() => setOpen(false)}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="gg-sheet-foot">
          <a className="gg-btn gg-btn--gold gg-btn--block" href={cta.href}>
            {cta.label}
          </a>
          <a
            className="gg-btn gg-btn--ghost gg-btn--block"
            href={getDashboardLoginUrl()}
          >
            Sign in
          </a>
        </div>
      </dialog>
    </>
  )
}
