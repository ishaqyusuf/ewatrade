import { Button, Section } from "@react-email/components"

import { emailPalette } from "./theme"

export type EmailButtonProps = {
  href: string
  label: string
}

export function EmailButton({ href, label }: EmailButtonProps) {
  return (
    <Section style={{ margin: "6px 0 25px" }}>
      <Button
        href={href}
        style={{
          backgroundColor: emailPalette.action,
          borderRadius: "6px",
          color: "#ffffff",
          display: "inline-block",
          fontSize: "14px",
          fontWeight: 700,
          lineHeight: "22px",
          padding: "14px 20px",
          textDecoration: "none",
        }}
      >
        {label} &nbsp;→
      </Button>
    </Section>
  )
}
