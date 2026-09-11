import { Button, Section } from "@react-email/components"

import { emailPalette } from "./theme"

export type EmailButtonProps = {
  href: string
  label: string
}

export function EmailButton({ href, label }: EmailButtonProps) {
  return (
    <Section style={{ margin: "24px 0 4px" }}>
      <Button
        href={href}
        style={{
          backgroundColor: emailPalette.action,
          border: `1px solid ${emailPalette.ink}`,
          borderRadius: 0,
          color: emailPalette.ink,
          display: "inline-block",
          fontSize: "13px",
          fontWeight: 900,
          lineHeight: "20px",
          padding: "13px 17px",
          textDecoration: "none",
        }}
      >
        {label} &nbsp;→
      </Button>
    </Section>
  )
}
