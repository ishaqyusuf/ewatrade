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
    return <div className="h-80 animate-pulse bg-muted" />
  }
  if (readiness.isError || !readiness.data) {
    return (
      <FieldGroup className="grid gap-3">
        <FormFeedback appearance="dashboard">
          {readiness.error?.message ?? "Graduation readiness is unavailable."}
        </FormFeedback>
        <Button
          appearance="form"
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
              Managed-operation facts are complete. Publication remains a
              separate confirmation.
            </p>
          )}
        </section>

        {!data.isGraduated ? (
          <section className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <Input {...form.register("category")} />
              </Field>
              <Field label="Variant or option">
                <Input {...form.register("variantName")} />
              </Field>
              <Field label={`Reusable price (${data.currencyCode})`}>
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
                  <Field label="Canonical unit">
                    <Input {...form.register("canonicalUnitName")} />
                  </Field>
                  <Field label="Unit symbol">
                    <Input {...form.register("canonicalUnitSymbol")} />
                  </Field>
                  <Field label="Verified opening count">
                    <Input
                      inputMode="decimal"
                      {...form.register("openingStockQuantity")}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Duration (minutes)">
                    <Input
                      min={1}
                      type="number"
                      {...form.register("durationMinutes", {
                        valueAsNumber: true,
                      })}
                    />
                  </Field>
                  <Field label="Work policy">
                    <FormSelectControl
                      control={form.control}
                      name={"workPolicy"}
                      options={[
                        { value: "charge_only", label: <>Charge only</> },
                        { value: "tracked", label: <>Tracked work</> },
                      ]}
                    />
                  </Field>
                  <Field label="Booking policy">
                    <FormSelectControl
                      control={form.control}
                      name={"bookingPolicy"}
                      options={[
                        { value: "not_bookable", label: <>Not bookable</> },
                        {
                          value: "request_required",
                          label: <>Request required</>,
                        },
                        {
                          value: "booking_required",
                          label: <>Booking required</>,
                        },
                      ]}
                    />
                  </Field>
                  <Field label="Work authorization">
                    <FormSelectControl
                      control={form.control}
                      name={"authorizationPolicy"}
                      options={[
                        {
                          value: "on_order_confirmation",
                          label: <>On order confirmation</>,
                        },
                        {
                          value: "after_required_payment",
                          label: <>After required payment</>,
                        },
                        { value: "manual_release", label: <>Manual release</> },
                      ]}
                    />
                  </Field>
                </>
              )}
            </div>
            <Field label="Reason">
              <Textarea {...form.register("reason")} />
            </Field>
            <CheckboxField
              label=<span>
                I confirm these operating facts and the opening count. This does
                not publish the Offering.
              </span>
            >
              <FormCheckboxControl control={form.control} name={"confirmed"} />
            </CheckboxField>
            <FormActions>
              <SubmitButton
                isSubmitting={pending}
                disabled={pending || !form.formState.isValid}
                type="submit"
              >
                {graduate.isPending ? "Graduating…" : "Graduate offering"}
              </SubmitButton>
            </FormActions>
          </section>
        ) : !data.isPublished ? (
          <section className="grid gap-4 border border-border p-4">
            <div>
              <h3 className="font-medium">Publish separately</h3>
              <p className="text-sm text-muted-foreground">
                Publishing makes this Offering available to customers. It does
                not change the verified opening count.
              </p>
            </div>
            <Field label="Publication reason">
              <Textarea {...form.register("reason")} />
            </Field>
            <Button
              appearance="form"
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
