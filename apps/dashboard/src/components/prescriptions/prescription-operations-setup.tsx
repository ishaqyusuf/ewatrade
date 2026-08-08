"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"

export function PrescriptionOperationsSetup({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [exportRequestId, setExportRequestId] = useState("")
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
      onSuccess: async () => {
        setMessage("Delivery zone saved.")
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.deliveryZones.queryKey({ storeId }),
        })
      },
    }),
  )
  const saveRetention = useMutation(
    trpc.prescriptions.updateRetentionPolicy.mutationOptions({
      onSuccess: async () => {
        setMessage("Retention policy saved.")
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.retentionPolicy.queryKey({ storeId }),
        })
      },
    }),
  )
  const approveManualFee = useMutation(
    trpc.prescriptions.approveManualDeliveryFee.mutationOptions({
      onSuccess: async () => {
        setMessage(
          "Manual delivery fee approved and the customer was notified where possible.",
        )
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.manualDeliveryReviews.queryKey({
            storeId,
          }),
        })
      },
    }),
  )
  const incident = useMutation(
    trpc.prescriptions.activateIncident.mutationOptions({
      onSuccess: async () => {
        setMessage("Incident control activated and audited.")
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.complianceEvents.queryKey({ storeId }),
        })
      },
    }),
  )
  const resolveIncident = useMutation(
    trpc.prescriptions.resolveIncident.mutationOptions({
      onSuccess: async () => {
        setMessage(
          "Incident control resolved. Reactivation remains a separate explicit step.",
        )
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.complianceEvents.queryKey({ storeId }),
        })
      },
    }),
  )
  const createPrivacy = useMutation(
    trpc.prescriptions.createPrivacyRequest.mutationOptions({
      onSuccess: async () => {
        setMessage(
          "Privacy request recorded. Verify identity before processing.",
        )
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.complianceEvents.queryKey({ storeId }),
        })
      },
    }),
  )
  const verifyPrivacy = useMutation(
    trpc.prescriptions.verifyPrivacyRequest.mutationOptions({
      onSuccess: async () => {
        setMessage("Identity verified. Privacy processing was queued.")
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.complianceEvents.queryKey({ storeId }),
        })
      },
    }),
  )
  const policy = retention.data

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {message ? (
        <p className="xl:col-span-2 bg-muted px-4 py-3 text-sm">{message}</p>
      ) : null}
      <section className="grid content-start gap-4 rounded-xl border border-border bg-card p-5">
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
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const fee = Number(data.get("fixedFeeMinor"))
            const feePolicy = String(data.get("feePolicy")) as
              | "fixed"
              | "manual"
            if (
              feePolicy === "fixed" &&
              !String(data.get("fixedFeeMinor") ?? "").trim()
            ) {
              setMessage("Enter the disclosed fixed delivery fee.")
              return
            }
            saveZone.mutate({
              currencyCode: "NGN",
              feePolicy,
              fixedFeeMinor: feePolicy === "fixed" ? fee : undefined,
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
          <input
            className={fieldClass}
            name="name"
            placeholder="Zone name"
            required
          />
          <input
            className={fieldClass}
            name="matchValues"
            placeholder="Localities, comma separated"
            required
          />
          <select className={fieldClass} name="feePolicy">
            <option value="fixed">Fixed disclosed fee</option>
            <option value="manual">Authorized manual review</option>
          </select>
          <input
            className={fieldClass}
            min="0"
            name="fixedFeeMinor"
            placeholder="Fee in minor units (fixed only)"
            type="number"
          />
          <input
            className={fieldClass}
            name="promiseText"
            placeholder="Delivery promise"
            required
          />
          <Button disabled={saveZone.isPending} type="submit">
            Add delivery zone
          </Button>
        </form>
        {manualReviews.data?.length ? (
          <div className="grid gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Manual delivery fee reviews</h3>
            {manualReviews.data.map((review) => (
              <form
                className="grid gap-2 border border-border p-3"
                key={review.id}
                onSubmit={(event) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  approveManualFee.mutate({
                    addressId: review.id,
                    clientDecisionId: crypto.randomUUID(),
                    feeMinor: Number(data.get("feeMinor")),
                    reason: String(data.get("reason") ?? ""),
                    storeId,
                  })
                }}
              >
                <p className="text-sm">
                  Current basket: {review.quoteVersion.totalMinor} minor units ·{" "}
                  {review.promiseText}
                </p>
                <input
                  className={fieldClass}
                  min="0"
                  name="feeMinor"
                  placeholder="Approved delivery fee in minor units"
                  required
                  type="number"
                />
                <input
                  className={fieldClass}
                  name="reason"
                  placeholder="Required fee decision reason"
                  required
                />
                <Button
                  disabled={approveManualFee.isPending}
                  size="sm"
                  type="submit"
                >
                  Approve exact fee
                </Button>
              </form>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid content-start gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">Privacy and retention</h2>
          <p className="text-sm text-muted-foreground">
            Raw clinical artifacts expire independently from justified
            commercial records.
          </p>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const days = (key: string, fallback: number) =>
              Number(data.get(key) || fallback)
            saveRetention.mutate({
              addressDays: days("addressDays", 30),
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
          {[
            ["rawMediaDays", "Raw media", policy?.rawMediaDays ?? 30],
            ["transcriptDays", "Transcripts", policy?.transcriptDays ?? 90],
            ["messageDays", "Messages", policy?.messageDays ?? 90],
            ["addressDays", "Addresses", policy?.addressDays ?? 30],
            ["secureTokenDays", "Secure tokens", policy?.secureTokenDays ?? 30],
            [
              "commercialRecordDays",
              "Commercial records",
              policy?.commercialRecordDays ?? 2555,
            ],
          ].map(([name, label, value]) => (
            <label className="grid gap-1 text-sm" key={String(name)}>
              <span>{label} (days)</span>
              <input
                className={fieldClass}
                defaultValue={Number(value)}
                min="1"
                name={String(name)}
                type="number"
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              defaultChecked={policy?.legalHold}
              name="legalHold"
              type="checkbox"
              value="yes"
            />{" "}
            Legal hold—pause automated deletion
          </label>
          <Button
            className="sm:col-span-2"
            disabled={saveRetention.isPending}
            type="submit"
          >
            Save retention policy
          </Button>
        </form>
        <form
          className="grid gap-3 border-t border-border pt-4"
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
          <h3 className="text-sm font-medium">Customer privacy request</h3>
          <select className={fieldClass} name="privacyType">
            <option value="access">Access</option>
            <option value="export">Export</option>
            <option value="correction">Correction</option>
            <option value="restriction">Restriction</option>
            <option value="erasure">Erasure</option>
          </select>
          <input
            className={fieldClass}
            name="subjectReference"
            placeholder="Request reference, phone, or email"
            required
          />
          <input
            className={fieldClass}
            name="correctedName"
            placeholder="Corrected name (correction only)"
          />
          <input
            className={fieldClass}
            name="privacyReason"
            placeholder="Structured request reason"
            required
          />
          <Button
            disabled={createPrivacy.isPending}
            type="submit"
            variant="outline"
          >
            Record privacy request
          </Button>
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
                    <Button
                      onClick={() =>
                        verifyPrivacy.mutate({
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
                  const blob = new Blob(
                    [JSON.stringify(privacyResult.data, null, 2)],
                    { type: "application/json" },
                  )
                  const url = URL.createObjectURL(blob)
                  const anchor = document.createElement("a")
                  anchor.href = url
                  anchor.download = `prescription-privacy-${privacyResult.data.privacyRequestId}.json`
                  anchor.click()
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
          className="grid gap-3 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            incident.mutate({
              reason: String(data.get("reason") ?? ""),
              storeId,
              type: String(data.get("type")) as
                | "freeze_processing"
                | "revoke_public_links"
                | "revoke_whatsapp"
                | "suspend_commerce",
            })
          }}
        >
          <h3 className="text-sm font-medium">Incident controls</h3>
          <select className={fieldClass} name="type">
            <option value="freeze_processing">Freeze processing</option>
            <option value="suspend_commerce">
              Suspend Prescription Commerce
            </option>
            <option value="revoke_public_links">Revoke public links</option>
            <option value="revoke_whatsapp">Suspend WhatsApp routing</option>
          </select>
          <input
            className={fieldClass}
            name="reason"
            placeholder="Required incident reason"
            required
          />
          <Button disabled={incident.isPending} type="submit" variant="outline">
            Activate control
          </Button>
        </form>
        {compliance.data?.incidents.some(
          (control) => control.status === "ACTIVE",
        ) ? (
          <div className="grid gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Active incident controls</h3>
            {compliance.data.incidents
              .filter((control) => control.status === "ACTIVE")
              .map((control) => (
                <div
                  className="flex items-center justify-between gap-2 border border-border p-3 text-sm"
                  key={control.id}
                >
                  <span>{control.type.toLowerCase().replaceAll("_", " ")}</span>
                  <Button
                    onClick={() =>
                      resolveIncident.mutate({ controlId: control.id, storeId })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Resolve
                  </Button>
                </div>
              ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
