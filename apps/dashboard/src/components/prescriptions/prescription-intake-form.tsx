"use client"
import {
  Button,
  CheckboxField,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
  Textarea,
} from "@ewatrade/ui"

import {
  FormCheckboxControl,
  FormSelectControl,
} from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"

import { usePrescriptionParams } from "@/hooks/use-prescription-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { validatePrescriptionIntakeFiles } from "./prescription-intake-files"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useFormContext } from "react-hook-form"

import type { PrescriptionIntakeFormValues } from "./form-context"

type MediaManifest = Awaited<RouterOutputs["prescriptions"]["uploadMedia"]>

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error("The selected file could not be read."))
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      resolve(result.slice(result.indexOf(",") + 1))
    }
    reader.readAsDataURL(file)
  })
}

export function PrescriptionIntakeForm({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = usePrescriptionParams()
  const form = useFormContext<PrescriptionIntakeFormValues>()
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const upload = useMutation(trpc.prescriptions.uploadMedia.mutationOptions())
  const submit = useMutation(
    trpc.prescriptions.staffIntake.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.queue.queryKey(),
        })
        setParams({
          prescriptionId: result.requestId,
          prescriptionSheet: "success",
        })
      },
    }),
  )

  const handleSubmit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      const fileError = validatePrescriptionIntakeFiles(files)
      if (fileError) throw new Error(fileError)

      const media: MediaManifest[] = []
      for (const [index, file] of files.entries()) {
        media.push(
          await upload.mutateAsync({
            base64: await fileToBase64(file),
            clientMediaId: crypto.randomUUID(),
            mediaType: file.type as
              | "application/pdf"
              | "image/heic"
              | "image/heif"
              | "image/jpeg"
              | "image/png"
              | "image/webp",
            originalFileName: file.name,
            pageNumber: index + 1,
            storeId,
          }),
        )
      }
      if (media.length === 0 && !values.manualIntakeText.trim()) {
        throw new Error("Add prescription media or a manual transcription.")
      }
      await submit.mutateAsync({
        clientRequestId: crypto.randomUUID(),
        consentAccepted: values.consentAccepted,
        consentVersion: values.consentVersion,
        customerEmail: values.customerEmail || undefined,
        customerName: values.customerName || undefined,
        customerPhone: values.customerPhone || undefined,
        fulfilmentPreference: values.fulfilmentPreference,
        manualIntakeText: values.manualIntakeText || undefined,
        media,
        source: values.source,
        storeId,
      })
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Intake could not be saved.",
      )
    }
  })

  const formError = Object.values(form.formState.errors)[0]?.message
  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup className="min-w-0 grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <ControlField label={<>Source</>}>
            <FormSelectControl
              control={form.control}
              name={"source"}
              options={[
                { value: "staff_walk_in", label: <>Walk-in</> },
                { value: "staff_phone", label: <>Telephone</> },
              ]}
            />
          </ControlField>
          <ControlField label={<>Fulfilment preference</>}>
            <FormSelectControl
              control={form.control}
              name={"fulfilmentPreference"}
              options={[
                { value: "pickup", label: <>Pick up</> },
                { value: "delivery", label: <>Delivery</> },
                { value: "unspecified", label: <>Not decided</> },
              ]}
            />
          </ControlField>
        </div>
        <ControlField
          label={
            <>
              Customer name{" "}
              <span className="text-muted-foreground">Optional</span>
            </>
          }
        >
          <Input {...form.register("customerName")} />
        </ControlField>
        <div className="grid gap-4 sm:grid-cols-2">
          <ControlField label={<>Phone</>}>
            <Input {...form.register("customerPhone")} />
          </ControlField>
          <ControlField label={<>Email</>}>
            <Input type="email" {...form.register("customerEmail")} />
          </ControlField>
        </div>
        <ControlField
          label={<>Private prescription pages</>}
          afterControl=<span className="text-xs text-muted-foreground">
            Up to 12 pages, 10 MB each. Files remain private.
          </span>
        >
          <Input
            type="file"
            multiple
            accept="application/pdf,image/heic,image/heif,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? [])
              setFiles(selected)
              setError(validatePrescriptionIntakeFiles(selected))
            }}
          />
        </ControlField>
        <ControlField
          label={
            <>
              Manual transcription{" "}
              <span className="text-muted-foreground">Optional</span>
            </>
          }
        >
          <Textarea
            placeholder="One item per line. Staff entry still requires explicit verification and pharmacist review."
            {...form.register("manualIntakeText")}
          />
        </ControlField>
        <CheckboxField
          label=<span>
            I confirmed the customer's consent to process this request under the
            store policy.
          </span>
        >
          <FormCheckboxControl
            control={form.control}
            name={"consentAccepted"}
          />
        </CheckboxField>
        {error || formError ? (
          <FormFeedback appearance="dashboard">
            {error ?? String(formError)}
          </FormFeedback>
        ) : null}
        <FormActions>
          <Button
            appearance="form"
            type="button"
            variant="ghost"
            onClick={() => setParams(null)}
          >
            Cancel
          </Button>
          <SubmitButton
            isSubmitting={submit.isPending || upload.isPending}
            type="submit"
            disabled={submit.isPending || upload.isPending}
          >
            {submit.isPending || upload.isPending
              ? "Saving…"
              : "Create request"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
