import { Column, Row, Section, Text } from "@react-email/components"
import type { CSSProperties, ReactNode } from "react"

import { emailPalette } from "./theme"

const copyStyle = {
  color: "#d9e1dc",
  fontSize: "11px",
  lineHeight: "18px",
  margin: 0,
} satisfies CSSProperties

export function EmailFooter({ note }: { note?: ReactNode }) {
  return (
    <Section
      className="field-ledger-footer"
      style={{ backgroundColor: emailPalette.ink, padding: "20px 34px" }}
    >
      <Row>
        <Column>
          <Text className="field-ledger-footer-copy" style={copyStyle}>
            EwaTrade · Keep commerce in order.
          </Text>
        </Column>
        <Column align="right">
          <Text className="field-ledger-footer-copy" style={copyStyle}>
            {note ?? new Date().getFullYear()}
          </Text>
        </Column>
      </Row>
    </Section>
  )
}
