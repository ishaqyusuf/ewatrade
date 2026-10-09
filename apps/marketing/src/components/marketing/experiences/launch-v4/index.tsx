"use client"
import {
  PlatformProvider,
  PlatformSwitch,
  usePlatform,
} from "@ewatrade/onboarding/components/product-preview/platform"
import { useEffect, useState } from "react"
import { preload } from "react-dom"
import type { MarketingExperienceProps } from "../../marketing-experience-contract"
import { DayTimeline } from "./day-timeline"
import { Header } from "./header"
import { Hero } from "./hero"
import { HowItStarts } from "./how-it-starts"
import { LaunchPricing } from "./pricing"
import { Availability, Closing, Faq } from "./static-sections"
import "@ewatrade/onboarding/styles/product-preview.css"
import "../launch-v4.css"
function Landing({ signupEnabled }: MarketingExperienceProps) {
  const { platform } = usePlatform()
  const [theme, setTheme] = useState<"light" | "dark">()
  const [systemDark, setSystemDark] = useState(false)
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)")
    const syncSystem = () => setSystemDark(media.matches)
    const syncSaved = () => {
      try {
        const saved = localStorage.getItem("ewatrade-marketing-theme")
        setTheme(saved === "light" || saved === "dark" ? saved : undefined)
      } catch {
        // The system theme still works when storage is unavailable.
      }
    }
    syncSystem()
    syncSaved()
    media.addEventListener("change", syncSystem)
    window.addEventListener("storage", syncSaved)
    return () => {
      media.removeEventListener("change", syncSystem)
      window.removeEventListener("storage", syncSaved)
    }
  }, [])
  const dark = theme ? theme === "dark" : systemDark
  const toggleTheme = () => {
    const next = dark ? "light" : "dark"
    setTheme(next)
    try {
      localStorage.setItem("ewatrade-marketing-theme", next)
    } catch {
      // Keep the selected theme for this page when persistence is unavailable.
    }
  }
  const [floating, setFloating] = useState(false)
  useEffect(() => {
    const seen = new Set<Element>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target)
          else seen.delete(e.target)
        }
        setFloating(seen.size > 0)
      },
      { rootMargin: "-30% 0px -30% 0px" },
    )
    for (const el of document.querySelectorAll(".launch-v4 .b-aware"))
      observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)")
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection
    if (media.matches || connection?.saveData) return
    const elements = document.querySelectorAll(".launch-v4 .ew-reveal")
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.remove("reveal-pending")
            observer.unobserve(entry.target)
          }
      },
      { threshold: 0.08 },
    )
    for (const element of elements) {
      if (element.getBoundingClientRect().top >= innerHeight) {
        element.classList.add("reveal-pending")
        observer.observe(element)
      }
    }
    return () => {
      observer.disconnect()
      for (const element of elements) element.classList.remove("reveal-pending")
    }
  }, [])
  return (
    <div
      className="launch-v4"
      data-platform={platform}
      data-theme={theme}
      id="top"
    >
      <Header
        signupEnabled={signupEnabled}
        dark={dark}
        onToggleTheme={toggleTheme}
      />
      <div className="launch-content">
        <main id="main">
          <Hero signupEnabled={signupEnabled} />
          <div className="gg-paper">
            <HowItStarts />
            <DayTimeline />
            <Availability signupEnabled={signupEnabled} />
            <LaunchPricing signupEnabled={signupEnabled} />
            <Faq />
          </div>
        </main>
        <Closing signupEnabled={signupEnabled} />
      </div>
      <div className={`b-float${floating ? " is-on" : ""}`} inert={!floating}>
        <span className="b-float-label">Showing</span>
        <PlatformSwitch />
      </div>
    </div>
  )
}
export function LaunchV4Landing(props: MarketingExperienceProps) {
  preload("/shop-v3/cal-sans.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  })
  preload("/shop-v3/inter-latin.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  })
  return (
    <PlatformProvider>
      <Landing {...props} />
    </PlatformProvider>
  )
}
