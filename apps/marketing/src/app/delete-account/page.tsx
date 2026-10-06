import { ExternalDeletionRequestForm } from "@/components/legal/external-deletion-request-form"
import { LegalDocumentPage } from "@/components/legal/legal-document-page"
import { isAccountPrivacyEmailIntakeConfigured } from "@ewatrade/utils/account-privacy-intake"
import { isApprovedLegalPublication } from "@ewatrade/utils/legal-approval"
import { LEGAL_DOCUMENTS } from "@ewatrade/utils/legal-documents"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

function EmailDeletionRequest() {
  const email = LEGAL_DOCUMENTS.support.sections.find(
    (section) => section.title === "Privacy and account requests",
  )?.contactEmail

  if (!email) return null

  return (
    <section
      aria-labelledby="deletion-request-title"
      className="space-y-4 border-t border-border pt-8"
    >
      <h2 id="deletion-request-title" className="text-xl font-semibold">
        Request account deletion
      </h2>
      <p className="leading-7 text-muted-foreground">
        Email us from the address associated with your EwaTrade account to start
        a deletion request. We will verify your identity and review any business
        records that require separate handling. Sending the request does not
        mean deletion is complete. Do not email passwords, one-time codes, card
        details or identity documents.
      </p>
      <a
        href={`mailto:${email}?subject=EwaTrade%20account%20deletion%20request`}
        className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
      >
        Email {email}
      </a>
    </section>
  )
}

export function generateMetadata(): Metadata {
  return {
    title: `${LEGAL_DOCUMENTS["delete-account"].title} | EwaTrade`,
    description: LEGAL_DOCUMENTS["delete-account"].description,
    robots: { index: isApprovedLegalPublication(), follow: true },
  }
}

export default async function Page({
  searchParams,
}: { searchParams: Promise<{ qaDeletionForm?: string }> }) {
  const preview =
    process.env.NODE_ENV !== "production" &&
    (await searchParams).qaDeletionForm === "1"
  const intakeReady =
    isAccountPrivacyEmailIntakeConfigured(process.env) &&
    Boolean(process.env.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER?.trim())
  return (
    <LegalDocumentPage
      documentKey="delete-account"
      afterSections={
        intakeReady || preview ? (
          <ExternalDeletionRequestForm />
        ) : (
          <EmailDeletionRequest />
        )
      }
    />
  )
}
