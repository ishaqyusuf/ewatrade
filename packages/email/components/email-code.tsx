import { Section, Text } from "@react-email/components"
import type { ReactNode } from "react"

import { emailFonts, emailPalette } from "./theme"

export function EmailCode({ children }: { children: ReactNode }) {
  return (
    <Section
      style={{
        backgroundColor: emailPalette.quiet,
        border: `1px solid ${emailPalette.border}`,
        borderRadius: "6px",
        margin: "4px 0 24px",
        padding: "24px 8px",
        textAlign: "center",
      }}
    >
      <Text
        style={{
          color: emailPalette.ink,
          fontFamily: emailFonts.mono,
          fontSize: "34px",
          fontWeight: 700,
          letterSpacing: "5px",
          lineHeight: "42px",
          margin: 0,
          paddingLeft: "5px",
        }}
      >
        {children}
      </Text>
    </Section>
  )
}
