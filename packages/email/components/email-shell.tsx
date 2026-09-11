import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"

import { EmailButton, type EmailButtonProps } from "./email-button"
import { EmailFooter } from "./email-footer"
import { EmailHeader } from "./email-header"
import { fieldLedgerResponsiveCss, fieldLedgerStyles } from "./theme"

export type BrandEmailProps = {
  children?: ReactNode
  cta?: EmailButtonProps
  eyebrow: string
  footerNote?: ReactNode
  intro: ReactNode
  note?: ReactNode
  preview: string
  title: ReactNode
}

export function BrandEmail({
  children,
  cta,
  eyebrow,
  footerNote,
  intro,
  note,
  preview,
  title,
}: BrandEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <style>{fieldLedgerResponsiveCss}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body className="field-ledger-body" style={fieldLedgerStyles.body}>
        <Container
          className="field-ledger-container"
          data-email-system="field-ledger"
          style={fieldLedgerStyles.container}
        >
          <EmailHeader />
          <Section
            className="field-ledger-content"
            style={fieldLedgerStyles.content}
          >
            <Text style={fieldLedgerStyles.eyebrow}>{eyebrow}</Text>
            <Heading
              as="h1"
              className="field-ledger-heading"
              style={fieldLedgerStyles.heading}
            >
              {title}
            </Heading>
            <Text style={fieldLedgerStyles.intro}>{intro}</Text>
            {children}
            {cta ? <EmailButton {...cta} /> : null}
            {note ? <Text style={fieldLedgerStyles.note}>{note}</Text> : null}
            <Hr style={fieldLedgerStyles.rule} />
            <Text style={fieldLedgerStyles.support}>
              Need help? Reply to this email or visit{" "}
              <Link
                href="https://ewatrade.com"
                style={fieldLedgerStyles.previewLink}
              >
                ewatrade.com
              </Link>
              .
            </Text>
          </Section>
          <EmailFooter note={footerNote} />
        </Container>
      </Body>
    </Html>
  )
}
