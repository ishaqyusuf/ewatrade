import { Column, Row, Section, Text } from "@react-email/components"

import { emailPalette } from "./theme"

export function EmailHeader() {
  return (
    <>
      <Section
        aria-hidden="true"
        style={{
          backgroundColor: emailPalette.lime,
          borderRadius: "10px 10px 0 0",
          height: "4px",
        }}
      />
      <Section
        className="warm-desk-header"
        style={{
          borderBottom: `1px solid ${emailPalette.border}`,
          padding: "28px 34px 24px",
        }}
      >
        <Row>
          <Column>
            <Text
              style={{
                color: emailPalette.ink,
                fontSize: "20px",
                fontWeight: 800,
                letterSpacing: "-0.04em",
                margin: 0,
              }}
            >
              EwaTrade
              <span style={{ color: emailPalette.brandAccent }}>.</span>
            </Text>
          </Column>
          <Column align="right">
            <Text
              style={{
                color: emailPalette.muted,
                fontSize: "10px",
                lineHeight: "16px",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              Commerce, in order
            </Text>
          </Column>
        </Row>
      </Section>
    </>
  )
}
