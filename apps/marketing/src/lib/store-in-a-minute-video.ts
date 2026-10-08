// Media and chapter configuration for the "Your store in a minute" section.
// Until both variant sources are configured the section shows a placeholder outside
// Production and renders nothing in Production.
//
// Timings match the verified 8 October Web/Mobile renders and their media
// contract (tools/marketing-video/output/media-contract.json). Chapter narration
// matches the typed-only QA rehearsal; publication date is set only on release.

export type StoreInAMinuteVariant = "web" | "mobile"

export type StoreInAMinuteChapterId =
  | "poultry"
  | "pharmacy"
  | "boutique"
  | "laundry"
  | "bakery"

export type StoreInAMinuteTranscriptLine = {
  speaker: "Narrator" | "Owner" | "Assistant"
  text: string
}

export type StoreInAMinuteChapter = {
  id: StoreInAMinuteChapterId
  /** Key from packages/utils/src/business-profiles.json, used for signup. */
  profileKey: string
  icon: string
  label: string
  /** Completes "Opens signup for a …". */
  signupAs: string
  /** How the owner tells the assistant what they sell. */
  line: string
  /** Fictional demo business shown in the video. */
  business: string
  transcript: StoreInAMinuteTranscriptLine[]
}

export type StoreInAMinuteVariantMedia = {
  variant: StoreInAMinuteVariant
  label: "Web" | "Mobile"
  src?: string
  poster?: string
  captions?: string
  durationSeconds: number
  chapterStarts: Record<StoreInAMinuteChapterId, number>
}

export type StoreInAMinuteConfig = {
  title: string
  description: string
  introTranscript: string
  outroTranscript: string
  /** ISO date the final video was published; set it when it goes live. */
  uploadDate?: string
  chapters: StoreInAMinuteChapter[]
  variants: Record<StoreInAMinuteVariant, StoreInAMinuteVariantMedia>
}

export type StoreInAMinuteEnv = {
  NODE_ENV?: string
  NEXT_PUBLIC_VERCEL_ENV?: string
  NEXT_PUBLIC_STORE_IN_A_MINUTE_UPLOAD_DATE?: string
  NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_SRC?: string
  NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_POSTER?: string
  NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_CAPTIONS?: string
  NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_SRC?: string
  NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_POSTER?: string
  NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_CAPTIONS?: string
}

// Next.js inlines NEXT_PUBLIC_* only when each name is written out literally.
function readEnv(): StoreInAMinuteEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_STORE_IN_A_MINUTE_UPLOAD_DATE:
      process.env.NEXT_PUBLIC_STORE_IN_A_MINUTE_UPLOAD_DATE,
    NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_SRC:
      process.env.NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_SRC,
    NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_POSTER:
      process.env.NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_POSTER,
    NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_CAPTIONS:
      process.env.NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_CAPTIONS,
    NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_SRC:
      process.env.NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_SRC,
    NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_POSTER:
      process.env.NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_POSTER,
    NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_CAPTIONS:
      process.env.NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_CAPTIONS,
  }
}

