import { LegalDocumentPage } from "@/components/legal/legal-document-page"
import { SupportContactPage } from "@/components/support/support-contact-page"
import { isApprovedLegalPublication } from "@ewatrade/utils/legal-approval"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return {
    title: "Support | EwaTrade",
    description:
      "Contact EwaTrade for account access, software billing and platform support.",
    robots: {
      index:
        process.env.APP_ENV !== "preview" &&
        process.env.VERCEL_ENV !== "preview",
      follow: true,
    },
  }
}

export default function Page() {
  return isApprovedLegalPublication() ? (
    <LegalDocumentPage documentKey="support" />
  ) : (
    <SupportContactPage />
  )
}
