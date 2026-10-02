"use client"

import type {
  PublicLegalPublication,
  SignupLegalAcceptance,
} from "@/lib/legal-publication"
import { LEGAL_DOCUMENTS } from "@ewatrade/utils/legal-documents"
import { useState } from "react"

export function StepLegal({
  publication,
  isSubmitting,
  submitError,
  onBack,
  onNext,
}: {
  publication: PublicLegalPublication
  isSubmitting: boolean
  submitError: string
  onBack: () => void
  onNext: (acceptance: SignupLegalAcceptance) => void
}) {
  const [agreed, setAgreed] = useState(false)
  const ready =
    publication.approved &&
    publication.signupAvailable &&
    Boolean(publication.version)
  return (
    <section>
      <div className="signup-heading">
        <p className="signup-entry">Step 3 of 3 · Before you begin</p>
        <h1>Terms &amp; Privacy</h1>
        <p className="signup-intro">
          Your setup is ready. Review these documents before creating your
          workspace.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!agreed || !ready || !publication.version || isSubmitting) return
          onNext({
            legalVersion: publication.version,
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true,
          })
        }}
      >
        <div className="space-y-6">
          {(["terms", "privacy"] as const).map((key) => {
            const document = LEGAL_DOCUMENTS[key]
            return (
              <article key={key} className="border-b pb-6">
                <h2 className="text-xl font-semibold">{document.title}</h2>
                <p className="my-2 text-sm text-muted-foreground">
                  {document.description}
                </p>
                <details>
                  <summary className="cursor-pointer underline">
                    Read {document.title}
                  </summary>
                  <div className="mt-4 space-y-4">
                    {document.sections.map((section) => (
                      <section key={section.title}>
                        <h3 className="font-medium">{section.title}</h3>
                        <p className="mt-1 whitespace-pre-line text-sm">
                          {section.text}
                        </p>
                      </section>
                    ))}
                  </div>
                </details>
                <a
                  href={`/${key}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm underline"
                >
                  Open {document.title} in a new tab
                </a>
              </article>
            )
          })}
          <p className="text-xs text-muted-foreground">
            Version {publication.version} · Effective{" "}
            {publication.effectiveDate}
          </p>
          {!ready && (
            <p role="alert">
              Account creation is paused until the Terms and Privacy Notice are
              effective.
            </p>
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              disabled={isSubmitting || !ready}
              className="mt-1"
            />
            <span>
              I agree to the Terms of Service and acknowledge the Privacy
              Notice. This does not subscribe me to optional marketing.
            </span>
          </label>
          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}
          <div className="signup-actions">
            <button
              type="button"
              className="signup-secondary"
              onClick={onBack}
              disabled={isSubmitting}
            >
              Back
            </button>
            <button
              type="submit"
              className="signup-primary"
              disabled={!agreed || !ready || isSubmitting}
            >
              {isSubmitting
                ? "Creating workspace…"
                : "Agree & create workspace"}
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
