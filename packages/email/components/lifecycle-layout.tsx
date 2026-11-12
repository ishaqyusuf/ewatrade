// Shared layout for lifecycle marketing email (plan §6): a short founder note,
// their number in the first line, one button, a plain-text twin and a
// one-click opt-out. W2/W3 templates fill `LifecycleEmailContent` and call
// `renderLifecycleEmail`; they never build their own shell.

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { CSSProperties } from "react"

import { renderEmailMarkup } from "../src/render"
import { EmailButton } from "./email-button"
import { EmailHeader } from "./email-header"
import {
  emailFonts,
  emailPalette,
  warmDeskResponsiveCss,
  warmDeskStyles,
} from "./theme"

export const LIFECYCLE_SENDER_NAME = "Ishaq from EwaTrade"

export type LifecycleEmailContent = {
  /** Inbox preview line. Keep it under ~90 characters. */
  preview: string
  /** First name of the recipient; omitted → "Hi there,". */
  firstName?: string | null
  /** First line: lead with their number (plan §6 template rules). */
  lead: string
  /** Optional highlighted figure, e.g. { label: "Orders this month", value: "184" }. */
  stat?: { label: string; value: string } | null
  /** Up to three short paragraphs after the lead. Plain text only. */
  body?: readonly string[]
  /** The only button. `href` must already be the signed `/go/:token` link. */
  cta: { href: string; label: string }
  /** Optional P.S. line after the signature. */
  postscript?: string | null
  /** Business the email is about, shown in the footer reason line. */
  businessName: string
  /** Footer links: one-click page and the preferences page. */
  unsubscribeUrl: string
  preferencesUrl: string
}

const styles = {
  paragraph: {
    color: emailPalette.ink,
    fontFamily: emailFonts.sans,
    fontSize: "15px",
    lineHeight: "25px",
    margin: "0 0 16px",
  },
  stat: {
    backgroundColor: emailPalette.quiet,
    borderRadius: "8px",
    margin: "4px 0 20px",
    padding: "14px 16px",
  },
  statLabel: {
    color: emailPalette.muted,
    fontSize: "12px",
    lineHeight: "18px",
    margin: 0,
  },
  statValue: {
    color: emailPalette.ink,
    fontSize: "26px",
    fontWeight: 700,
    lineHeight: "32px",
    margin: "2px 0 0",
  },
  signature: {
    color: emailPalette.ink,
    fontSize: "15px",
    lineHeight: "23px",
    margin: "0 0 4px",
  },
  signatureRole: {
    color: emailPalette.muted,
    fontSize: "13px",
    lineHeight: "20px",
    margin: "0 0 20px",
  },
  footer: {
    color: emailPalette.muted,
    fontSize: "11px",
    lineHeight: "18px",
    margin: "0 0 6px",
    textAlign: "center",
  },
  footerLink: { color: emailPalette.muted, textDecoration: "underline" },
} satisfies Record<string, CSSProperties>

function greeting(firstName?: string | null) {
  const name = firstName?.trim().split(/\s+/)[0]
  return name ? `Hi ${name},` : "Hi there,"
}

export function LifecycleLayout(content: LifecycleEmailContent) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <style>{warmDeskResponsiveCss}</style>
      </Head>
      <Preview>{content.preview}</Preview>
      <Body className="warm-desk-body" style={warmDeskStyles.body}>
        <Container
          className="warm-desk-container"
          data-email-system="warm-desk"
          data-email-kind="lifecycle"
          style={warmDeskStyles.container}
        >
          <EmailHeader />
          <Section className="warm-desk-content" style={warmDeskStyles.content}>
            <Text style={styles.paragraph}>{greeting(content.firstName)}</Text>
            <Text style={styles.paragraph}>{content.lead}</Text>
            {content.stat ? (
              <Section style={styles.stat}>
                <Text style={styles.statLabel}>{content.stat.label}</Text>
                <Text style={styles.statValue}>{content.stat.value}</Text>
              </Section>
            ) : null}
            {(content.body ?? []).map((paragraph) => (
              <Text key={paragraph} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
            <EmailButton {...content.cta} />
            <Text style={styles.signature}>Ishaq</Text>
            <Text style={styles.signatureRole}>Founder, EwaTrade</Text>
            {content.postscript ? (
              <Text style={styles.paragraph}>P.S. {content.postscript}</Text>
            ) : null}
            <Hr style={warmDeskStyles.rule} />
            <Text style={warmDeskStyles.support}>
              Questions? Reply to this email and it reaches our team.
            </Text>
          </Section>
        </Container>
        <Container style={warmDeskStyles.footerContainer}>
          <Section style={{ padding: "18px 12px" }}>
            <Text style={styles.footer}>
              You get these tips because you run {content.businessName} on
              EwaTrade.
            </Text>
            <Text style={styles.footer}>
              <Link href={content.preferencesUrl} style={styles.footerLink}>
                Email preferences
              </Link>
              {" · "}
              <Link href={content.unsubscribeUrl} style={styles.footerLink}>
                Unsubscribe
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/** Plain-text alternative built from the same content as the HTML. */
export function renderLifecycleEmailText(content: LifecycleEmailContent) {
  return [
    greeting(content.firstName),
    "",
    content.lead,
    ...(content.stat
      ? ["", `${content.stat.label}: ${content.stat.value}`]
      : []),
    ...(content.body ?? []).flatMap((paragraph) => ["", paragraph]),
    "",
    `${content.cta.label}: ${content.cta.href}`,
    "",
    "Ishaq",
    "Founder, EwaTrade",
    ...(content.postscript ? ["", `P.S. ${content.postscript}`] : []),
    "",
    "---",
    `You get these tips because you run ${content.businessName} on EwaTrade.`,
    `Email preferences: ${content.preferencesUrl}`,
    `Unsubscribe: ${content.unsubscribeUrl}`,
  ].join("\n")
}

export function renderLifecycleEmail(content: LifecycleEmailContent) {
  return {
    html: renderEmailMarkup(<LifecycleLayout {...content} />),
    text: renderLifecycleEmailText(content),
  }
}

/**
 * RFC 8058 one-click unsubscribe headers. `oneClickUrl` must accept an HTTPS
 * POST with body `List-Unsubscribe=One-Click` and no cookies or login.
 */
export function lifecycleUnsubscribeHeaders(oneClickUrl: string) {
  const url = new URL(oneClickUrl)
  if (url.protocol !== "https:")
    throw new Error("List-Unsubscribe needs an HTTPS URL.")
  return {
    "List-Unsubscribe": `<${url.href}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}
