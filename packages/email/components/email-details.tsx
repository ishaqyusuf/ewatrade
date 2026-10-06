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
        borderTop: `1px solid ${emailPalette.border}`,
        margin: "2px 0 22px",
        tableLayout: "fixed",
      }}
    >
      {visible.map((detail, index) => (
        <Row key={`${detail.label}-${index}`} style={{ tableLayout: "fixed" }}>
          <Column
            style={{
              borderBottom: `1px solid ${emailPalette.border}`,
              padding: "13px 0",
              verticalAlign: "top",
              width: "35%",
            }}
          >
            <Text
              style={{
                color: emailPalette.muted,
                fontSize: "12px",
                lineHeight: "19px",
                margin: 0,
              }}
            >
              {detail.label}
            </Text>
          </Column>
          <Column
            style={{
              borderBottom: `1px solid ${emailPalette.border}`,
              padding: "13px 0 13px 15px",
              verticalAlign: "top",
              width: "65%",
            }}
          >
            <Text
              style={{
                color: emailPalette.ink,
                fontSize: "13px",
                fontWeight: 600,
                lineHeight: "19px",
                margin: 0,
                overflowWrap: "anywhere",
                wordBreak: "break-word",
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
