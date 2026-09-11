import { Column, Row, Section, Text } from "@react-email/components"
import type { ReactNode } from "react"

import { emailPalette } from "./theme"

export type EmailDetail = {
  label: string
  value?: ReactNode
}

export function EmailDetails({ details }: { details: EmailDetail[] }) {
  const visible = details.filter((detail) => Boolean(detail.value))

  if (!visible.length) return null

  return (
    <Section
      style={{
        backgroundColor: emailPalette.quiet,
        border: `1px solid ${emailPalette.border}`,
        borderRadius: 0,
      }}
    >
      {visible.map((detail, index) => (
        <Row
          key={`${detail.label}-${index}`}
          style={{
            borderBottom:
              index === visible.length - 1
                ? undefined
                : `1px solid ${emailPalette.border}`,
          }}
        >
          <Column style={{ padding: "12px 13px", width: "34%" }}>
            <Text
              style={{
                color: emailPalette.muted,
                fontSize: "9px",
                fontWeight: 900,
                letterSpacing: "0.12em",
                lineHeight: "16px",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              {detail.label}
            </Text>
          </Column>
          <Column style={{ padding: "12px 13px" }}>
            <Text
              style={{
                color: emailPalette.ink,
                fontSize: "12px",
                fontWeight: 700,
                lineHeight: "19px",
                margin: 0,
                overflowWrap: "anywhere",
              }}
            >
              {detail.value}
            </Text>
          </Column>
        </Row>
      ))}
    </Section>
  )
}
