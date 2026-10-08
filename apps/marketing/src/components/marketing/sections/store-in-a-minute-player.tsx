"use client"

import {
  type StoreInAMinuteVariantMedia,
  formatVideoTime,
  isHlsSource,
} from "@/lib/store-in-a-minute-video"
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

type HlsInstance = {
  destroy(): void
  startLoad(startPosition?: number): void
  stopLoad(): void
  on(
    event: string,
    callback: (event: string, data: { fatal?: boolean }) => void,
  ): void
}

export type StoreInAMinutePlaybackPreferences = {
  intent: boolean | null
  muted: boolean
  captionsOn: boolean
  captionsTouched: boolean
}

export type StoreInAMinutePlayerHandle = { seek(time: number): void }

export type StoreInAMinutePlayerProps = {
  playerRef: RefObject<StoreInAMinutePlayerHandle | null>
  playbackPreferences: RefObject<StoreInAMinutePlaybackPreferences>
  media: StoreInAMinuteVariantMedia
  videoRef: RefObject<HTMLVideoElement | null>
  /** Seconds to seek to once the current source has metadata. */
  pendingSeek: RefObject<number | null>
  /** False with reduced motion or Save-Data: show the poster and wait. */
  autoplayAllowed: boolean
  onTimeChange(time: number, duration: number, watchedSeconds: number): void
  onPlay(): void
  onUnmute(): void
  /** Browser or phone chrome around the screen. */
  renderFrame(screen: ReactNode): ReactNode
}

function useCaptionsCrossOrigin(captions?: string) {
  const [crossOrigin, setCrossOrigin] = useState<"anonymous" | undefined>()
  useEffect(() => {
    if (!captions) return setCrossOrigin(undefined)
    try {
      const url = new URL(captions, window.location.href)
      setCrossOrigin(
        url.origin === window.location.origin ? undefined : "anonymous",
      )
    } catch {
      setCrossOrigin(undefined)
    }
  }, [captions])
  return crossOrigin
}

/** Starts a paused video, loading HLS segments only when playback begins. */
export function playStoreInAMinuteVideo(video: HTMLVideoElement | null) {
  video?.play().catch(() => {
    // Autoplay can still be refused (e.g. Low Power Mode); keep the poster.
  })
}

