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
import { warmDeskResponsiveCss, warmDeskStyles } from "./theme"

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
        <style>{warmDeskResponsiveCss}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body className="warm-desk-body" style={warmDeskStyles.body}>
        <Container
          className="warm-desk-container"
          data-email-system="warm-desk"
          style={warmDeskStyles.container}
        >
          <EmailHeader />
          <Section className="warm-desk-content" style={warmDeskStyles.content}>
            <Text style={warmDeskStyles.eyebrow}>{eyebrow}</Text>
            <Heading
              as="h1"
              className="warm-desk-heading"
              style={warmDeskStyles.heading}
            >
              {title}
            </Heading>
            {intro != null ? (
              <Text style={warmDeskStyles.intro}>{intro}</Text>
            ) : null}
            {children}
            {cta ? <EmailButton {...cta} /> : null}
            {note ? <Text style={warmDeskStyles.note}>{note}</Text> : null}
            <Hr style={warmDeskStyles.rule} />
            <Text style={warmDeskStyles.support}>
              Need help? Reply to this email or visit{" "}
              <Link
                href="https://ewatrade.com"
                style={warmDeskStyles.previewLink}
              >
                ewatrade.com
              </Link>
              .
            </Text>
          </Section>
        </Container>
        <Container style={warmDeskStyles.footerContainer}>
          <EmailFooter note={footerNote} />
        </Container>
      </Body>
    </Html>
  )
}
