import React from "react"
import {
  AbsoluteFill,
  Audio,
  Composition,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  registerRoot,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

const colors = {
  paper: "#f5f1e8",
  ink: "#24382f",
  green: "#12694c",
  gold: "#e9b861",
}
const Label = ({ children }) => (
  <div
    style={{
      fontSize: 16,
      fontWeight: 600,
      letterSpacing: 2,
      textTransform: "uppercase",
      color: colors.green,
    }}
  >
    {children}
  </div>
)
const Evidence = () => (
  <div
    style={{
      position: "absolute",
      bottom: 18,
      left: 28,
      right: 28,
      display: "flex",
      justifyContent: "space-between",
      fontSize: 14,
      color: "#59665b",
    }}
  >
    <span>QA rehearsal · fictional businesses · real local UI</span>
    <span>Marketing narration</span>
  </div>
)
function Card({ outro = false }) {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const small = width < 1000
  return (
    <AbsoluteFill
      style={{
        background: colors.paper,
        justifyContent: "center",
        padding: small ? 50 : 100,
        gap: 28,
      }}
    >
      <Img
        src={staticFile("brand/logo.svg")}
        style={{ width: small ? 300 : 360, alignSelf: "flex-start" }}
      />
      <div
        style={{ width: 80, height: 5, background: colors.gold, marginTop: 36 }}
      />
      <h1
        style={{
          margin: 0,
          fontSize: small ? 65 : 88,
          lineHeight: 1.05,
          letterSpacing: -4,
          fontWeight: 700,
          color: colors.ink,
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateRight: "clamp",
          }),
          transform: `translateY(${interpolate(frame, [0, 18], [16, 0], { extrapolateRight: "clamp" })}px)`,
        }}
      >
        Your business.
        <br />
        Your next chapter.
      </h1>
      <p
        style={{
          fontSize: small ? 27 : 30,
          lineHeight: 1.4,
          color: "#657267",
          maxWidth: 720,
        }}
      >
        {outro
          ? "Come. Trade. Together."
          : "Five businesses. One place to begin."}
      </p>
      <Label>
        {outro
          ? "ewatrade.com"
          : "Poultry · Pharmacy · Fashion · Laundry · Bakery"}
      </Label>
      <Evidence />
    </AbsoluteFill>
  )
}
function Chapter({ chapter, variant, narration, poster = false }) {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const mobile = variant === "mobile"
  const seconds = frame / fps
  const setupSeconds = chapter.setupElapsedMs / 1000
  const clock = poster
    ? setupSeconds
    : Math.min(setupSeconds, Math.max(0, seconds - 3) * chapter.speed)
  const clockText = `${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, "0")}`
  const cue = narration.cues.find(
    (c) => seconds >= c.start + 4 && seconds < c.end + 4,
  )
  const footageStyle = mobile
    ? { width: 390, height: 844 }
    : { width: 1152, height: 720 }
  return (
    <AbsoluteFill
      style={{ background: colors.paper, padding: mobile ? 30 : 38, gap: 14 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 20,
        }}
      >
        <Img
          src={staticFile("brand/logo.svg")}
          style={{ width: mobile ? 200 : 210 }}
        />
        <div style={{ textAlign: "right" }}>
          <Label>{mobile ? "Mobile web" : "Web"}</Label>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: colors.ink,
              marginTop: 6,
              background: colors.gold,
              padding: "5px 12px",
              borderRadius: 6,
            }}
          >
            QA REHEARSAL
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: mobile ? 7 : 0,
        }}
      >
        <div>
          <Label>{chapter.label}</Label>
          <h2
            style={{
              fontSize: mobile ? 34 : 38,
              letterSpacing: -1.5,
              lineHeight: 1.1,
              margin: "8px 0",
              color: colors.ink,
            }}
          >
            {chapter.business.replace(" (Demo QA)", "")}
          </h2>
        </div>
        <span style={{ fontSize: mobile ? 18 : 22, color: "#617163" }}>
          {chapter.city}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            ...footageStyle,
            border: mobile ? "8px solid #20372e" : "1px solid #c8cdc3",
            borderRadius: mobile ? 25 : 14,
            overflow: "hidden",
            background: "white",
            boxShadow: "0 18px 35px #20372e18",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          {poster || seconds < 3 ? (
            <Img
              src={staticFile(
                `captures/${variant}/${chapter.id}/${poster ? "added" : "signup-form"}.png`,
              )}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <Sequence from={3 * fps}>
              <OffthreadVideo
                muted
                src={staticFile(`captures/${variant}/${chapter.id}/setup.mp4`)}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </Sequence>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "center",
          fontSize: mobile ? 17 : 16,
          color: colors.green,
          minHeight: 42,
        }}
      >
        <span>
          {poster
            ? "Actual UI still · two records added"
            : seconds < 3
              ? "Actual signup form · shown separately"
              : chapter.speed > 1.01
                ? `Setup playback sped up ${chapter.speed.toFixed(2)}×`
                : "Setup playback 1×"}
        </span>
        <span
          style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
        >
          Setup time after signup <strong>{clockText}</strong>
        </span>
      </div>
      <div
        style={{
          height: mobile ? 100 : 55,
          fontSize: mobile ? 23 : 24,
          lineHeight: 1.25,
          color: colors.ink,
          textAlign: "center",
          padding: "8px 12px",
          background: cue ? "#e9e9dc" : "transparent",
          borderRadius: 10,
        }}
      >
        {cue?.text || ""}
      </div>
      <div
        style={{
          fontSize: mobile ? 14 : 13,
          color: "#617163",
          textAlign: "center",
        }}
      >
        Fictional business · provider-free assistant
      </div>
      <Sequence from={4 * fps}>
        <Audio src={staticFile(`narration/${chapter.id}.wav`)} />
      </Sequence>
    </AbsoluteFill>
  )
}
function Film({ variant, chapters, narration, poster = false }) {
  const fps = 24
  return (
    <AbsoluteFill style={{ fontFamily: "Arial, sans-serif" }}>
      <Sequence durationInFrames={8 * fps}>
        <Card />
        <Audio src={staticFile("narration/intro.wav")} />
      </Sequence>
      {chapters.map((chapter, index) => (
        <Sequence
          key={chapter.id}
          from={(8 + index * 26) * fps}
          durationInFrames={26 * fps}
        >
          <Chapter
            chapter={chapter}
            variant={variant}
            poster={poster}
            narration={narration.find((n) => n.id === chapter.id)}
          />
        </Sequence>
      ))}
      <Sequence from={138 * fps} durationInFrames={8 * fps}>
        <Card outro />
        <Audio src={staticFile("narration/outro.wav")} />
      </Sequence>
    </AbsoluteFill>
  )
}
const Root = () => (
  <>
    {["web", "mobile"].map((variant) => (
      <Composition
        key={variant}
        id={variant === "web" ? "Web" : "Mobile"}
        component={Film}
        width={variant === "web" ? 1920 : 720}
        height={variant === "web" ? 1080 : 1280}
        fps={24}
        durationInFrames={146 * 24}
        defaultProps={{ variant, chapters: [], narration: [] }}
      />
    ))}
  </>
)
registerRoot(Root)
