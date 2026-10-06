import { Section, Text } from "@react-email/components"
import type { CSSProperties, ReactNode } from "react"

import { emailPalette } from "./theme"

const copyStyle = {
  color: emailPalette.muted,
  fontSize: "11px",
  lineHeight: "18px",
  margin: 0,
  textAlign: "center",
} satisfies CSSProperties

export function EmailFooter({ note }: { note?: ReactNode }) {
  return (
    <Section className="warm-desk-footer" style={{ padding: "18px 12px" }}>
      <Text style={copyStyle}>EwaTrade · Keep commerce in order.</Text>
      {note != null ? <Text style={copyStyle}>{note}</Text> : null}
    </Section>
  )
}
