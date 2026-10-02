"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { DomainContent } from "@/components/domains/domain-content"
import { getDomainSheetHeader } from "@/components/domains/domain-sheet-header"
import { DomainFormProvider } from "@/components/domains/domain/form-context"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import type { DomainSheetMode } from "@/hooks/use-domain-params"

export function DomainSheetContent({
  closeError,
  mode,
  store,
}: {
  closeError: string | null
  mode: DomainSheetMode | null
  store: { id: string; name: string }
}) {
  const header = mode ? getDomainSheetHeader(mode) : null

  if (!mode) return null

  return (
    <SheetFrame
      description={header?.description}
      title={header?.title ?? "Domain"}
    >
      {closeError ? (
        <FormFeedback appearance="dashboard">{closeError}</FormFeedback>
      ) : null}
      <DomainFormProvider key={`${store.id}:${mode}`}>
        <DomainContent store={store} />
      </DomainFormProvider>
    </SheetFrame>
  )
}
