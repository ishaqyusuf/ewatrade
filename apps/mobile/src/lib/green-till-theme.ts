// Green Till workshop contract: shared roles for branded surfaces.
// Roles from workshop/work/ewatrade/archive/mobile-quality-workshop/DESIGN-SYSTEM.md;
// values are the Midnight palette from workshop/work/ewatrade/mobile/dark-palette
// (owner pick, 8 Nov 2026; both in the sibling Workshop project).
export const GREEN_TILL_THEME = {
  light: {
    heroFrom: "#3354A8",
    heroTo: "#1C2E68",
    heroHighlight: "#3D5FB6",
    heroForeground: "#F4F7FF",
    heroMuted: "rgba(244,247,255,0.8)",
    heroLine: "rgba(244,247,255,0.16)",
    gold: "#F2A51A",
    goldForeground: "#1E1E1C",
    // Ink CTA and cream text on the indigo hero.
    ink: "#141B2B",
    cream: "#F4F7FF",
    brandMark: "#FFFFFF",
    // 03 Market Preview stage behind auth and onboarding forms.
    stageCenter: "#EEF1FC",
    stageEdge: "#E5EAFA",
    stageInk: "#3D50C4",
    mint: "#E4F2EA",
    mintForeground: "#135C45",
    amber: "#FFF1D9",
    amberForeground: "#8A4B00",
    sky: "#E3EEFB",
    skyForeground: "#1D4F91",
    lilac: "#EEE8FB",
    lilacForeground: "#5B3AA8",
    rose: "#FCE8E6",
    roseForeground: "#9B1C1C",
    cardShadow: "rgba(28,46,104,0.45)",
    // On the always-indigo hero: watermark, chips, change and status dots.
    heroWatermark: "rgba(255,255,255,0.07)",
    heroChip: "rgba(255,255,255,0.14)",
    // A held key on the indigo gate keypad.
    heroPressed: "rgba(255,255,255,0.32)",
    heroUp: "#8EF0BE",
    heroDown: "#FFB4A8",
    dotSynced: "#8EF0BE",
    dotOffline: "#F8C66A",
    dotBusy: "#9CC3F5",
    lilacChip: "rgba(91,58,168,0.14)",
    clear: "transparent",
    // Queued (offline) success: a warm dark surface instead of indigo.
    queuedHighlight: "#3B3A2C",
    queuedFrom: "#2A2A22",
    queuedTo: "#1C1C18",
    scrim: "rgba(8,12,22,0.55)",
    // Chips over photos and illustrations (Cover, remove).
    overlayChip: "rgba(16,21,33,0.62)",
    overlayForeground: "#FFFFFF",
    // Switch: the off track keeps 3:1 contrast on white cards.
    switchOff: "#8A94A8",
    switchThumb: "#FFFFFF",
    // Receipt paper stays white in both schemes, like the printed document.
    paper: "#FFFFFF",
    paperInk: "#1E1E1C",
    paperMuted: "#676F80",
    paperFaint: "#8790A0",
    paperLine: "#ECEFF4",
    paperBand: "#F3F5F9",
    paperAccent: "#3D50C4",
    paperOk: "#E4F2EA",
    paperOkInk: "#135C45",
  },
  dark: {
    heroFrom: "#24427A",
    heroTo: "#0F1C38",
    heroHighlight: "#2E4F8C",
    heroForeground: "#F1F5FF",
    heroMuted: "rgba(241,245,255,0.68)",
    heroLine: "rgba(241,245,255,0.13)",
    gold: "#F5B12E",
    goldForeground: "#1E1E1C",
    ink: "#EDF1F7",
    cream: "#F1F5FF",
    brandMark: "#FFFFFF",
    stageCenter: "#171F30",
    stageEdge: "#18243D",
    stageInk: "#9DBBFF",
    mint: "#142C28",
    mintForeground: "#86D3AE",
    amber: "#30260F",
    amberForeground: "#F6C56A",
    sky: "#16253D",
    skyForeground: "#A9C8F7",
    lilac: "#242144",
    lilacForeground: "#C4B2F5",
    rose: "#381D27",
    roseForeground: "#F5A3B4",
    cardShadow: "rgba(0,0,0,0.6)",
    heroWatermark: "rgba(255,255,255,0.07)",
    heroChip: "rgba(255,255,255,0.12)",
    // A held key on the indigo gate keypad.
    heroPressed: "rgba(255,255,255,0.32)",
    heroUp: "#8EF0BE",
    heroDown: "#FFB4A8",
    dotSynced: "#8EF0BE",
    dotOffline: "#F8C66A",
    dotBusy: "#9CC3F5",
    lilacChip: "rgba(196,178,245,0.16)",
    clear: "transparent",
    // Queued (offline) success: a warm dark surface instead of indigo.
    queuedHighlight: "#3B3A2C",
    queuedFrom: "#2A2A22",
    queuedTo: "#1C1C18",
    scrim: "rgba(8,12,22,0.55)",
    // Chips over photos and illustrations (Cover, remove).
    overlayChip: "rgba(16,21,33,0.62)",
    overlayForeground: "#FFFFFF",
    switchOff: "#4B566B",
    switchThumb: "#F1F5FF",
    // Receipt paper stays white in both schemes, like the printed document.
    paper: "#FFFFFF",
    paperInk: "#1E1E1C",
    paperMuted: "#676F80",
    paperFaint: "#8790A0",
    paperLine: "#ECEFF4",
    paperBand: "#F3F5F9",
    paperAccent: "#3D50C4",
    paperOk: "#E4F2EA",
    paperOkInk: "#135C45",
  },
} as const

export type GreenTillTint = "mint" | "amber" | "sky" | "lilac" | "rose"

/** A tint's foreground at about 14% opacity, for icon chips on tinted cards. */
export function tintChip(foregroundHex: string) {
  return `${foregroundHex}24`
}

/** Fixed owner-signup brand art: the hero glow, its watermark and the dark-only borders. */
export const OWNER_SIGNUP_ART = {
  darkBorder: "#2E3848",
  glow: { dark: "#2E4F8C", light: "#3D5FB6" },
  mark: "#FFFFFF",
  /** Rose business-type ink on the dark avatar tint. */
  darkRoseInk: "#F5A3B4",
} as const
