"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  MoneyInput,
  SelectControl,
  SubmitButton,
} from "@ewatrade/ui"

import { FormFeedback } from "@/components/forms/form-feedback"

import { useStoreCurrency } from "@/hooks/use-store-currency"
import { useTRPC } from "@/trpc/client"

import { formatMinorMoney, majorToMinor } from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function PrescriptionOperationsSetup({ storeId }: { storeId: string }) {
  const currencyCode = useStoreCurrency(storeId)
  const workflow = useDashboardWorkflow()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [exportRequestId, setExportRequestId] = useState("")
  const [identityVerificationEvidence, setIdentityVerificationEvidence] =
    useState("")
  const onMutationError = (error: { message: string }) =>
    setMessage(error.message)
  const zones = useQuery(
    trpc.prescriptions.deliveryZones.queryOptions({ storeId }),
  )
  const retention = useQuery(
    trpc.prescriptions.retentionPolicy.queryOptions({ storeId }),
  )
  const manualReviews = useQuery(
    trpc.prescriptions.manualDeliveryReviews.queryOptions({ storeId }),
  )
  const compliance = useQuery(
    trpc.prescriptions.complianceEvents.queryOptions({ storeId }),
  )
  const privacyResult = useQuery({
    ...trpc.prescriptions.privacyRequestResult.queryOptions({
      privacyRequestId: exportRequestId,
      storeId,
    }),
    enabled: Boolean(exportRequestId),
  })
  const saveZone = useMutation(
    trpc.prescriptions.upsertDeliveryZone.mutationOptions({
      onError: onMutationError,
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.deliveryZones.queryKey({ storeId }),
        })
        setMessage("Delivery zone saved.")
      },
    }),
  )
  const saveRetention = useMutation(
    trpc.prescriptions.updateRetentionPolicy.mutationOptions({
      onError: onMutationError,
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.retentionPolicy.queryKey({ storeId }),
        })
        setMessage("Retention policy saved.")
      },
    }),
  )
  const approveManualFee = useMutation(
    trpc.prescriptions.approveManualDeliveryFee.mutationOptions({
      onError: onMutationError,
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.manualDeliveryReviews.queryKey({
            storeId,
          }),
        })
        setMessage(
          "Manual delivery fee approved and the customer was notified where possible.",
        )
      },
    }),
  )
  const incident = useMutation(
    trpc.prescriptions.activateIncident.mutationOptions({
      onError: onMutationError,
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.complianceEvents.queryKey({ storeId }),
        })
        setMessage("Incident control activated and audited.")
      },
    }),
  )
  const resolveIncident = useMutation(
    trpc.prescriptions.resolveIncident.mutationOptions({
      onError: onMutationError,
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.complianceEvents.queryKey({ storeId }),
        })
        setMessage(
          "Incident control resolved. Reactivation remains a separate explicit step.",
        )
      },
    }),
  )
  const createPrivacy = useMutation(
    trpc.prescriptions.createPrivacyRequest.mutationOptions({
      onError: onMutationError,
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.complianceEvents.queryKey({ storeId }),
        })
        setMessage(
          "Privacy request recorded. Verify identity before processing.",
        )
      },
    }),
  )
  const verifyPrivacy = useMutation(
    trpc.prescriptions.verifyPrivacyRequest.mutationOptions({
      onError: onMutationError,
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.complianceEvents.queryKey({ storeId }),
        })
        setIdentityVerificationEvidence("")
        setMessage("Identity verified. Privacy processing was queued.")
      },
    }),
  )
  const requiredQueries = [zones, retention, manualReviews, compliance]
  if (requiredQueries.some((query) => query.isLoading)) {
    return <div className="h-72 animate-pulse bg-muted" />
  }
  const queryError = requiredQueries.find((query) => query.error)?.error
  if (queryError) {
    return (
      <div className="grid gap-3 rounded-none border border-destructive/30 p-5">
        <FormFeedback appearance="dashboard">{queryError.message}</FormFeedback>
        <Button
          appearance="form"
          className="w-fit"
          onClick={() =>
            void Promise.all(requiredQueries.map((query) => query.refetch()))
          }
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }
  const policy = retention.data

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {message ? (
        <p className="xl:col-span-2 bg-muted px-4 py-3 text-sm">{message}</p>
      ) : null}
      <section className="grid content-start gap-4 rounded-none border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">Delivery zones</h2>
          <p className="text-sm text-muted-foreground">
            Fixed fees become part of a new immutable Quote version before
            payment.
          </p>
        </div>
        {zones.data?.map((zone) => (
          <div className="border border-border p-3 text-sm" key={zone.id}>
            <p className="font-medium">{zone.name}</p>
            <p className="text-muted-foreground">
              {zone.feePolicy.toLowerCase().replaceAll("_", " ")} ·{" "}
              {zone.promiseText}
            </p>
          </div>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const fee = majorToMinor(String(data.get("fixedFee") ?? ""))
            const feePolicy = String(data.get("feePolicy")) as
              | "fixed"
              | "manual"
            if (
              feePolicy === "fixed" &&
              (fee === null || fee < 0 || !currencyCode)
            ) {
              setMessage("Enter the disclosed fixed delivery fee.")
              return
            }
            saveZone.mutate({
              currencyCode,
              feePolicy,
              fixedFeeMinor:
                feePolicy === "fixed" ? (fee ?? undefined) : undefined,
              matchType: "locality",
              matchValues: String(data.get("matchValues") ?? "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              name: String(data.get("name") ?? ""),
              promiseText: String(data.get("promiseText") ?? ""),
              storeId,
            })
          }}
        >
          <FieldGroup className="min-w-0 grid gap-3">
            <Input name="name" placeholder="Zone name" required />
            <Input
              name="matchValues"
              placeholder="Localities, comma separated"
              required
            />
            <SelectControl
              name="feePolicy"
              options={[
                { value: "fixed", label: <>Fixed disclosed fee</> },
                { value: "manual", label: <>Authorized manual review</> },
              ]}
            />
            <MoneyInput
              currencyCode={currencyCode}
              disabled={!currencyCode}
              aria-label="Fixed delivery fee"
              name="fixedFee"
              placeholder="Fixed delivery fee"
            />
            <Input name="promiseText" placeholder="Delivery promise" required />
            <FormActions>
              <SubmitButton
                isSubmitting={saveZone.isPending}
                disabled={saveZone.isPending}
                type="submit"
              >
                Add delivery zone
              </SubmitButton>
            </FormActions>
          </FieldGroup>
        </form>
        {manualReviews.data?.length ? (
          <div className="grid gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Manual delivery fee reviews</h3>
            {manualReviews.data.map((review) => (
              <form
                className="border border-border p-3"
                key={review.id}
                onSubmit={(event) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  const feeMinor = majorToMinor(String(data.get("fee") ?? ""))
                  if (feeMinor === null || feeMinor < 0) {
                    setMessage("Enter a valid delivery fee.")
                    return
                  }
                  approveManualFee.mutate({
                    addressId: review.id,
                    clientDecisionId: crypto.randomUUID(),
                    feeMinor,
                    reason: String(data.get("reason") ?? ""),
                    storeId,
                  })
                }}
              >
                <FieldGroup className="min-w-0 grid gap-2">
                  <p className="text-sm">
                    Current basket:{" "}
                    {formatMinorMoney(
                      review.quoteVersion.totalMinor,
                      review.quoteVersion.currencyCode,
                    )}{" "}
                    · {review.promiseText}
                  </p>
                  <MoneyInput
                    currencyCode={review.quoteVersion.currencyCode}
                    aria-label="Approved delivery fee"
                    name="fee"
                    placeholder="Approved delivery fee"
                    required
                  />
                  <Input
                    name="reason"
                    placeholder="Required fee decision reason"
                    required
                  />
                  <FormActions>
                    <SubmitButton
                      isSubmitting={approveManualFee.isPending}
                      disabled={approveManualFee.isPending}
                      size="sm"
                      type="submit"
                    >
                      Approve exact fee
                    </SubmitButton>
                  </FormActions>
                </FieldGroup>
              </form>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid content-start gap-4 rounded-none border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">Privacy and retention</h2>
          <p className="text-sm text-muted-foreground">
            Raw clinical artifacts expire independently from justified
            commercial records.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const days = (key: string, fallback: number) =>
              Number(data.get(key) || fallback)
            saveRetention.mutate({
              addressDays: days("addressDays", 30),
              auditEvidenceDays: days("auditEvidenceDays", 2555),
              commercialRecordDays: days("commercialRecordDays", 2555),
              legalHold: data.get("legalHold") === "yes",
              messageDays: days("messageDays", 90),
              rawMediaDays: days("rawMediaDays", 30),
              secureTokenDays: days("secureTokenDays", 30),
              storeId,
              transcriptDays: days("transcriptDays", 90),
            })
          }}
        >
          <FieldGroup className="min-w-0 grid gap-3 sm:grid-cols-2">
            {[
              ["rawMediaDays", "Raw media", policy?.rawMediaDays ?? 30],
              ["transcriptDays", "Transcripts", policy?.transcriptDays ?? 90],
              ["messageDays", "Messages", policy?.messageDays ?? 90],
              ["addressDays", "Addresses", policy?.addressDays ?? 30],
              [
                "auditEvidenceDays",
                "Audit evidence",
                policy?.auditEvidenceDays ?? 2555,
              ],
              [
                "secureTokenDays",
                "Secure tokens",
                policy?.secureTokenDays ?? 30,
              ],
              [
                "commercialRecordDays",
                "Commercial records",
                policy?.commercialRecordDays ?? 2555,
              ],
            ].map(([name, label, value]) => (
              <ControlField key={name} label={<>{label} (days)</>}>
                <Input
                  defaultValue={Number(value)}
                  min="1"
                  name={String(name)}
                  type="number"
                />
              </ControlField>
            ))}
            <CheckboxField label={<> Legal hold—pause automated deletion</>}>
              <Checkbox
                defaultChecked={policy?.legalHold}
                name="legalHold"
                value="yes"
              />
            </CheckboxField>
            <FormActions>
              <SubmitButton
                isSubmitting={saveRetention.isPending}
                className="sm:col-span-2"
                disabled={saveRetention.isPending}
                type="submit"
              >
                Save retention policy
              </SubmitButton>
            </FormActions>
          </FieldGroup>
        </form>
        <form
          className="border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const type = String(data.get("privacyType")) as
              | "access"
              | "correction"
              | "erasure"
              | "export"
              | "restriction"
            const correctedName = String(data.get("correctedName") ?? "").trim()
            createPrivacy.mutate({
              reason: String(data.get("privacyReason") ?? ""),
              requestedChanges:
                type === "correction"
                  ? { customerName: correctedName || null }
                  : undefined,
              storeId,
              subjectReference: String(data.get("subjectReference") ?? ""),
              type,
            })
          }}
        >
          <FieldGroup className="min-w-0 grid gap-3">
            <h3 className="text-sm font-medium">Customer privacy request</h3>
            <SelectControl
              name="privacyType"
              options={[
                { value: "access", label: <>Access</> },
                { value: "export", label: <>Export</> },
                { value: "correction", label: <>Correction</> },
                { value: "restriction", label: <>Restriction</> },
                { value: "erasure", label: <>Erasure</> },
              ]}
            />
            <Input
              name="subjectReference"
              placeholder="Request reference, phone, or email"
              required
            />
            <Input
              name="correctedName"
              placeholder="Corrected name (correction only)"
            />
            <Input
              name="privacyReason"
              placeholder="Structured request reason"
              required
            />
            <FormActions>
              <SubmitButton
                isSubmitting={createPrivacy.isPending}
                disabled={createPrivacy.isPending}
                type="submit"
                variant="outline"
              >
                Record privacy request
              </SubmitButton>
            </FormActions>
          </FieldGroup>
        </form>
        {compliance.data?.privacyRequests.length ? (
          <div className="grid gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Privacy request queue</h3>
            {compliance.data.privacyRequests.map((request) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 border border-border p-3 text-sm"
                key={request.id}
              >
                <span>
                  {request.type.toLowerCase()} · {request.status.toLowerCase()}
                </span>
                <div className="flex gap-2">
                  {request.status === "PENDING" ? (
                    <div className="grid gap-2">
                      <Input
                        aria-label="Identity verification evidence"
                        placeholder="Verification method and evidence reference"
                        value={identityVerificationEvidence}
                        onChange={(event) =>
                          setIdentityVerificationEvidence(event.target.value)
                        }
                      />
                      <Button
                        disabled={
                          verifyPrivacy.isPending ||
                          !identityVerificationEvidence.trim()
                        }
                        onClick={() =>
                          verifyPrivacy.mutate({
                            identityVerificationEvidence,
                            privacyRequestId: request.id,
                            storeId,
                          })
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Verify identity & process
                      </Button>
                    </div>
                  ) : null}
                  {request.status === "COMPLETED" &&
                  (request.type === "ACCESS" || request.type === "EXPORT") ? (
                    <Button
                      onClick={() => setExportRequestId(request.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Prepare export
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {privacyResult.data ? (
              <Button
                onClick={() => {
                  workflow.track("prescription_privacy_export", "started")
                  const blob = new Blob(
                    [JSON.stringify(privacyResult.data, null, 2)],
                    { type: "application/json" },
                  )
                  const url = URL.createObjectURL(blob)
                  const anchor = document.createElement("a")
                  anchor.href = url
                  anchor.download = `prescription-privacy-${privacyResult.data.privacyRequestId}.json`
                  anchor.click()
                  workflow.track("prescription_privacy_export", "completed")
                  URL.revokeObjectURL(url)
                }}
                type="button"
              >
                Download verified export
              </Button>
            ) : null}
          </div>
        ) : null}
        <form
          className="border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const type = String(data.get("type")) as
              | "break_glass"
              | "freeze_processing"
              | "revoke_public_links"
              | "revoke_whatsapp"
              | "suspend_commerce"
            incident.mutate({
              expiresAt:
                type === "break_glass"
                  ? new Date(Date.now() + 30 * 60_000)
                  : undefined,
              reason: String(data.get("reason") ?? ""),
              storeId,
              type,
            })
          }}
        >
          <FieldGroup className="min-w-0 grid gap-3">
            <h3 className="text-sm font-medium">Incident controls</h3>
            <SelectControl
              name="type"
              options={[
                { value: "freeze_processing", label: <>Freeze processing</> },
                {
                  value: "suspend_commerce",
                  label: <>Suspend Prescription Commerce</>,
                },
                {
                  value: "revoke_public_links",
                  label: <>Revoke public links</>,
                },
                {
                  value: "revoke_whatsapp",
                  label: <>Suspend WhatsApp routing</>,
                },
                {
                  value: "break_glass",
                  label: <>Personal emergency access (30 minutes)</>,
                },
              ]}
            />
            <Input
              name="reason"
              placeholder="Required incident reason"
              required
            />
            <FormActions>
              <SubmitButton
                isSubmitting={incident.isPending}
                disabled={incident.isPending}
                type="submit"
                variant="outline"
              >
                Activate control
              </SubmitButton>
            </FormActions>
          </FieldGroup>
        </form>
        {compliance.data?.incidents.some(
          (control) => control.status === "ACTIVE",
        ) ? (
          <div className="grid gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Active incident controls</h3>
            {compliance.data.incidents
              .filter((control) => control.status === "ACTIVE")
              .map((control) => (
                <form
                  className="border border-border p-3 text-sm"
                  key={control.id}
                  onSubmit={(event) => {
                    event.preventDefault()
                    const data = new FormData(event.currentTarget)
                    resolveIncident.mutate({
                      controlId: control.id,
                      reviewReason: String(data.get("reviewReason") ?? ""),
                      storeId,
                    })
                  }}
                >
                  <FieldGroup className="min-w-0 grid gap-2">
                    <span className="font-medium">
                      {control.type.toLowerCase().replaceAll("_", " ")}
                    </span>
                    <Input
                      name="reviewReason"
                      placeholder="Required outcome and post-use review"
                      required
                    />
                    <FormActions>
                      <SubmitButton
                        isSubmitting={resolveIncident.isPending}
                        disabled={resolveIncident.isPending}
                        size="sm"
                        type="submit"
                        variant="outline"
                      >
                        Resolve
                      </SubmitButton>
                    </FormActions>
                  </FieldGroup>
                </form>
              ))}
          </div>
        ) : null}
        {compliance.data?.sensitiveAccess.length ? (
          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium">
              Sensitive access history
            </summary>
            <div className="mt-3 grid gap-2">
              {compliance.data.sensitiveAccess.map((access) => (
                <div
                  className="border border-border p-3 text-xs"
                  key={access.id}
                >
                  <p className="font-medium">
                    {access.accessType.replaceAll("_", " ")} ·{" "}
                    {access.actorUserId}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {access.effectiveAt.toLocaleString()} · {access.reason}
                  </p>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </div>
  )
}
