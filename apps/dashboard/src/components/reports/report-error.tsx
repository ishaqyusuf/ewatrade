"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { Button } from "@ewatrade/ui"

export function ReportError({
  retry,
  title,
}: { error: unknown; retry: () => void; title?: string }) {
  return (
    <div className="grid min-w-0 gap-3 border border-border bg-background p-6">
      {title ? <h2 className="text-sm font-medium">{title}</h2> : null}
      <FormFeedback appearance="dashboard">
        This report could not be loaded. Try again.
      </FormFeedback>
      <Button
        type="button"
        variant="outline"
        appearance="form"
        className="w-fit"
        onClick={retry}
      >
        Retry report
      </Button>
    </div>
  )
}
