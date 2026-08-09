"use client"

import { usePrescriptionParams } from "@/hooks/use-prescription-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useFormContext } from "react-hook-form"

import type { PrescriptionIntakeFormValues } from "./form-context"

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
const areaClass =
  "min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

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
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          Source
          <select className={fieldClass} {...form.register("source")}>
            <option value="staff_walk_in">Walk-in</option>
            <option value="staff_phone">Telephone</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          Fulfilment preference
          <select
            className={fieldClass}
            {...form.register("fulfilmentPreference")}
          >
            <option value="pickup">Pick up</option>
            <option value="delivery">Delivery</option>
            <option value="unspecified">Not decided</option>
          </select>
        </label>
      </div>
      <label className="grid gap-1.5 text-sm">
        Customer name <span className="text-muted-foreground">Optional</span>
        <input className={fieldClass} {...form.register("customerName")} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          Phone
          <input className={fieldClass} {...form.register("customerPhone")} />
        </label>
        <label className="grid gap-1.5 text-sm">
          Email
          <input
            className={fieldClass}
            type="email"
            {...form.register("customerEmail")}
          />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm">
        Private prescription pages
        <input
          className={fieldClass}
          type="file"
          multiple
          accept="application/pdf,image/heic,image/heif,image/jpeg,image/png,image/webp"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
        <span className="text-xs text-muted-foreground">
          Up to 12 pages, 10 MB each. Files remain private.
        </span>
      </label>
      <label className="grid gap-1.5 text-sm">
        Manual transcription{" "}
        <span className="text-muted-foreground">Optional</span>
        <textarea
          className={areaClass}
          placeholder="One item per line. Staff entry still requires explicit verification and pharmacist review."
          {...form.register("manualIntakeText")}
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" {...form.register("consentAccepted")} />
        <span>
          I confirmed the customer's consent to process this request under the
          store policy.
        </span>
      </label>
      {error || formError ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? String(formError)}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setParams(null)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submit.isPending || upload.isPending}>
          {submit.isPending || upload.isPending ? "Saving…" : "Create request"}
        </Button>
      </div>
    </form>
  )
}
