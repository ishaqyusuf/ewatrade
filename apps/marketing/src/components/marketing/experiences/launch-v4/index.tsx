"use client"
import { captureMarketingClick } from "@/lib/marketing-interactions"
import { useEvents } from "@ewatrade/events/client"
import { useEffect, useState } from "react"
import { preload } from "react-dom"
import type { MarketingExperienceProps } from "../../marketing-experience-contract"
import { AssistantFab } from "./assistant-fab"
import { BusinessTypesV15 } from "./business-types-v15"
import { HeaderV15, WhatsAppAnnouncement } from "./header-v15"
import { HeroV15 } from "./hero-v15"
import { NativePreview } from "./native-preview"
import {
  ClosingV15,
  FaqV15,
  FeatureSuite,
  FooterV15,
  WorkspaceSection,
} from "./page-sections"
import { PricingV15 } from "./pricing-v15"
import { Walkthrough } from "./walkthrough"
import { WhatsAppV15 } from "./whatsapp-v15"
import "./styles/base.css"
import "./styles/product-ui.css"
import "./styles/whatsapp-launch.css"
import "./styles/sections.css"
import "./styles/integration.css"
export function LaunchV4Landing({ signupEnabled }: MarketingExperienceProps) {
  const { track } = useEvents()
  const [theme, setTheme] = useState<"light" | "dark">()
  const [systemDark, setSystemDark] = useState(false)
  const [walkRequest, setWalkRequest] = useState<{ index: number } | null>(null)
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)")
    const syncSystem = () => setSystemDark(media.matches)
    const syncSaved = () => {
      try {
        const saved = localStorage.getItem("ewatrade-marketing-theme")
        setTheme(saved === "light" || saved === "dark" ? saved : undefined)
      } catch {}
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
  function toggleTheme() {
    const next = dark ? "light" : "dark"
    setTheme(next)
    try {
      localStorage.setItem("ewatrade-marketing-theme", next)
    } catch {}
  }
  preload("/shop-v3/inter-latin.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  })
  preload("/marketing-fonts/hedvig-letters-serif.ttf", {
    as: "font",
    type: "font/ttf",
    crossOrigin: "anonymous",
  })
  return (
    <div
      className="launch-v4 ewm"
      data-theme={dark ? "dark" : "light"}
      id="top"
      onClickCapture={(event) => {
        captureMarketingClick(track, event.target)
        if (event.target instanceof Element) {
          const value =
            event.target.closest<HTMLElement>("[data-jump-step]")?.dataset
              .jumpStep
          if (value !== undefined) {
            const index = Number(value)
            if (Number.isInteger(index) && index >= 0 && index < 5)
              setWalkRequest({ index })
          }
        }
      }}
    >
      <HeaderV15
        signupEnabled={signupEnabled}
        dark={dark}
        onToggleTheme={toggleTheme}
      />
      <main id="main">
        <WhatsAppAnnouncement />
        <HeroV15 signupEnabled={signupEnabled} />
        <WhatsAppV15 />
        <Walkthrough request={walkRequest} />
        <FeatureSuite />
        <WorkspaceSection />
        <NativePreview />
        <BusinessTypesV15 />
        <PricingV15 signupEnabled={signupEnabled} />
        <FaqV15 />
        <ClosingV15 signupEnabled={signupEnabled} />
      </main>
      <FooterV15 dark={dark} onToggleTheme={toggleTheme} />
      <AssistantFab signupEnabled={signupEnabled} dark={dark} />
    </div>
  )
}
