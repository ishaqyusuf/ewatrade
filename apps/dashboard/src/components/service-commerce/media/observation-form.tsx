"use client"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import type { ServiceCommerceHumanVerifiedObservationDraft } from "@ewatrade/service-commerce"
import { Button } from "@ewatrade/ui"
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
        setMessage("Human-verified observation saved.")
      },
    }),
  )

  if (attachment.isError || !attachment.data) {
    return null
  }
  const canVerify = attachment.data.media.lifecycle === "safe"

  return (
    <form
      className="grid gap-4 rounded-lg border p-4"
      onSubmit={form.handleSubmit((values) =>
        verify.mutate({
          ...values,
          attachmentId,
          expectedRevision: attachment.data.observation?.revision ?? 0,
          storeId,
        }),
      )}
    >
      <div>
        <h3 className="font-medium">Human-verified observation</h3>
        <p className="text-sm text-muted-foreground">
          Record what you verified, for example “Red small bag”. This does not
          publish, price, or create inventory automatically.
        </p>
      </div>
      <label className="grid gap-1 text-sm">
        Verified description
        <input
          className="h-10 rounded-lg border bg-background px-3"
          disabled={!canVerify}
          {...form.register("displayLabel")}
        />
      </label>
      <div className="grid gap-2">
        {fields.fields.map((field, index) => (
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={field.id}>
            <input
              aria-label={`Attribute ${index + 1} name`}
              className="h-10 rounded-lg border bg-background px-3"
              disabled={!canVerify}
              placeholder="Colour"
              {...form.register(`attributes.${index}.name`)}
            />
            <input
              aria-label={`Attribute ${index + 1} value`}
              className="h-10 rounded-lg border bg-background px-3"
              disabled={!canVerify}
              placeholder="Red"
              {...form.register(`attributes.${index}.value`)}
            />
            <Button
              aria-label={`Remove attribute ${index + 1}`}
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
          Add attribute
        </Button>
      </div>
      <Button disabled={!canVerify || verify.isPending} type="submit">
        {verify.isPending ? "Saving…" : "Save verified observation"}
      </Button>
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
          Match to Catalog
        </Button>
      ) : null}
      {message ? (
        <output
          className={verify.isError ? "text-sm text-destructive" : "text-sm"}
        >
          {message}
        </output>
      ) : null}
    </form>
  )
}
