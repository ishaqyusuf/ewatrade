"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Button,
  ControlField,
  FieldGroup,
  FormActions,
  SubmitButton,
} from "@ewatrade/ui"
import type { ReactElement, ReactNode } from "react"
import { useEffect } from "react"
import { useFinanceForm } from "./form-context"

export function FinanceField({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactElement<{
    id?: string
    "aria-invalid"?: boolean
    "aria-describedby"?: string
  }>
}) {
  return (
    <ControlField label={label} error={error}>
      {children}
    </ControlField>
  )
}
export function FinanceReview({
  children,
  command,
  onConfirm,
  onBack,
  confirmDisabled = false,
  backDisabled = false,
}: {
  children: ReactNode
  command: {
    pending: boolean
    ready?: boolean
    saved: boolean
    uncertain: boolean
    error: string | null
  }
  onConfirm: () => void
  onBack: () => void
  confirmDisabled?: boolean
  backDisabled?: boolean
}) {
  const { setLocked } = useFinanceForm()
  useEffect(() => {
    setLocked(command.pending)
    return () => setLocked(false)
  }, [command.pending, setLocked])
  return (
    <FieldGroup className="gap-5">
      <h3 className="font-semibold">Review before recording</h3>
      {children}
      {command.error ? (
        <FormFeedback appearance="dashboard">{command.error}</FormFeedback>
      ) : null}
      <FormActions className="sticky bottom-0 bg-background py-4">
        <Button
          appearance="form"
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={command.pending || command.saved || backDisabled}
        >
          Back
        </Button>
        {command.uncertain ? (
          <SubmitButton
            type="button"
            isSubmitting={command.pending}
            disabled={
              command.pending || command.ready === false || confirmDisabled
            }
            onClick={onConfirm}
          >
            Confirm same details
          </SubmitButton>
        ) : (
          <SubmitButton
            type="button"
            isSubmitting={command.pending}
            disabled={
              command.pending ||
              command.saved ||
              command.ready === false ||
              confirmDisabled
            }
            onClick={onConfirm}
          >
            {command.saved
              ? "Recorded"
              : command.pending
                ? "Recording…"
                : "Confirm and record"}
          </SubmitButton>
        )}
      </FormActions>
    </FieldGroup>
  )
}
