"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Button,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import type { ServiceCommerceHumanVerifiedObservationDraft } from "@ewatrade/service-commerce"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"

export function ObservationForm({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useServiceCommerceParams()
  const attachmentId = params.attachmentId ?? ""
  const form = useFormContext<ServiceCommerceHumanVerifiedObservationDraft>()
  const fields = useFieldArray({ control: form.control, name: "attributes" })
  const [message, setMessage] = useState<string | null>(null)
  const attachment = useQuery(
    trpc.serviceCommerce.mediaAttachment.queryOptions(
      { attachmentId, storeId },
      { enabled: Boolean(attachmentId), retry: false },
    ),
  )

  useEffect(() => {
    if (!attachment.data || form.formState.isDirty) return
    form.reset({
      attributes: attachment.data.observation?.attributes ?? [],
      displayLabel: attachment.data.observation?.displayLabel ?? "",
    })
  }, [attachment.data, form])

  const verify = useMutation(
    trpc.serviceCommerce.verifyMediaObservation.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async (observation) => {
        await queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.mediaAttachment.queryKey({
            attachmentId,
            storeId,
          }),
        })
        if (
          attachment.data?.attachment.source.id &&
          attachment.data.attachment.sourceLineId
        ) {
          await queryClient.invalidateQueries({
            queryKey: trpc.serviceCommerce.catalogMatches.queryKey({
              source: attachment.data.attachment.source,
              sourceLineId: attachment.data.attachment.sourceLineId,
              storeId,
            }),
          })
        }
        form.reset({
          attributes: observation.attributes as Array<{
            name: string
            value: string
          }>,
          displayLabel: observation.displayLabel,
        })
        setMessage("Saved.")
      },
    }),
  )

  if (attachment.isError || !attachment.data) {
    return null
  }
  const canVerify = attachment.data.media.lifecycle === "safe"

  return (
    <form
      className="border p-4"
      onSubmit={form.handleSubmit((values) =>
        verify.mutate({
          ...values,
          attachmentId,
          expectedRevision: attachment.data.observation?.revision ?? 0,
          storeId,
        }),
      )}
    >
      <FieldGroup className="min-w-0 grid gap-4">
        <div>
          <h3 className="font-medium">What does it show?</h3>
          <p className="text-sm text-muted-foreground">
            Your words, checked by you, for example “Two layer hens, coughing”.
            Nothing is priced or added to the catalog yet.
          </p>
        </div>
        <ControlField
          label="Short description"
          error={
            form.formState.errors.displayLabel
              ? "Describe what the photo shows."
              : undefined
          }
        >
          <Input disabled={!canVerify} {...form.register("displayLabel")} />
        </ControlField>
        <div className="grid gap-2">
          {fields.fields.map((field, index) => (
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={field.id}>
              <Input
                aria-label={`Detail ${index + 1} name`}
                disabled={!canVerify}
                placeholder="Detail, e.g. Colour"
                {...form.register(`attributes.${index}.name`)}
              />
              <Input
                aria-label={`Detail ${index + 1} value`}
                disabled={!canVerify}
                placeholder="e.g. Brown"
                {...form.register(`attributes.${index}.value`)}
              />
              <Button
                aria-label={`Remove detail ${index + 1}`}
                disabled={!canVerify}
                onClick={() => fields.remove(index)}
                type="button"
                variant="outline"
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            className="w-fit"
            disabled={!canVerify || fields.fields.length >= 12}
            onClick={() => fields.append({ name: "", value: "" })}
            type="button"
            variant="outline"
          >
            Add a detail
          </Button>
          {form.formState.errors.attributes ? (
            <p role="alert" className="text-sm text-destructive">
              Fill in both boxes for each detail with different names, or remove
              it.
            </p>
          ) : null}
        </div>
        <FormActions>
          <SubmitButton
            isSubmitting={verify.isPending}
            disabled={!canVerify || verify.isPending}
            type="submit"
          >
            {verify.isPending ? "Saving…" : "Save"}
          </SubmitButton>
        </FormActions>
        {attachment.data.observation &&
        attachment.data.attachment.sourceLineId ? (
          <Button
            onClick={() =>
              void params.setParams({
                serviceCommerceSheet: "catalog_draft",
                sourceId: attachment.data.attachment.source.id,
                sourceKind: attachment.data.attachment.source.kind,
                sourceLineId: attachment.data.attachment.sourceLineId,
              })
            }
            type="button"
            variant="outline"
          >
            Match to your catalog
          </Button>
        ) : null}
        {message ? (
          <FormFeedback appearance="dashboard" variant="default">
            {message}
          </FormFeedback>
        ) : null}
      </FieldGroup>
    </form>
  )
}
