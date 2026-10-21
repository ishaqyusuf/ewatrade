"use client"
import {
  Badge,
  Button,
  CheckboxField,
  ControlField,
  CurrencyInput,
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

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import type { ServiceCommerceCatalogGraduationFormValues } from "@ewatrade/service-commerce"

import { majorToMinor, minorToMajorInput } from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactElement, useEffect, useRef, useState } from "react"
import { useFormContext } from "react-hook-form"

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
      queryClient.invalidateQueries({
        queryKey: trpc.catalog.listItemsPage.queryKey(),
      }),
    ])
  }
  const graduate = useMutation(
    trpc.serviceCommerce.graduateCatalogOffering.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        graduationId.current = null
        setMessage("Saved. It’s still hidden from customers.")
      },
    }),
  )
  const publish = useMutation(
    trpc.serviceCommerce.publishCatalogOffering.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        publicationId.current = null
        setMessage("It’s now available to customers.")
      },
    }),
  )

  if (readiness.isLoading) {
    return <div className="h-80 animate-pulse bg-muted" />
  }
  if (readiness.isError || !readiness.data) {
    return (
      <FieldGroup className="grid gap-3">
        <FormFeedback appearance="dashboard">
          {readiness.error?.message ?? "This service couldn’t be loaded."}
        </FormFeedback>
        <Button
          className="w-fit"
          onClick={() => void readiness.refetch()}
          variant="outline"
        >
          Try again
        </Button>
      </FieldGroup>
    )
  }

  const data = readiness.data
  const draftKind = form.watch("draftKind")
  const pending = graduate.isPending || publish.isPending

  // Product and Service facts share one form; read errors by name across both.
  const fieldErrors = form.formState.errors as Partial<Record<string, unknown>>
  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        graduationId.current ??= crypto.randomUUID()
        setMessage(null)
        graduate.mutate({ ...values, clientOperationId: graduationId.current })
      })}
    >
      <FieldGroup className="min-w-0 grid gap-6">
        <section className="grid gap-3 border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">What’s still needed</h3>
              <p className="text-sm text-muted-foreground">
                Requests, quotes and orders already linked to it stay linked.
              </p>
            </div>
            <Badge variant={data.isPublished ? "default" : "secondary"}>
              {data.isPublished
                ? "Available to customers"
                : data.isGraduated
                  ? "Set up, still hidden"
                  : "Private draft"}
            </Badge>
          </div>
          {data.missingFacts.length ? (
            <p className="text-sm text-muted-foreground">
              Still needed:{" "}
              {data.missingFacts
                .map((fact) => missingFactLabel(fact))
                .join(", ")}
              .
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing is missing. Make it available when you’re ready.
            </p>
          )}
        </section>

        {!data.isGraduated ? (
          <section className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <Input {...form.register("category")} />
              </Field>
              <Field label="Name or option">
                <Input {...form.register("variantName")} />
              </Field>
              <Field label="Price">
                <CurrencyInput
                  currencyCode={data.currencyCode}
                  value={minorToMajorInput(form.watch("fixedPriceMinor"))}
                  onValueChange={(value) =>
                    form.setValue("fixedPriceMinor", majorToMinor(value) ?? 0, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              </Field>
              {draftKind === "product" ? (
                <>
                  <Field label="SKU">
                    <Input {...form.register("sku")} />
                  </Field>
                  <Field label="Barcode">
                    <Input {...form.register("barcode")} />
                  </Field>
                  <Field label="Sold in (unit)">
                    <Input {...form.register("canonicalUnitName")} />
                  </Field>
                  <Field label="Unit symbol">
                    <Input {...form.register("canonicalUnitSymbol")} />
                  </Field>
                  <Field label="How many you have now">
                    <Input
                      inputMode="decimal"
                      {...form.register("openingStockQuantity")}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Takes about (minutes)">
                    <Input
                      min={1}
                      type="number"
                      {...form.register("durationMinutes", {
                        valueAsNumber: true,
                      })}
                    />
                  </Field>
                  <Field label="After someone orders it">
                    <FormSelectControl
                      control={form.control}
                      name={"workPolicy"}
                      options={[
                        {
                          value: "charge_only",
                          label: <>Just charge for it</>,
                        },
                        { value: "tracked", label: <>Track it as a job</> },
                      ]}
                    />
                  </Field>
                  <Field label="Booking a time">
                    <FormSelectControl
                      control={form.control}
                      name={"bookingPolicy"}
                      options={[
                        {
                          value: "not_bookable",
                          label: <>No booking needed</>,
                        },
                        {
                          value: "request_required",
                          label: <>Customer asks, you confirm</>,
                        },
                        {
                          value: "booking_required",
                          label: <>Customer must book a time</>,
                        },
                      ]}
                    />
                  </Field>
                  <Field label="Work can start">
                    <FormSelectControl
                      control={form.control}
                      name={"authorizationPolicy"}
                      options={[
                        {
                          value: "on_order_confirmation",
                          label: <>Right after the order</>,
                        },
                        {
                          value: "after_required_payment",
                          label: <>After payment</>,
                        },
                        {
                          value: "manual_release",
                          label: <>After a manager approves</>,
                        },
                      ]}
                    />
                  </Field>
                </>
              )}
            </div>
            <Field label="Note for your records">
              <Textarea
                placeholder="e.g. Set up from Ngozi’s request"
                {...form.register("reason")}
              />
            </Field>
            {Object.keys(fieldErrors).length ? (
              <p role="alert" className="text-sm text-destructive">
                {fieldErrors.reason
                  ? "Add a short note (at least 3 letters). "
                  : ""}
                {fieldErrors.sku || fieldErrors.barcode
                  ? "Add a SKU or barcode. "
                  : ""}
                {fieldErrors.openingStockQuantity
                  ? "How many you have must be a whole number. "
                  : ""}
                {fieldErrors.category || fieldErrors.variantName
                  ? "Add a category and a name. "
                  : ""}
              </p>
            ) : null}
            <CheckboxField
              label={
                <span>
                  {draftKind === "product"
                    ? "These details and the count are right. It stays hidden for now."
                    : "These details are right. It stays hidden for now."}
                </span>
              }
            >
              <FormCheckboxControl control={form.control} name={"confirmed"} />
            </CheckboxField>
            <FormActions>
              <SubmitButton
                isSubmitting={pending}
                disabled={pending}
                type="submit"
              >
                {graduate.isPending ? "Saving…" : "Save"}
              </SubmitButton>
            </FormActions>
          </section>
        ) : !data.isPublished ? (
          <section className="grid gap-4 border border-border p-4">
            <div>
              <h3 className="font-medium">Make it available</h3>
              <p className="text-sm text-muted-foreground">
                Customers can then ask for it and staff can add it to orders.
              </p>
            </div>
            <Field label="Note for your records">
              <Textarea
                placeholder="e.g. Price agreed with the owner"
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
              {publish.isPending ? "Saving…" : "Make it available"}
            </Button>
          </section>
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

function Field({
  children,
  label,
}: {
  children: ReactElement<{ id?: string }>
  label: string
}) {
  return <ControlField label={label}>{children}</ControlField>
}

const MISSING_FACT_LABELS: Record<string, string> = {
  category: "a category",
  variant: "a name or option",
  reusable_price: "a price",
  product_unit: "the unit it’s sold in",
  product_identifier: "a SKU or barcode",
  opening_count: "how many you have",
  service_duration: "how long it takes",
  service_work_policy: "what happens after an order",
  service_booking_policy: "whether customers book a time",
}

function missingFactLabel(fact: string) {
  return MISSING_FACT_LABELS[fact] ?? fact.replaceAll("_", " ")
}
