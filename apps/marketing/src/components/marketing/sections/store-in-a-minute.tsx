"use client"

import { getCreateStoreCta } from "@/lib/create-store-url"
import {
  type StoreInAMinuteContext,
  createStoreInAMinuteAnalytics,
} from "@/lib/store-in-a-minute-analytics"
import {
  STORE_IN_A_MINUTE_CHAPTERS,
  type StoreInAMinuteChapterId,
  type StoreInAMinuteVariant,
  type StoreInAMinuteVariantMedia,
  getChapterAtTime,
  getReachedMilestones,
  getStoreInAMinuteChapter,
  getStoreInAMinuteConfig,
  getStoreInAMinuteJsonLd,
  getStoreInAMinuteMode,
  getVariantSwitchTime,
} from "@/lib/store-in-a-minute-video"
import { useEvents } from "@ewatrade/events/client"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import {
  type StoreInAMinutePlaybackPreferences,
  StoreInAMinutePlayer,
  type StoreInAMinutePlayerHandle,
} from "./store-in-a-minute-player"
import "./store-in-a-minute.css"

export type StoreInAMinuteProps = {
  signupEnabled: boolean
}

const VARIANTS: StoreInAMinuteVariant[] = ["web", "mobile"]

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="shop-eyebrow">
      <span aria-hidden="true" />
      {children}
    </p>
  )
}

function useClientPreferences() {
  const [preferences, setPreferences] = useState({
    narrow: false,
    autoplayAllowed: false,
    resolved: false,
  })
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 719px)")
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const connection = (
      navigator as Navigator & {
        connection?: EventTarget & { saveData?: boolean }
      }
    ).connection
    const sync = () =>
      setPreferences({
        narrow: narrow.matches,
        autoplayAllowed: !reduced.matches && !connection?.saveData,
        resolved: true,
      })
    sync()
    reduced.addEventListener("change", sync)
    connection?.addEventListener("change", sync)
    return () => {
      reduced.removeEventListener("change", sync)
      connection?.removeEventListener("change", sync)
    }
  }, [])
  return preferences
}

function Frame({
  variant,
  children,
}: {
  variant: StoreInAMinuteVariant
  children: ReactNode
}) {
  if (variant === "mobile")
    return (
      <div className="shop-sim-phone">
        <span className="shop-sim-notch" aria-hidden="true" />
        {children}
      </div>
    )
  return (
    <div className="shop-sim-browser">
      <div className="shop-sim-browser-bar" aria-hidden="true">
        <span className="shop-sim-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="shop-sim-address">dashboard.ewatrade.com/signup</span>
      </div>
      {children}
    </div>
  )
}

function VariantToggle({
  value,
  onChange,
}: {
  value: StoreInAMinuteVariant
  onChange(variant: StoreInAMinuteVariant): void
}) {
  return (
    <fieldset className="shop-sim-toggle">
      <legend className="shop-sim-visually-hidden">Video version</legend>
      {VARIANTS.map((variant) => (
        <label key={variant}>
          <input
            type="radio"
            name="store-in-a-minute-variant"
            value={variant}
            checked={value === variant}
            onChange={() => onChange(variant)}
          />
          {variant === "web" ? "Web" : "Mobile"}
        </label>
      ))}
    </fieldset>
  )
}

