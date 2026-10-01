import { ExternalDeletionRequestForm } from "@/components/legal/external-deletion-request-form"
import { LegalDocumentPage } from "@/components/legal/legal-document-page"
import { isAccountPrivacyEmailIntakeConfigured } from "@ewatrade/utils/account-privacy-intake"
import { isApprovedLegalPublication } from "@ewatrade/utils/legal-approval"
import { LEGAL_DOCUMENTS } from "@ewatrade/utils/legal-documents"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

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
        intakeReady || preview ? <ExternalDeletionRequestForm /> : undefined
      }
    />
  )
}
