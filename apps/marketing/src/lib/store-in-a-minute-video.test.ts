import { afterEach, expect, test } from "bun:test"
import type { EventMetadata } from "@ewatrade/events/metadata"
import { safeEventMetadata } from "@ewatrade/events/metadata"
import { BUSINESS_PROFILES } from "@ewatrade/utils/business-profiles"
import { getCreateStoreCta, getCreateStoreUrl } from "./create-store-url"
import { createStoreInAMinuteAnalytics } from "./store-in-a-minute-analytics"
import {
  STORE_IN_A_MINUTE_CHAPTERS,
  getChapterAtTime,
  getReachedMilestones,
  getStoreInAMinuteConfig,
  getStoreInAMinuteJsonLd,
  getStoreInAMinuteMode,
  getVariantSwitchTime,
  isHlsSource,
  isStoreInAMinuteVideoReady,
} from "./store-in-a-minute-video"

const previous = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_DASHBOARD_URL: process.env.NEXT_PUBLIC_DASHBOARD_URL,
}
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else Reflect.set(process.env, key, value)
  }
})

const ready = {
  NODE_ENV: "production",
  NEXT_PUBLIC_STORE_IN_A_MINUTE_UPLOAD_DATE: "2026-10-08T10:00:00Z",
  NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_SRC: "https://stream.example.com/web.m3u8",
  NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_POSTER: "https://img.example.com/web.jpg",
  NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_SRC: "https://cdn.example.com/m.mp4",
}

test("the video is ready only when both variants have a source", () => {
  expect(isStoreInAMinuteVideoReady(getStoreInAMinuteConfig({}))).toBe(false)
  expect(
    isStoreInAMinuteVideoReady(
      getStoreInAMinuteConfig({
        NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_SRC: "https://cdn.example.com/w.mp4",
        NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_SRC: "  ",
      }),
    ),
  ).toBe(false)
  expect(isStoreInAMinuteVideoReady(getStoreInAMinuteConfig(ready))).toBe(true)
})

test("missing video hides the section in Production and previews it elsewhere", () => {
  expect(getStoreInAMinuteMode({ NODE_ENV: "production" })).toBe("hidden")
  expect(
    getStoreInAMinuteMode({
      NODE_ENV: "production",
      NEXT_PUBLIC_VERCEL_ENV: "preview",
    }),
  ).toBe("placeholder")
  expect(getStoreInAMinuteMode({ NODE_ENV: "development" })).toBe("placeholder")
  expect(getStoreInAMinuteMode(ready)).toBe("video")
})

test("chapters use real business profile keys and share ids across variants", () => {
  const keys = new Set(BUSINESS_PROFILES.map((profile) => profile.key))
  for (const chapter of STORE_IN_A_MINUTE_CHAPTERS)
    expect(keys.has(chapter.profileKey)).toBe(true)
  const config = getStoreInAMinuteConfig({})
  const ids = STORE_IN_A_MINUTE_CHAPTERS.map((chapter) => chapter.id).sort()
  expect(Object.keys(config.variants.web.chapterStarts).sort()).toEqual(ids)
  expect(Object.keys(config.variants.mobile.chapterStarts).sort()).toEqual(ids)
})

test("chapter lookup follows each variant's own start times", () => {
  const media = {
    chapterStarts: {
      poultry: 0,
      pharmacy: 30,
      boutique: 60,
      laundry: 90,
      bakery: 120,
    },
  }
  expect(getChapterAtTime(media, 0)).toBe("poultry")
  expect(getChapterAtTime(media, 29.9)).toBe("poultry")
  expect(getChapterAtTime(media, 30)).toBe("pharmacy")
  expect(getChapterAtTime(media, 95)).toBe("laundry")
  expect(getChapterAtTime(media, 500)).toBe("bakery")
  expect(
    getChapterAtTime(
      { chapterStarts: { ...media.chapterStarts, poultry: 4 } },
      1,
    ),
  ).toBe("poultry")
})

test("progress milestones and HLS detection", () => {
  expect(getReachedMilestones(10, 100)).toEqual([])
  expect(getReachedMilestones(50, 100)).toEqual([25, 50])
  expect(getReachedMilestones(98, 100)).toEqual([25, 50, 75, 100])
  expect(getReachedMilestones(10, Number.NaN)).toEqual([])
  expect(isHlsSource("https://stream.mux.com/abc.m3u8?token=x")).toBe(true)
  expect(isHlsSource("https://cdn.example.com/video.mp4")).toBe(false)
})

