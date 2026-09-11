import { Section, Text } from "@react-email/components"
import type { ReactNode } from "react"

import { emailFonts, emailPalette } from "./theme"

export function EmailCode({ children }: { children: ReactNode }) {
  return (
    <Section
      style={{
        backgroundColor: emailPalette.ink,
        borderRadius: 0,
        margin: "10px 0 6px",
        padding: "22px 18px",
        textAlign: "center",
      }}
    >
      <Text
        style={{
          color: emailPalette.lime,
          fontFamily: emailFonts.mono,
          fontSize: "32px",
          fontWeight: 800,
          letterSpacing: "0.24em",
          lineHeight: "40px",
          margin: 0,
          paddingLeft: "0.24em",
        }}
      >
        {children}
      </Text>
    </Section>
  )
}
