import { LegalDocumentPage } from "@/components/legal/legal-document-page"
import { isApprovedLegalPublication } from "@ewatrade/utils/legal-approval"
import { LEGAL_DOCUMENTS } from "@ewatrade/utils/legal-documents"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return {
    title: `${LEGAL_DOCUMENTS["billing-policy"].title} | EwaTrade`,
    description: LEGAL_DOCUMENTS["billing-policy"].description,
    robots: { index: isApprovedLegalPublication(), follow: true },
  }
}

export default function Page() {
  return <LegalDocumentPage documentKey="billing-policy" />
}