test("VideoObject JSON-LD waits for both sources, a poster and a valid publication date", () => {
  expect(
    getStoreInAMinuteJsonLd(
      getStoreInAMinuteConfig({
        ...ready,
        NEXT_PUBLIC_STORE_IN_A_MINUTE_UPLOAD_DATE: undefined,
      }),
    ),
  ).toBeNull()
  expect(
    getStoreInAMinuteJsonLd(
      getStoreInAMinuteConfig({
        ...ready,
        NEXT_PUBLIC_STORE_IN_A_MINUTE_UPLOAD_DATE: "invalid",
      }),
    ),
  ).toBeNull()
  expect(
    getStoreInAMinuteJsonLd(
      getStoreInAMinuteConfig({
        ...ready,
        NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_POSTER: undefined,
      }),
    ),
  ).toBeNull()
  expect(getStoreInAMinuteJsonLd(getStoreInAMinuteConfig({}))).toBeNull()
  expect(getStoreInAMinuteJsonLd(getStoreInAMinuteConfig(ready))).toMatchObject(
    {
      "@type": "VideoObject",
      contentUrl: ready.NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_SRC,
      thumbnailUrl: [ready.NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_POSTER],
      duration: "PT2M57S",
    },
  )
})

test("signup URL carries the chapter's business profile", () => {
  Reflect.set(process.env, "NODE_ENV", "production")
  process.env.NEXT_PUBLIC_DASHBOARD_URL = "https://dashboard.ewatrade.com"
  expect(getCreateStoreUrl("pharmacy-health-retail")).toBe(
    "https://dashboard.ewatrade.com/signup?profile=pharmacy-health-retail",
  )
  expect(getCreateStoreUrl()).toBe("https://dashboard.ewatrade.com/signup")
  expect(getCreateStoreCta(true, "fashion-apparel")).toEqual({
    href: "https://dashboard.ewatrade.com/signup?profile=fashion-apparel",
    label: "Create your store",
    kind: "signup",
  })
  expect(getCreateStoreCta(false, "fashion-apparel")).toEqual({
    href: "/contact",
    label: "Talk to us",
    kind: "contact",
  })
})

test("video analytics map onto the shared event metadata schema", () => {
  const events: { name: string; properties: EventMetadata }[] = []
  const track = (name: string, properties: EventMetadata) =>
    events.push({ name, properties })
  const analytics = createStoreInAMinuteAnalytics()
  const context = { chapter: "bakery", variant: "mobile" } as const
  analytics.view(track, context)
  analytics.view(track, context)
  analytics.progress(track, context, [25, 50])
  analytics.progress(track, context, [25, 50, 75])
  analytics.ctaClick(track, context, "signup")
  expect(events.map(({ name }) => name)).toEqual([
    "video_view",
    "video_progress",
    "video_progress",
    "video_progress",
    "video_cta_click",
  ])
  expect(events[3]?.properties).toEqual({
    surface: "marketing",
    category: "store_in_a_minute",
    channel: "mobile",
    action: "bakery",
    item_count: 75,
  })
  for (const event of events)
    expect(safeEventMetadata(event.properties)).toEqual(event.properties)
  const throwing = () => {
    throw new Error("offline")
  }
  expect(() => analytics.unmute(throwing, context)).not.toThrow()
})

test("switching edits keeps the position within the same business", () => {
  const { web, mobile } = getStoreInAMinuteConfig({}).variants
  mobile.chapterStarts.pharmacy = 40
  mobile.chapterStarts.boutique = 80
  expect(getVariantSwitchTime(web, mobile, 54, "pharmacy")).toBe(60)
  expect(getVariantSwitchTime(web, mobile, 0, "pharmacy")).toBe(40)
  expect(getVariantSwitchTime(web, mobile, 1000, "pharmacy")).toBe(80)
})

test("launch copy describes typed setup while media inputs remain disabled", () => {
  const config = getStoreInAMinuteConfig({})
  const copy = [
    config.description,
    ...config.chapters.flatMap((chapter) => [
      chapter.line,
      ...chapter.transcript.map((line) => line.text),
    ]),
  ].join(" ")
  expect(copy).not.toMatch(/voice note|photo|upload|spreadsheet|read aloud/i)
})

test("same-origin video metadata uses absolute canonical URLs", () => {
  expect(
    getStoreInAMinuteJsonLd(
      getStoreInAMinuteConfig({
        ...ready,
        NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_SRC: "/video/web.m3u8",
        NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_POSTER: "/video/web.jpg",
      }),
    ),
  ).toMatchObject({
    contentUrl: "https://ewatrade.com/video/web.m3u8",
    thumbnailUrl: ["https://ewatrade.com/video/web.jpg"],
  })
  expect(
    getStoreInAMinuteJsonLd(
      getStoreInAMinuteConfig({
        ...ready,
        NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_SRC: "data:video/mp4;base64,AAAA",
      }),
    ),
  ).toBeNull()
})