function BusinessRail({
  active,
  onSelect,
}: {
  active: StoreInAMinuteChapterId
  onSelect(id: StoreInAMinuteChapterId): void
}) {
  return (
    <ol className="shop-sim-rail" aria-label="Businesses in the video">
      {STORE_IN_A_MINUTE_CHAPTERS.map((chapter) => (
        <li key={chapter.id}>
          <button
            type="button"
            aria-current={chapter.id === active ? "true" : undefined}
            onClick={() => onSelect(chapter.id)}
          >
            <span className="shop-sim-rail-icon" aria-hidden="true">
              {chapter.icon}
            </span>
            <span>
              <b>{chapter.label}</b>
              <small>{chapter.line}</small>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function PlaceholderScreen({ chapter }: { chapter: StoreInAMinuteChapterId }) {
  const item = getStoreInAMinuteChapter(chapter)
  return (
    <div className="shop-sim-screen shop-sim-placeholder">
      <span className="shop-sim-placeholder-icon" aria-hidden="true">
        {item.icon}
      </span>
      <b>{item.business}</b>
      <span>{item.line}</span>
      <small>Video coming soon</small>
    </div>
  )
}

function Transcript() {
  return (
    <details className="shop-sim-transcript">
      <summary>
        Read the transcript
        <span aria-hidden="true">+</span>
      </summary>
      <div>
        {STORE_IN_A_MINUTE_CHAPTERS.map((chapter) => (
          <section key={chapter.id} aria-labelledby={`sim-t-${chapter.id}`}>
            <h3 id={`sim-t-${chapter.id}`}>
              {chapter.label} <span>· {chapter.business}</span>
            </h3>
            {chapter.transcript.map((line) => (
              <p key={line.text}>
                <b>{line.speaker}:</b> {line.text}
              </p>
            ))}
          </section>
        ))}
      </div>
    </details>
  )
}

export function StoreInAMinute({ signupEnabled }: StoreInAMinuteProps) {
  const mode = getStoreInAMinuteMode()
  const config = useMemo(() => getStoreInAMinuteConfig(), [])
  const jsonLd = useMemo(() => getStoreInAMinuteJsonLd(config), [config])
  const preferences = useClientPreferences()
  const { track } = useEvents()
  const analytics = useMemo(() => createStoreInAMinuteAnalytics(), [])
  const [variant, setVariant] = useState<StoreInAMinuteVariant>("web")
  const [chapter, setChapter] = useState<StoreInAMinuteChapterId>("poultry")
  const videoRef = useRef<HTMLVideoElement>(null)
  const pendingSeek = useRef<number | null>(null)
  const playerRef = useRef<StoreInAMinutePlayerHandle | null>(null)
  const playbackPreferences = useRef<StoreInAMinutePlaybackPreferences>({
    intent: null,
    muted: true,
    captionsOn: true,
    captionsTouched: false,
  })
  const context = useRef<StoreInAMinuteContext>({ chapter, variant })
  context.current = { chapter, variant }
  const chosenVariant = useRef(false)
  const watchedSeconds = useRef({ web: 0, mobile: 0 })

  useEffect(() => {
    if (preferences.resolved && !chosenVariant.current)
      setVariant(preferences.narrow ? "mobile" : "web")
  }, [preferences.resolved, preferences.narrow])

  if (mode === "hidden") return null

  const media: StoreInAMinuteVariantMedia = config.variants[variant]
  const active = getStoreInAMinuteChapter(chapter)
  const cta = getCreateStoreCta(signupEnabled, active.profileKey)

  function switchVariant(next: StoreInAMinuteVariant) {
    chosenVariant.current = true
    if (next === variant) return
    const video = videoRef.current
    pendingSeek.current = getVariantSwitchTime(
      media,
      config.variants[next],
      video?.currentTime ?? media.chapterStarts[chapter],
      chapter,
    )
    setVariant(next)
    analytics.variantSwitch(track, { chapter, variant: next })
  }

  function selectChapter(id: StoreInAMinuteChapterId) {
    setChapter(id)
    analytics.chapterSelect(track, { chapter: id, variant })
    if (mode === "video") playerRef.current?.seek(media.chapterStarts[id])
  }

  return (
    <section
      className="shop-sim shop-wrap"
      id="store-in-a-minute"
      aria-labelledby="store-in-a-minute-title"
    >
      {jsonLd ? (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped JSON-LD per Next.js guidance
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}
      <div className="shop-sim-top">
        <div className="shop-section-heading shop-sim-heading">
          <Eyebrow>Five businesses, one setup</Eyebrow>
          <h2 id="store-in-a-minute-title">
            Your business. <em>Your next chapter.</em>
          </h2>
          <p>
            See five fictional businesses rehearse setup, from typed lists to
            reviewed drafts.
          </p>
        </div>
        <VariantToggle value={variant} onChange={switchVariant} />
      </div>
      <div className="shop-sim-layout" data-variant={variant}>
        <div className="shop-sim-stage">
          {mode === "video" ? (
            <StoreInAMinutePlayer
              key={variant}
              media={media}
              videoRef={videoRef}
              pendingSeek={pendingSeek}
              autoplayAllowed={preferences.autoplayAllowed}
              playerRef={playerRef}
              playbackPreferences={playbackPreferences}
              onPlay={() => analytics.view(track, context.current)}
              onUnmute={() => analytics.unmute(track, context.current)}
              onTimeChange={(time, duration, watched) => {
                if (videoRef.current?.seeking) return
                const next = getChapterAtTime(media, time)
                if (next !== context.current.chapter) setChapter(next)
                watchedSeconds.current[variant] += watched
                analytics.progress(
                  track,
                  { ...context.current, chapter: next },
                  getReachedMilestones(
                    watchedSeconds.current[variant],
                    duration,
                  ),
                )
              }}
              renderFrame={(screen) => (
                <Frame variant={variant}>{screen}</Frame>
              )}
            />
          ) : (
            <>
              <Frame variant={variant}>
                <PlaceholderScreen chapter={chapter} />
              </Frame>
              <p className="shop-sim-note">
                Preview only · Choose a business to see its chapter
              </p>
            </>
          )}
        </div>
        <BusinessRail active={chapter} onSelect={selectChapter} />
      </div>
      <p className="shop-sim-review-note">
        QA rehearsal with fictional businesses. The signup form is shown
        separately; this edited demo does not measure full signup time.
      </p>
      <Transcript />
      <div className="shop-sim-cta">
        <a
          className="shop-button"
          href={cta.href}
          onClick={() => analytics.ctaClick(track, context.current, cta.kind)}
        >
          {cta.label} <span aria-hidden="true">↗</span>
        </a>
        <small>
          {cta.kind === "signup"
            ? `Free to start · Opens signup for a ${active.signupAs}`
            : "Tell us about your business and we’ll help you set up"}
        </small>
      </div>
    </section>
  )
}
