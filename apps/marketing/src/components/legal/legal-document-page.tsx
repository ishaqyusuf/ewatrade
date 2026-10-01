import { shouldWithholdDraftLegalContent } from "@/lib/legal-publication-visibility"
import {
  LEGAL_DOCUMENT_EFFECTIVE_DATE,
  isApprovedLegalPublication,
} from "@ewatrade/utils/legal-approval"
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_VERSION,
  type LegalDocumentKey,
} from "@ewatrade/utils/legal-documents"
import Link from "next/link"
import type { ReactNode } from "react"

export function LegalDocumentPage({
  documentKey,
  afterSections,
}: { documentKey: LegalDocumentKey; afterSections?: ReactNode }) {
  const document = LEGAL_DOCUMENTS[documentKey]
  const approved = isApprovedLegalPublication()

  if (shouldWithholdDraftLegalContent(approved)) {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-foreground sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl space-y-8">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            EwaTrade home
          </Link>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
            {document.title}
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            This document has not been published and is not yet effective.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl space-y-10">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
        >
          EwaTrade home
        </Link>
        <header className="space-y-4">
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
            {document.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Version {LEGAL_DOCUMENT_VERSION}
            {approved && LEGAL_DOCUMENT_EFFECTIVE_DATE
              ? ` · Effective ${LEGAL_DOCUMENT_EFFECTIVE_DATE}`
              : ""}
          </p>
          {!approved && (
            <p className="border-l-2 border-border bg-muted p-4 text-sm leading-6">
              This document is not yet effective. Operator details, contacts and
              applicable legal policies must be ready before launch.
            </p>
          )}
        </header>
        <div className="space-y-8">
          {document.sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="text-base leading-7 text-muted-foreground">
                {section.text}
              </p>
              {section.contactEmail && (
                <a
                  href={`mailto:${section.contactEmail}`}
                  className="inline-flex min-h-11 items-center text-base font-medium underline underline-offset-4"
                >
                  {section.contactEmail}
                </a>
              )}
            </section>
          ))}
        </div>
        {afterSections}
        <nav
          aria-label="Policies and support"
          className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6"
        >
          {Object.entries(LEGAL_DOCUMENTS).map(([key, value]) => (
            <Link
              key={key}
              href={`/${key}`}
              aria-current={key === documentKey ? "page" : undefined}
              className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
            >
              {value.title}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  )
}
