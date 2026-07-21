import type { IconKeys } from "@/components/ui/icon"

export const MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS = {
  activeForeground: "#FFFFFF",
  centerAccent: "#F2A51A",
  centerForeground: "#1E1E1C",
  centerSurface: "#FCFCFA",
  darkBorder: "rgba(255, 255, 255, 0.10)",
  inactiveForeground: "#9B9B97",
  shadow: "#000000",
  surface: "#1E1E1C",
} as const

export const MOBILE_DESIGN_FOUNDATION = {
  colorRoles: {
    accent:
      "Small emphasis surfaces, filter affordances, and selected soft states.",
    background: "App canvas for light and dark mode.",
    card: "Primary operational cards, lists, and sheet surfaces.",
    destructive: "Dangerous actions and destructive confirmation states.",
    foreground: "Primary readable text and high-emphasis icons.",
    muted: "Secondary surfaces and disabled or supporting metadata.",
    primary: "Primary EwaTrade action and brand emphasis.",
    success: "Online, synced, complete, and positive operational states.",
    warn: "Money, warning, pending, and attention states.",
  },
  components: {
    actionButton:
      "Primary full-width CTA using the shared haptic Button primitive with auth-style sizing, icons, and loading state.",
    emptyState: "Calm empty or first-use state with optional icon and action.",
    floatingSheet:
      "GND-style detached bottom sheet with keyboard-aware scroll content.",
    formField:
      "Auth-style label, helper, error, icon, and input wrapper for short operational forms.",
    otpInput: "Segmented verification entry for email code flows.",
    pressable: "Haptic press/ripple primitive for all app actions.",
    quantityStepper:
      "Plus/minus/numeric quantity entry with keyboard-safe input.",
    statusBadge:
      "Compact semantic status chip for stock, sync, payment, and links.",
    statusBanner:
      "Full-width operational notice for offline, failed, pending, or success states.",
    timelineRow:
      "Compact progress/event row for sync, order, delivery, and follow-up states.",
  },
  iconDefaults: {
    emptyState: "Info" satisfies IconKeys,
    error: "TriangleAlert" satisfies IconKeys,
    pending: "Clock" satisfies IconKeys,
    success: "CheckCircle2" satisfies IconKeys,
    warning: "TriangleAlert" satisfies IconKeys,
  },
  layout: {
    compactCardRadiusClass: "rounded-2xl",
    floatingControlRadiusClass: "rounded-full",
    formGapClass: "gap-4",
    iconButtonSizeClass: "h-11 w-11",
    minimumTapTargetClass: "min-h-11",
    screenGapClass: "gap-5",
  },
} as const

export type MobileDesignStatusTone =
  | "default"
  | "destructive"
  | "muted"
  | "primary"
  | "success"
  | "warning"
