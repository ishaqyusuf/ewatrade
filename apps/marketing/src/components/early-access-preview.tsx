"use client"

import type { EarlyAccessQaPreview } from "@/lib/early-access-preview"
import { Button } from "@ewatrade/ui"
import Link from "next/link"

export function EarlyAccessPreview({
  preview,
}: {
  preview: EarlyAccessQaPreview
}) {
  return (
    <section
      aria-label="QA continuation"
      className="early-access-preview mt-4 rounded-2xl border border-border bg-muted/40 p-4"
    >
      <h4 className="font-semibold">
        Your QA{" "}
        {preview.stage === "approval"
          ? "approval"
          : preview.stage === "verification"
            ? "verification"
            : "continuation"}{" "}
        is ready
      </h4>
      <p className="mt-1 text-sm text-muted-foreground">
        {preview.emailSent
          ? "The email was sent to your tester inbox."
          : "No email was sent."}{" "}
        Continue here or preview the email.
      </p>
      <Button
        className="early-access-continue mt-3"
        render={<Link href={preview.accessUrl} prefetch={false} />}
      >
        {preview.stage === "approval"
          ? "Approve and get started"
          : preview.stage === "verification"
            ? "Verify email and continue"
            : "Continue setup"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        This link expires{" "}
        {new Date(preview.expiresAt).toLocaleString(undefined, {
          timeZoneName: "short",
        })}
        .
      </p>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium">
          Preview{" "}
          {preview.stage === "approval"
            ? "request"
            : preview.stage === "verification"
              ? "verification"
              : "confirmation"}{" "}
          email
        </summary>
        <iframe
          className="mt-3 h-[36rem] w-full rounded-lg border border-border bg-white"
          sandbox=""
          srcDoc={preview.emailHtml}
          title="Early-access confirmation email preview"
        />
      </details>
    </section>
  )
}