function clean(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export const STORE_IN_A_MINUTE_CHAPTERS: StoreInAMinuteChapter[] = [
  {
    id: "poultry",
    profileKey: "animal-feed-agricultural-supplies",
    icon: "🐔",
    label: "Poultry farm",
    signupAs: "poultry farm",
    line: "Types products, prices and stock",
    business: "Mama Bisi Farms (Demo QA), Ibadan",
    transcript: [
      {
        speaker: "Narrator",
        text: "Tell EwaTrade what you sell, your prices, and the stock you have. Check your setup list before adding anything to your business.",
      },
    ],
  },
  {
    id: "pharmacy",
    profileKey: "pharmacy-health-retail",
    icon: "💊",
    label: "Pharmacy",
    signupAs: "pharmacy",
    line: "Types a medicine price list",
    business: "Kano Care Pharmacy (Demo QA), Kano",
    transcript: [
      {
        speaker: "Narrator",
        text: "For a pharmacy, type your product list and prices. Review every item, and fill in any missing details before confirming.",
      },
    ],
  },
  {
    id: "boutique",
    profileKey: "fashion-apparel",
    icon: "👗",
    label: "Fashion boutique",
    signupAs: "fashion boutique",
    line: "Types products and opening stock",
    business: "Adaeze Styles (Demo QA), Enugu",
    transcript: [
      {
        speaker: "Narrator",
        text: "Start your fashion catalogue with the items you have today. This rehearsal lists sizes and colours as separate products. Review the details before adding.",
      },
    ],
  },
  {
    id: "laundry",
    profileKey: "laundry-dry-cleaning",
    icon: "🧺",
    label: "Laundry & dry cleaning",
    signupAs: "laundry or dry cleaner",
    line: "Types services and prices",
    business: "FreshPress Laundry (Demo QA), Abuja",
    transcript: [
      {
        speaker: "Narrator",
        text: "EwaTrade supports services too. Add your laundry services and their prices, then check the setup list before you confirm.",
      },
    ],
  },
  {
    id: "bakery",
    profileKey: "food-bakery-catering",
    icon: "🍞",
    label: "Bakery",
    signupAs: "bakery",
    line: "Types products and opening stock",
    business: "Sweet Crumbs Bakery (Demo QA), Lagos",
    transcript: [
      {
        speaker: "Narrator",
        text: "For a bakery, begin with your bread, cakes, prices, and opening stock. Build your catalogue one clear list at a time. Come. Trade. Together.",
      },
    ],
  },
]

// Verified edit: 8 s intro, five 26 s chapters, 8 s outro (146 s total).
const CHAPTER_STARTS: Record<StoreInAMinuteChapterId, number> = {
  poultry: 8,
  pharmacy: 34,
  boutique: 60,
  laundry: 86,
  bakery: 112,
}

export function getStoreInAMinuteConfig(
  env: StoreInAMinuteEnv = readEnv(),
): StoreInAMinuteConfig {
  return {
    title: "Your business. Your next chapter.",
    description:
      "Five fictional businesses rehearse typed setup in EwaTrade, review their products and services, and confirm what to add. The signup form is shown separately.",
    introTranscript:
      "Five businesses. One place to begin. A real EwaTrade setup rehearsal.",
    outroTranscript: "Your business. Your next chapter. Come. Trade. Together.",
    uploadDate: clean(env.NEXT_PUBLIC_STORE_IN_A_MINUTE_UPLOAD_DATE),
    chapters: STORE_IN_A_MINUTE_CHAPTERS,
    variants: {
      web: {
        variant: "web",
        label: "Web",
        src: clean(env.NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_SRC),
        poster: clean(env.NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_POSTER),
        captions: clean(env.NEXT_PUBLIC_STORE_IN_A_MINUTE_WEB_CAPTIONS),
        durationSeconds: 146,
        chapterStarts: { ...CHAPTER_STARTS },
      },
      mobile: {
        variant: "mobile",
        label: "Mobile",
        src: clean(env.NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_SRC),
        poster: clean(env.NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_POSTER),
        captions: clean(env.NEXT_PUBLIC_STORE_IN_A_MINUTE_MOBILE_CAPTIONS),
        durationSeconds: 146,
        chapterStarts: { ...CHAPTER_STARTS },
      },
    },
  }
}

/** Both variants have a playable source. */
export function isStoreInAMinuteVideoReady(
  config: StoreInAMinuteConfig = getStoreInAMinuteConfig(),
) {
  return Boolean(config.variants.web.src && config.variants.mobile.src)
}

/** Production (not a Vercel Preview) hides the section until it is ready. */
export function isStoreInAMinuteProduction(env: StoreInAMinuteEnv = readEnv()) {
  return (
    env.NODE_ENV === "production" && env.NEXT_PUBLIC_VERCEL_ENV !== "preview"
  )
}

export type StoreInAMinuteMode = "video" | "placeholder" | "hidden"

export function getStoreInAMinuteMode(
  env: StoreInAMinuteEnv = readEnv(),
): StoreInAMinuteMode {
  if (isStoreInAMinuteVideoReady(getStoreInAMinuteConfig(env))) return "video"
  return isStoreInAMinuteProduction(env) ? "hidden" : "placeholder"
}

export function getStoreInAMinuteChapter(id: StoreInAMinuteChapterId) {
  const chapter = STORE_IN_A_MINUTE_CHAPTERS.find((item) => item.id === id)
  if (!chapter) throw new Error(`Unknown chapter: ${id}`)
  return chapter
}

/** The chapter playing at `time` seconds into a variant. */
export function getChapterAtTime(
  media: Pick<StoreInAMinuteVariantMedia, "chapterStarts">,
  time: number,
  chapters: StoreInAMinuteChapter[] = STORE_IN_A_MINUTE_CHAPTERS,
): StoreInAMinuteChapterId {
  const ordered = [...chapters].sort(
    (a, b) => media.chapterStarts[a.id] - media.chapterStarts[b.id],
  )
  let current = ordered[0]?.id ?? "poultry"
  for (const chapter of ordered)
    if (time >= media.chapterStarts[chapter.id]) current = chapter.id
  return current
}

export const STORE_IN_A_MINUTE_PROGRESS_MILESTONES = [25, 50, 75, 100] as const
export type StoreInAMinuteMilestone =
  (typeof STORE_IN_A_MINUTE_PROGRESS_MILESTONES)[number]

/** Milestones reached at this playback position; 100 counts from 98%. */
export function getReachedMilestones(
  currentTime: number,
  duration: number,
): StoreInAMinuteMilestone[] {
  if (!Number.isFinite(duration) || duration <= 0) return []
  const percent = (currentTime / duration) * 100
  return STORE_IN_A_MINUTE_PROGRESS_MILESTONES.filter((milestone) =>
    milestone === 100 ? percent >= 98 : percent >= milestone,
  )
}

export function isHlsSource(src: string) {
  return /\.m3u8(?:$|[?#])/i.test(src)
}

type HlsMediaSourceCapabilities = {
  mediaSource?: { isTypeSupported(type: string): boolean }
  sourceBuffer?: {
    prototype?: { appendBuffer?: unknown; remove?: unknown }
  }
}

/** The published films use H264/AAC; mirror hls.js's relevant MSE checks. */
export function supportsStoreInAMinuteMediaSource({
  mediaSource,
  sourceBuffer,
}: HlsMediaSourceCapabilities) {
  try {
    return Boolean(
      mediaSource?.isTypeSupported(
        'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
      ) &&
        (!sourceBuffer ||
          (typeof sourceBuffer.prototype?.appendBuffer === "function" &&
            typeof sourceBuffer.prototype.remove === "function")),
    )
  } catch {
    return false
  }
}

/** Prefer bounded, seekable MSE playback even when native HLS is advertised. */
export function getStoreInAMinutePlaybackEngine(
  src: string,
  nativeHlsSupported: boolean,
  mediaSourceSupported: boolean,
): "native" | "hls" | "unsupported" {
  if (!isHlsSource(src)) return "native"
  if (mediaSourceSupported) return "hls"
  return nativeHlsSupported ? "native" : "unsupported"
}

function isoDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(whole / 60)
  return `PT${minutes ? `${minutes}M` : ""}${whole % 60}S`
}

function publicVideoUrl(value?: string) {
  if (!value) return undefined
  try {
    // Matches the marketing layout's canonical metadataBase.
    const url = new URL(value, "https://ewatrade.com")
    return /^https?:$/.test(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

/** schema.org VideoObject, only once the video is ready. */
export function getStoreInAMinuteJsonLd(
  config: StoreInAMinuteConfig = getStoreInAMinuteConfig(),
) {
  if (
    !isStoreInAMinuteVideoReady(config) ||
    !config.variants.web.poster ||
    !config.uploadDate ||
    !Number.isFinite(Date.parse(config.uploadDate))
  )
    return null
  const web = config.variants.web
  const contentUrl = publicVideoUrl(web.src)
  const thumbnailUrl = publicVideoUrl(web.poster)
  if (!contentUrl || !thumbnailUrl) return null
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: config.title,
    description: config.description,
    contentUrl,
    duration: isoDuration(web.durationSeconds),
    thumbnailUrl: [thumbnailUrl],
    ...(config.uploadDate ? { uploadDate: config.uploadDate } : {}),
  }
}

export function formatVideoTime(seconds: number) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

/** Preserve position within the current business when the edits have different timings. */
export function getVariantSwitchTime(
  from: StoreInAMinuteVariantMedia,
  to: StoreInAMinuteVariantMedia,
  time: number,
  chapter: StoreInAMinuteChapterId,
) {
  const ids = STORE_IN_A_MINUTE_CHAPTERS.map((item) => item.id)
  const index = ids.indexOf(chapter)
  const next = ids[index + 1]
  const start = from.chapterStarts[chapter]
  const end = next ? from.chapterStarts[next] : from.durationSeconds
  const fraction = Math.max(
    0,
    Math.min(1, (time - start) / Math.max(1, end - start)),
  )
  const targetStart = to.chapterStarts[chapter]
  const targetEnd = next ? to.chapterStarts[next] : to.durationSeconds
  return targetStart + fraction * (targetEnd - targetStart)
}
