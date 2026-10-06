"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useStoreParams } from "@/hooks/use-store-params"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ewatrade/ui"
import { useState } from "react"
import { CreateStoreForm } from "./create-store-form"

export function CreateStoreModal() {
  const { createOpen, setCreateOpen } = useStoreParams()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { closeError, requestClose } = useSheetDismissal(() =>
    setCreateOpen(false),
  )
  return (
    <Dialog
      open={createOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) void requestClose()
      }}
    >
      {createOpen ? (
        <DialogContent className="max-w-[455px]">
          <div className="p-4">
            <DialogHeader className="mb-6 pr-8">
              <DialogTitle className="mb-4 text-lg font-semibold">
                Add Store
              </DialogTitle>
              <DialogDescription>
                Create a Store for this business. Your plan’s Store limit
                applies.
              </DialogDescription>
            </DialogHeader>
            {closeError ? (
              <FormFeedback appearance="dashboard">{closeError}</FormFeedback>
            ) : null}
            <CreateStoreForm
              onCreated={requestClose}
              onSubmittingChange={setIsSubmitting}
            />
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