export function StoreInAMinutePlayer({
  media,
  playerRef,
  playbackPreferences,
  videoRef,
  pendingSeek,
  autoplayAllowed,
  onTimeChange,
  onPlay,
  onUnmute,
  renderFrame,
}: StoreInAMinutePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Each keyed player owns its seek; teardown events from the old source must
  // never consume the next variant’s pending position.
  const seekTarget = useRef(pendingSeek.current)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(playbackPreferences.current.muted)
  const [captionsOn, setCaptionsOn] = useState(
    playbackPreferences.current.captionsOn,
  )
  const [time, setTime] = useState(seekTarget.current ?? 0)
  const [duration, setDuration] = useState(media.durationSeconds)
  const [started, setStarted] = useState(false)
  const [activated, setActivated] = useState(false)
  const [visible, setVisible] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(true)
  const visibleNow = useRef(false)
  visibleNow.current = visible
  const policyNow = useRef(autoplayAllowed)
  policyNow.current = autoplayAllowed
  const lastTime = useRef<number | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const readyToPlay = useRef(false)
  const hls = useRef<HlsInstance | null>(null)
  const hlsLoading = useRef(false)
  const crossOrigin = useCaptionsCrossOrigin(media.captions)
  const src = media.src

  const play = useCallback(() => {
    setActivated(true)
    const video = videoRef.current
    if (
      !readyToPlay.current &&
      video &&
      src &&
      (!isHlsSource(src) || video.canPlayType("application/vnd.apple.mpegurl"))
    ) {
      // Keep native unmuted playback inside the visitor's click gesture.
      video.src = src
      video.load()
      readyToPlay.current = true
    }
    if (!readyToPlay.current) return
    if (hls.current && !hlsLoading.current) {
      hlsLoading.current = true
      hls.current.startLoad(seekTarget.current ?? -1)
    }
    playStoreInAMinuteVideo(videoRef.current)
  }, [videoRef, src])

  const seek = useCallback(
    (position: number) => {
      const video = videoRef.current
      seekTarget.current = position
      if (video && video.readyState >= 1) {
        video.currentTime = Math.min(
          position,
          video.duration || media.durationSeconds,
        )
        seekTarget.current = null
      }
      playbackPreferences.current.intent = true
      play()
    },
    [media.durationSeconds, playbackPreferences, play, videoRef],
  )

  useImperativeHandle(playerRef, () => ({ seek }), [seek])

  // Attach sources only after an in-view autoplay or an explicit play/seek.
  // This also prevents caption and HLS manifest requests under Save-Data.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt intentionally reloads a failed source.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src || !activated) return
    let disposed = false
    readyToPlay.current = false
    setError(false)
    const resume = () => {
      readyToPlay.current = true
      const intent = playbackPreferences.current.intent
      if (
        visibleNow.current &&
        !document.hidden &&
        (intent === true || (intent === null && policyNow.current))
      )
        play()
    }
    if (
      !isHlsSource(src) ||
      video.canPlayType("application/vnd.apple.mpegurl")
    ) {
      if (video.getAttribute("src") !== src) {
        video.src = src
        video.load()
      }
      resume()
    } else {
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (disposed) return
          if (!Hls.isSupported()) {
            setError(true)
            return
          }
          const instance = new Hls({
            autoStartLoad: false,
            capLevelToPlayerSize: true,
            startLevel: 0,
            maxBufferLength: 12,
            maxMaxBufferLength: 24,
            backBufferLength: 0,
          })
          hls.current = instance
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setError(true)
          })
          instance.loadSource(src)
          instance.attachMedia(video)
          resume()
        })
        .catch(() => {
          if (!disposed) setError(true)
        })
    }
    return () => {
      disposed = true
      readyToPlay.current = false
      hls.current?.destroy()
      hls.current = null
      hlsLoading.current = false
      video.pause()
      video.removeAttribute("src")
      video.load()
    }
  }, [src, activated, attempt, videoRef, play, playbackPreferences])

  // Autoplay stays muted; an explicit pause survives scrolling and version changes.
  useEffect(() => {
    const video = videoRef.current
    if (!visible || !documentVisible) {
      video?.pause()
      return
    }
    const intent = playbackPreferences.current.intent
    if (intent === true || (intent === null && autoplayAllowed)) play()
    else video?.pause()
  }, [
    autoplayAllowed,
    visible,
    documentVisible,
    play,
    videoRef,
    playbackPreferences,
  ])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(
          Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.5),
        )
      },
      { threshold: [0, 0.5] },
    )
    observer.observe(container)
    const visibility = () => setDocumentVisible(!document.hidden)
    visibility()
    document.addEventListener("visibilitychange", visibility)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [])

  // Captions follow the toggle; by default they show while muted.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const sync = () => {
      for (const track of Array.from(video.textTracks))
        track.mode = captionsOn ? "showing" : "hidden"
    }
    sync()
    video.textTracks.addEventListener("addtrack", sync)
    return () => video.textTracks.removeEventListener("addtrack", sync)
  }, [captionsOn, videoRef])

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      playbackPreferences.current.intent = true
      if (error) {
        setAttempt((value) => value + 1)
        setError(false)
      }
      play()
    } else {
      playbackPreferences.current.intent = false
      video.pause()
    }
  }

  function toggleSound() {
    const video = videoRef.current
    if (!video) return
    const nextMuted = !video.muted
    video.muted = nextMuted
    playbackPreferences.current.muted = nextMuted
    setMuted(nextMuted)
    if (!playbackPreferences.current.captionsTouched) {
      playbackPreferences.current.captionsOn = nextMuted
      setCaptionsOn(nextMuted)
    }
    if (!nextMuted) {
      onUnmute()
      if (video.paused) {
        playbackPreferences.current.intent = true
        play()
      }
    }
  }

  function toggleFullscreen() {
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
      return
    }
    const container = containerRef.current
    if (container?.requestFullscreen)
      void container.requestFullscreen().catch(() => {})
    else video?.webkitEnterFullscreen?.()
  }

  const progress = duration ? Math.min(100, (time / duration) * 100) : 0
  const screen = (
    <div className="shop-sim-screen">
      <video
        ref={videoRef}
        className="shop-sim-video"
        poster={media.poster}
        preload="none"
        muted={muted}
        loop
        playsInline
        crossOrigin={crossOrigin}
        aria-label={`Business setup rehearsal, ${media.label.toLowerCase()} version`}
        onPlay={() => {
          lastTime.current = videoRef.current?.currentTime ?? null
          setPlaying(true)
          setStarted(true)
          onPlay()
        }}
        onPause={() => {
          setPlaying(false)
          if (hls.current && hlsLoading.current) {
            hls.current.stopLoad()
            hlsLoading.current = false
          }
        }}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          if (Number.isFinite(video.duration) && video.duration > 0)
            setDuration(video.duration)
        }}
        onCanPlay={(event) => {
          if (seekTarget.current !== null) {
            event.currentTarget.currentTime = seekTarget.current
            seekTarget.current = null
          }
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget
          const delta =
            lastTime.current === null ? 0 : video.currentTime - lastTime.current
          const watched =
            !video.paused && !video.seeking && delta > 0 && delta <= 2
              ? delta
              : 0
          lastTime.current = video.currentTime
          setTime(video.currentTime)
          onTimeChange(
            video.currentTime,
            Number.isFinite(video.duration) && video.duration > 0
              ? video.duration
              : media.durationSeconds,
            watched,
          )
        }}
        onSeeking={() => {
          lastTime.current = null
        }}
        onSeeked={(event) => {
          lastTime.current = event.currentTarget.currentTime
        }}
        onVolumeChange={(event) => {
          playbackPreferences.current.muted = event.currentTarget.muted
          setMuted(event.currentTarget.muted)
        }}
        onError={() => setError(true)}
      >
        {activated && media.captions ? (
          <track
            kind="captions"
            src={media.captions}
            srcLang="en"
            label="English"
            default
          />
        ) : null}
      </video>
      {!playing && !started && !error ? (
        <button
          type="button"
          className="shop-sim-big-play"
          onClick={togglePlay}
        >
          <span aria-hidden="true">▶</span> Play the video
        </button>
      ) : null}
    </div>
  )

  return (
    <div className="shop-sim-player" ref={containerRef}>
      {renderFrame(screen)}
      {error ? (
        <output className="shop-sim-note">
          The video could not load. Read the transcript or{" "}
          <button
            type="button"
            onClick={() => {
              playbackPreferences.current.intent = true
              setAttempt((value) => value + 1)
              play()
            }}
          >
            try again
          </button>
          .
        </output>
      ) : null}
      <div className="shop-sim-controls">
        <button
          type="button"
          className="shop-sim-icon-button"
          onClick={togglePlay}
          aria-label={playing ? "Pause video" : "Play video"}
        >
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
        </button>
        <button
          type="button"
          className="shop-sim-sound"
          onClick={toggleSound}
          aria-pressed={!muted}
        >
          <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
          {muted ? "Turn on sound" : "Mute"}
        </button>
        {media.captions ? (
          <button
            type="button"
            className="shop-sim-icon-button shop-sim-cc"
            aria-pressed={captionsOn}
            aria-label="Captions"
            onClick={() => {
              playbackPreferences.current.captionsTouched = true
              playbackPreferences.current.captionsOn = !captionsOn
              setCaptionsOn(!captionsOn)
            }}
          >
            CC
          </button>
        ) : null}
        <label className="shop-sim-progress">
          <span className="shop-sim-visually-hidden">Video position</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(duration))}
            step={1}
            value={Math.min(Math.floor(time), Math.floor(duration))}
            aria-valuetext={`${formatVideoTime(time)} of ${formatVideoTime(duration)}`}
            style={{ "--progress": `${progress}%` } as CSSProperties}
            onChange={(event) => {
              const video = videoRef.current
              const position = Number(event.currentTarget.value)
              if (video && video.readyState >= 1) video.currentTime = position
              else seekTarget.current = position
              setTime(position)
            }}
          />
        </label>
        <span className="shop-sim-time" aria-hidden="true">
          {formatVideoTime(time)} / {formatVideoTime(duration)}
        </span>
        <button
          type="button"
          className="shop-sim-icon-button"
          onClick={toggleFullscreen}
          aria-label="Full screen"
        >
          <span aria-hidden="true">⛶</span>
        </button>
      </div>
    </div>
  )
}
