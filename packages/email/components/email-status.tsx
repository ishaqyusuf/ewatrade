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
    attention: {
      background: emailPalette.warningBackground,
      color: emailPalette.warning,
    },
    live: {
      background: emailPalette.successBackground,
      color: emailPalette.success,
    },
    neutral: { background: emailPalette.quiet, color: emailPalette.muted },
  }[tone]

  return (
    <Text
      style={{
        backgroundColor: colors.background,
        borderRadius: "4px",
        color: colors.color,
        display: "inline-block",
        fontSize: "12px",
        fontWeight: 700,
        lineHeight: "20px",
        margin: "0 0 22px",
        padding: "4px 10px",
      }}
    >
      {label}
    </Text>
  )
}
