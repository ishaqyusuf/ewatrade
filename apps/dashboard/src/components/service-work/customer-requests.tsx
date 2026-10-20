"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { label } from "@/components/service-work/service-utils"
import {
  InlineRowCheckbox,
  InlineSelectionBar,
  useInlineSelection,
} from "@/components/tables/core"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import { Badge, Button, SubmitButton } from "@ewatrade/ui"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useMemo } from "react"

export function CustomerRequests({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useServiceWorkParams()
  const { data: forms } = useSuspenseQuery(
    trpc.serviceAccess.requestForms.queryOptions({ storeId }, { retry: false }),
  )
  const { data: requests } = useSuspenseQuery(
    trpc.serviceAccess.requests.queryOptions(
      { limit: 100, storeId },
      { retry: false },
    ),
  )
  const requestIds = useMemo(
    () => requests.map((request) => request.id),
    [requests],
  )
  const selection = useInlineSelection({ ids: requestIds, scope: storeId })
  const dispositionMutation = useMutation(
    trpc.serviceAccess.updateRequest.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.serviceAccess.requests.queryKey(),
        })
      },
    }),
  )

  return (
    <section className="grid gap-3 border-t border-border pt-6">
      {dispositionMutation.isError ? (
        <FormFeedback appearance="dashboard">
          {dispositionMutation.error.message}
        </FormFeedback>
      ) : null}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Customer requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Requests create no price promise or work until a Quote is accepted.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {forms.length} active links
        </span>
      </div>
      {requests.length === 0 ? (
        <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">
          No customer requests yet.
        </p>
      ) : (
        <div className="grid">
          <InlineSelectionBar
            label="Select all loaded customer requests"
            selection={selection}
          />
          {requests.map((request) => (
            <div
              className="flex items-start gap-3 border-b border-border py-4"
              data-state={
                selection.isSelected(request.id) ? "selected" : undefined
              }
              key={request.id}
            >
              <span className="pt-0.5">
                <InlineRowCheckbox
                  selection={selection}
                  id={request.id}
                  label={`Select request from ${request.customerName}`}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{request.customerName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {request.lines
                        .map(
                          (line) => `${line.quantity} × ${line.offeringName}`,
                        )
                        .join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      From {request.formLabel}
                    </p>
                  </div>
                  <Badge className="w-fit rounded-full capitalize">
                    {label(request.status)}
                  </Badge>
                </div>
                {request.details ? (
                  <p className="mt-3 bg-muted px-3 py-2 text-sm">
                    {request.details}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {request.status !== "CONVERTED" &&
                  request.status !== "DECLINED" ? (
                    <Button
                      appearance="form"
                      size="sm"
                      onClick={() =>
                        setParams({
                          requestId: request.id,
                          serviceSheet: "quote",
                        })
                      }
                    >
                      Issue quote
                    </Button>
                  ) : null}
                  {request.status === "SUBMITTED" ? (
                    <SubmitButton
                      type="button"
                      isSubmitting={
                        dispositionMutation.isPending &&
                        dispositionMutation.variables?.requestId ===
                          request.id &&
                        dispositionMutation.variables?.status ===
                          "needs_information"
                      }
                      size="sm"
                      variant="outline"
                      disabled={dispositionMutation.isPending}
                      onClick={() =>
                        dispositionMutation.mutate({
                          requestId: request.id,
                          response:
                            "Please provide the additional details requested by the business.",
                          status: "needs_information",
                        })
                      }
                    >
                      Request information
                    </SubmitButton>
                  ) : null}
                  {request.status !== "CONVERTED" &&
                  request.status !== "DECLINED" ? (
                    <SubmitButton
                      type="button"
                      isSubmitting={
                        dispositionMutation.isPending &&
                        dispositionMutation.variables?.requestId ===
                          request.id &&
                        dispositionMutation.variables?.status === "declined"
                      }
                      size="sm"
                      variant="ghost"
                      disabled={dispositionMutation.isPending}
                      onClick={() =>
                        dispositionMutation.mutate({
                          requestId: request.id,
                          response:
                            "The business is unable to quote this request.",
                          status: "declined",
                        })
                      }
                    >
                      Decline
                    </SubmitButton>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
