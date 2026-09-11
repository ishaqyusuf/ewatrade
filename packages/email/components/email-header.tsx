import { Column, Row, Section, Text } from "@react-email/components"

import { emailPalette } from "./theme"

export function EmailHeader() {
  return (
    <>
      <Section
        aria-hidden="true"
        style={{ backgroundColor: emailPalette.action, height: "7px" }}
      />
      <Section
        className="field-ledger-header"
        style={{
          borderBottom: `1px solid ${emailPalette.border}`,
          padding: "20px 34px",
        }}
      >
        <Row>
          <Column>
            <Text
              style={{
                color: emailPalette.ink,
                fontSize: "17px",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                margin: 0,
              }}
            >
              EwaTrade
            </Text>
          </Column>
          <Column align="right">
            <Text
              style={{
                color: emailPalette.ink,
                fontSize: "9px",
                fontWeight: 800,
                letterSpacing: "0.16em",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              Commerce / operations
            </Text>
          </Column>
        </Row>
      </Section>
    </>
  )
}
