"use client"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import type { ServiceCommerceCatalogGraduationFormValues } from "@ewatrade/service-commerce"
import { Badge, Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { cloneElement, useEffect, useId, useRef, useState } from "react"
import { useFormContext } from "react-hook-form"

const fieldClassName =
  "h-10 rounded-lg border border-border bg-background px-3 text-sm"

export function CatalogGraduationForm({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useServiceCommerceParams()
  const offeringId = params.offeringId ?? ""
  const form = useFormContext<ServiceCommerceCatalogGraduationFormValues>()
  const [message, setMessage] = useState<string | null>(null)
  const graduationId = useRef<string | null>(null)
  const publicationId = useRef<string | null>(null)
  const initializedReadinessKey = useRef<string | null>(null)
  const readiness = useQuery(
    trpc.serviceCommerce.catalogGraduationReadiness.queryOptions(
      { offeringId, storeId },
      { retry: false },
    ),
  )

  useEffect(() => {
    const data = readiness.data
    if (!data || form.formState.isDirty) return
    const readinessKey = `${data.offeringId}:${data.revision}:${data.isGraduated}:${data.isPublished}`
    if (initializedReadinessKey.current === readinessKey) return
    initializedReadinessKey.current = readinessKey
    const common = {
      category: data.fields.category ?? "",
      clientOperationId: "pending",
      confirmed: true as const,
      currencyCode: data.currencyCode,
      expectedOfferingRevision: data.revision,
      fixedPriceMinor: data.fields.fixedPriceMinor ?? 0,
      offeringId: data.offeringId,
      reason: "",
      storeId,
      variantName: data.fields.variantName,
    }
    if (data.draftKind === "product") {
      form.reset({
        ...common,
        barcode: data.fields.barcode ?? "",
        canonicalUnitName: "Unit",
        canonicalUnitSymbol: "",
        draftKind: "product",
        openingStockQuantity: data.fields.openingStockQuantity ?? "0",
        sku: data.fields.sku ?? "",
        transactionScale: 0,
      })
    } else {
      form.reset({
        ...common,
        authorizationPolicy: "on_order_confirmation",
        bookingPolicy:
          data.fields.bookingPolicy === "BOOKING_REQUIRED"
            ? "booking_required"
            : data.fields.bookingPolicy === "REQUEST_REQUIRED"
              ? "request_required"
              : "not_bookable",
        draftKind: "service",
        durationMinutes: data.fields.durationMinutes ?? 60,
        guidance: "",
        workPolicy: "charge_only",
      })
    }
  }, [form, readiness.data, storeId])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        exact: true,
        queryKey: trpc.serviceCommerce.catalogGraduationReadiness.queryKey({
          offeringId,
          storeId,
        }),
      }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: trpc.serviceCommerce.workspaceAccess.queryKey({ storeId }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.catalog.listItems.queryKey(),
      }),
    ])
  }
  const graduate = useMutation(
    trpc.serviceCommerce.graduateCatalogOffering.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        graduationId.current = null
        setMessage(
          "Managed-operation facts saved. This Offering is still private until you publish it separately.",
        )
      },
    }),
  )
  const publish = useMutation(
    trpc.serviceCommerce.publishCatalogOffering.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        publicationId.current = null
        setMessage("Offering published for this Store.")
      },
    }),
  )

  if (readiness.isLoading) {
    return <div className="h-80 animate-pulse rounded-xl bg-muted" />
  }
  if (readiness.isError || !readiness.data) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-destructive" role="alert">
          {readiness.error?.message ?? "Graduation readiness is unavailable."}
        </p>
        <Button
          className="w-fit"
          onClick={() => void readiness.refetch()}
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  const data = readiness.data
  const draftKind = form.watch("draftKind")
  const pending = graduate.isPending || publish.isPending

  return (
    <form
      className="grid gap-6"
      onSubmit={form.handleSubmit((values) => {
        graduationId.current ??= crypto.randomUUID()
        setMessage(null)
        graduate.mutate({ ...values, clientOperationId: graduationId.current })
      })}
    >
      <section className="grid gap-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">Graduation readiness</h3>
            <p className="text-sm text-muted-foreground">
              Complete the missing facts below. Existing request, Quote, Order
              and price history remain attached.
            </p>
          </div>
          <Badge variant={data.isPublished ? "default" : "secondary"}>
            {data.isPublished
              ? "Published"
              : data.isGraduated
                ? "Ready to publish"
                : "Private draft"}
          </Badge>
        </div>
        {data.missingFacts.length ? (
          <ul className="grid gap-1 text-sm text-muted-foreground">
            {data.missingFacts.map((fact) => (
              <li key={fact}>Missing: {fact.replaceAll("_", " ")}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Managed-operation facts are complete. Publication remains a separate
            confirmation.
          </p>
        )}
      </section>

      {!data.isGraduated ? (
        <section className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <input
                className={fieldClassName}
                {...form.register("category")}
              />
            </Field>
            <Field label="Variant or option">
              <input
                className={fieldClassName}
                {...form.register("variantName")}
              />
            </Field>
            <Field label={`Reusable price (${data.currencyCode}, minor units)`}>
              <input
                className={fieldClassName}
                min={0}
                type="number"
                {...form.register("fixedPriceMinor", { valueAsNumber: true })}
              />
            </Field>
            {draftKind === "product" ? (
              <>
                <Field label="SKU">
                  <input className={fieldClassName} {...form.register("sku")} />
                </Field>
                <Field label="Barcode">
                  <input
                    className={fieldClassName}
                    {...form.register("barcode")}
                  />
                </Field>
                <Field label="Canonical unit">
                  <input
                    className={fieldClassName}
                    {...form.register("canonicalUnitName")}
                  />
                </Field>
                <Field label="Unit symbol">
                  <input
                    className={fieldClassName}
                    {...form.register("canonicalUnitSymbol")}
                  />
                </Field>
                <Field label="Verified opening count">
                  <input
                    className={fieldClassName}
                    inputMode="decimal"
                    {...form.register("openingStockQuantity")}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Duration (minutes)">
                  <input
                    className={fieldClassName}
                    min={1}
                    type="number"
                    {...form.register("durationMinutes", {
                      valueAsNumber: true,
                    })}
                  />
                </Field>
                <Field label="Work policy">
                  <select
                    className={fieldClassName}
                    {...form.register("workPolicy")}
                  >
                    <option value="charge_only">Charge only</option>
                    <option value="tracked">Tracked work</option>
                  </select>
                </Field>
                <Field label="Booking policy">
                  <select
                    className={fieldClassName}
                    {...form.register("bookingPolicy")}
                  >
                    <option value="not_bookable">Not bookable</option>
                    <option value="request_required">Request required</option>
                    <option value="booking_required">Booking required</option>
                  </select>
                </Field>
                <Field label="Work authorization">
                  <select
                    className={fieldClassName}
                    {...form.register("authorizationPolicy")}
                  >
                    <option value="on_order_confirmation">
                      On order confirmation
                    </option>
                    <option value="after_required_payment">
                      After required payment
                    </option>
                    <option value="manual_release">Manual release</option>
                  </select>
                </Field>
              </>
            )}
          </div>
          <Field label="Reason">
            <textarea
              className="min-h-24 rounded-lg border border-border bg-background p-3 text-sm"
              {...form.register("reason")}
            />
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              {...form.register("confirmed")}
            />
            <span>
              I confirm these operating facts and the opening count. This does
              not publish the Offering.
            </span>
          </label>
          <Button disabled={pending || !form.formState.isValid} type="submit">
            {graduate.isPending ? "Graduating…" : "Graduate offering"}
          </Button>
        </section>
      ) : !data.isPublished ? (
        <section className="grid gap-4 rounded-xl border border-border p-4">
          <div>
            <h3 className="font-medium">Publish separately</h3>
            <p className="text-sm text-muted-foreground">
              Publishing makes this Offering available to customers. It does not
              change the verified opening count.
            </p>
          </div>
          <Field label="Publication reason">
            <textarea
              className="min-h-24 rounded-lg border border-border bg-background p-3 text-sm"
              {...form.register("reason")}
            />
          </Field>
          <Button
            disabled={pending || form.watch("reason").trim().length < 3}
            onClick={() => {
              publicationId.current ??= crypto.randomUUID()
              setMessage(null)
              publish.mutate({
                clientOperationId: publicationId.current,
                confirmed: true,
                expectedOfferingRevision: data.revision,
                offeringId,
                reason: form.getValues("reason"),
                storeId,
              })
            }}
            type="button"
          >
            {publish.isPending ? "Publishing…" : "Confirm and publish"}
          </Button>
        </section>
      ) : null}

      {message ? (
        <output className="rounded-lg bg-muted px-4 py-3 text-sm">
          {message}
        </output>
      ) : null}
    </form>
  )
}

function Field({
  children,
  label,
}: {
  children: React.ReactElement<{ id?: string }>
  label: string
}) {
  const id = useId()
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  )
}
