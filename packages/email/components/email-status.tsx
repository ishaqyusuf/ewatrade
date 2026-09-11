import { Text } from "@react-email/components"

import { emailPalette } from "./theme"

export type EmailStatusTone = "attention" | "live" | "neutral"

export function EmailStatus({
  label,
  tone = "live",
}: {
  label: string
  tone?: EmailStatusTone
}) {
  const colors = {
    attention: { background: "#fff0e9", color: emailPalette.warning },
    live: { background: "#ebffd0", color: emailPalette.success },
    neutral: { background: emailPalette.quiet, color: emailPalette.muted },
  }[tone]

  return (
    <Text
      style={{
        backgroundColor: colors.background,
        border: `1px solid ${emailPalette.borderStrong}`,
        borderRadius: 0,
        color: colors.color,
        display: "inline-block",
        fontSize: "9px",
        fontWeight: 900,
        letterSpacing: "0.12em",
        lineHeight: "16px",
        margin: "0 0 18px",
        padding: "5px 8px",
        textTransform: "uppercase",
      }}
    >
      {label}
    </Text>
  )
}
