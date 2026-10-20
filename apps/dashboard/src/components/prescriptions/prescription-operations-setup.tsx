"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import {
  Button,
  Input,
  MoneyInput,
  SelectControl,
  SubmitButton,
  Switch,
  toast,
} from "@ewatrade/ui"

import {
  ComplianceField,
  ComplianceSaveRow,
  describeDays,
} from "@/components/compliance/compliance-form-parts"
import {
  SettingsNotice,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import { useSettingsAutosave } from "@/components/settings/use-settings-autosave"
import { useStoreCurrency } from "@/hooks/use-store-currency"
import { useTRPC } from "@/trpc/client"

import { formatMinorMoney, majorToMinor } from "@ewatrade/utils"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useId, useState } from "react"

const RETENTION_FIELDS = [
  {
    fallback: 30,
    key: "rawMediaDays",
    label: "Prescription photos",
  },
  {
    fallback: 90,
    help: "What staff type up from the photo.",
    key: "transcriptDays",
    label: "Typed-up prescriptions",
  },
  { fallback: 90, key: "messageDays", label: "Chats and messages" },
  { fallback: 30, key: "addressDays", label: "Delivery addresses" },
  {
    fallback: 2555,
    help: "Who did what, and when.",
    key: "auditEvidenceDays",
    label: "Activity log",
  },
  {
    fallback: 30,
    help: "Links customers use to follow their request.",
    key: "secureTokenDays",
    label: "Private request links",
  },
  { fallback: 2555, key: "commercialRecordDays", label: "Sales records" },
] as const

type RetentionKey = (typeof RETENTION_FIELDS)[number]["key"]
type RetentionDays = Record<RetentionKey, number>

const MAX_RETENTION_DAYS = 3_650

const PRIVACY_TYPES = [
  { label: "See their data", value: "access" },
  { label: "Download their data", value: "export" },
  { label: "Correct their data", value: "correction" },
  { label: "Limit how their data is used", value: "restriction" },
  { label: "Delete their data", value: "erasure" },
] as const
type PrivacyType = (typeof PRIVACY_TYPES)[number]["value"]

const PRIVACY_STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Done",
  PENDING: "Waiting for an identity check",
  PROCESSING: "In progress",
  REJECTED: "Turned down",
  VERIFIED: "Identity confirmed",
}

const INCIDENT_TYPES = [
  {
    description: "Staff can't work on any request until you resolve it.",
    label: "Pause all prescription handling",
    value: "freeze_processing",
  },
  {
    description: "New prescriptions stop coming in.",
    label: "Stop accepting prescriptions",
    value: "suspend_commerce",
  },
  {
    description: "Customers can't use them until you resolve it.",
    label: "Turn off the prescription link and QR code",
    value: "revoke_public_links",
  },
  {
    description: "No prescription messages go through WhatsApp.",
    label: "Stop WhatsApp messages",
    value: "revoke_whatsapp",
  },
  {
    description: "Lets you open private records yourself.",
    label: "Give me emergency access for 30 minutes",
    value: "break_glass",
  },
] as const
type IncidentType = (typeof INCIDENT_TYPES)[number]["value"]

const ACCESS_TYPE_LABELS: Record<string, string> = {
  break_glass_granted: "Emergency access given",
  break_glass_reviewed: "Emergency access reviewed",
  break_glass_used: "Emergency access used",
  credential: "Pharmacist licence",
  customer_data: "Customer details",
  pharmacist_decision: "Pharmacist decision",
  transcript: "Typed-up prescription",
}

function sentence(value: string) {
  const text = value.toLowerCase().replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function placesCovered(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").join(", ")
    : ""
}

export function PrescriptionOperationsSetup({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
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
  const requiredQueries = [zones, retention, manualReviews, compliance]
  if (requiredQueries.some((query) => query.isLoading)) {
    return (
      <div
        className="h-72 animate-pulse rounded-[10px] bg-muted"
        aria-busy="true"
      />
    )
  }
  if (requiredQueries.some((query) => query.error)) {
    return (
      <SettingsSection title="Records and delivery">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <p className="text-sm">Couldn't load records and delivery.</p>
          <Button
            onClick={() =>
              void Promise.all(requiredQueries.map((query) => query.refetch()))
            }
            size="sm"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      </SettingsSection>
    )
  }
  const policy = retention.data
  const savedDays = Object.fromEntries(
    RETENTION_FIELDS.map((field) => [
      field.key,
      policy?.[field.key] ?? field.fallback,
    ]),
  ) as RetentionDays

  return (
    <>
      <RetentionSection
        legalHold={policy?.legalHold ?? false}
        savedDays={savedDays}
        storeId={storeId}
      />
      <DeliveryAreasSection
        manualReviews={manualReviews.data ?? []}
        storeId={storeId}
        zones={zones.data ?? []}
      />
      <PrivacyRequestsSection
        requests={compliance.data?.privacyRequests ?? []}
        storeId={storeId}
      />
      <EmergencyControlsSection
        controls={compliance.data?.incidents ?? []}
        storeId={storeId}
      />
      <PrivateDataAccessSection
        entries={compliance.data?.sensitiveAccess ?? []}
        storeId={storeId}
      />
    </>
  )
}

function RetentionSection({
  legalHold,
  savedDays,
  storeId,
}: {
  legalHold: boolean
  savedDays: RetentionDays
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const ids = useId()
  const autosave = useSettingsAutosave()
  const [drafts, setDrafts] = useState<Partial<Record<RetentionKey, string>>>(
    {},
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.prescriptions.retentionPolicy.queryKey({ storeId }),
    })
  const saveDays = useMutation(
    trpc.prescriptions.updateRetentionPolicy.mutationOptions({
      onError: (error) => setSaveError(error.message),
      onSuccess: async () => {
        await invalidate()
        setDrafts({})
        toast("Saved.")
      },
    }),
  )
  const saveLegalHold = useMutation(
    trpc.prescriptions.updateRetentionPolicy.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: invalidate,
    }),
  )

  const draftValue = (key: RetentionKey) =>
    drafts[key] ?? String(savedDays[key])
  const dirty = RETENTION_FIELDS.some(
    (field) =>
      drafts[field.key] !== undefined &&
      drafts[field.key] !== String(savedDays[field.key]),
  )
  const setLegalHold = (next: boolean) =>
    saveLegalHold.mutate(
      { ...savedDays, legalHold: next, storeId },
      {
        onSuccess: () =>
          autosave.confirm(
            "legalHold",
            next
              ? "Automatic deletion is paused."
              : "Automatic deletion is on.",
            () =>
              saveLegalHold.mutate({
                ...savedDays,
                legalHold: !next,
                storeId,
              }),
          ),
      },
    )

  return (
    <SettingsSection
      title="Records and delivery"
      description="How long you keep each kind of record before it's deleted."
    >
      <form
        className="divide-y divide-border"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          const next = { ...savedDays }
          for (const field of RETENTION_FIELDS) {
            const days = Number(draftValue(field.key))
            if (
              !Number.isInteger(days) ||
              days < 1 ||
              days > MAX_RETENTION_DAYS
            ) {
              setSaveError(
                `${field.label}: use a whole number of days from 1 to 3,650.`,
              )
              return
            }
            next[field.key] = days
          }
          setSaveError(null)
          saveDays.mutate({ ...next, legalHold, storeId })
        }}
      >
        {RETENTION_FIELDS.map((field) => {
          const value = draftValue(field.key)
          const hint = describeDays(Number(value))
          return (
            <SettingsRow
              description={"help" in field ? field.help : undefined}
              htmlFor={`${ids}${field.key}`}
              key={field.key}
              label={field.label}
            >
              {hint ? (
                <span className="text-sm text-muted-foreground">{hint}</span>
              ) : null}
              <div className="flex items-center gap-2">
                <Input
                  className="w-24 text-right"
                  id={`${ids}${field.key}`}
                  inputMode="numeric"
                  max={MAX_RETENTION_DAYS}
                  min={1}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  type="number"
                  value={value}
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </SettingsRow>
          )
        })}
        {dirty || saveError ? (
          <ComplianceSaveRow
            error={saveError}
            isSaving={saveDays.isPending}
            onCancel={() => {
              setDrafts({})
              setSaveError(null)
            }}
          />
        ) : null}
      </form>
      <SettingsRow
        description="Use this for a legal hold. Nothing is deleted until you turn it off."
        htmlFor={`${ids}legal-hold`}
        label="Pause automatic deletion"
        saved={autosave.saved("legalHold")}
      >
        <Switch
          checked={legalHold}
          disabled={saveLegalHold.isPending}
          id={`${ids}legal-hold`}
          onCheckedChange={setLegalHold}
        />
      </SettingsRow>
    </SettingsSection>
  )
}

type DeliveryZone = {
  currencyCode: string
  feePolicy: string
  fixedFeeMinor: number | null
  id: string
  matchValues: unknown
  name: string
  promiseText: string
}

type ManualReview = {
  id: string
  promiseText: string | null
  quoteVersion: { currencyCode: string; totalMinor: number }
}

function DeliveryAreasSection({
  manualReviews,
  storeId,
  zones,
}: {
  manualReviews: ManualReview[]
  storeId: string
  zones: DeliveryZone[]
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const currencyCode = useStoreCurrency(storeId)
  const ids = useId()
  const [adding, setAdding] = useState(false)
  const [feePolicy, setFeePolicy] = useState<"fixed" | "manual">("fixed")
  const [zoneError, setZoneError] = useState<string | null>(null)
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({})

  const saveZone = useMutation(
    trpc.prescriptions.upsertDeliveryZone.mutationOptions({
      onError: (error) => setZoneError(error.message),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.deliveryZones.queryKey({ storeId }),
        })
        setAdding(false)
        setFeePolicy("fixed")
        toast("Delivery area added.")
      },
    }),
  )
  const approveManualFee = useMutation(
    trpc.prescriptions.approveManualDeliveryFee.mutationOptions({
      onError: (error, values) =>
        setReviewErrors((current) => ({
          ...current,
          [values.addressId]: error.message,
        })),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.manualDeliveryReviews.queryKey({
            storeId,
          }),
        })
        toast("Fee approved. We've told the customer if we could reach them.")
      },
    }),
  )

  return (
    <SettingsSection
      title="Delivery areas"
      description="Where you deliver and what it costs. A fixed fee is added to the customer's price before they pay."
      action={
        adding ? null : (
          <Button
            onClick={() => {
              setZoneError(null)
              setAdding(true)
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Add an area
          </Button>
        )
      }
    >
      {adding ? (
        <form
          className="grid bg-muted/40"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const fee = majorToMinor(String(data.get("fixedFee") ?? ""))
            if (
              feePolicy === "fixed" &&
              (fee === null || fee < 0 || !currencyCode)
            ) {
              setZoneError("Enter the delivery fee.")
              return
            }
            setZoneError(null)
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
          <div className="grid sm:grid-cols-2">
            <ComplianceField htmlFor={`${ids}zone-name`} label="Area name">
              <Input
                id={`${ids}zone-name`}
                name="name"
                placeholder="For example, Lekki"
                required
              />
            </ComplianceField>
            <ComplianceField
              htmlFor={`${ids}zone-places`}
              label="Places covered"
              help="Separate them with commas."
              helpId={`${ids}zone-places-help`}
            >
              <Input
                aria-describedby={`${ids}zone-places-help`}
                id={`${ids}zone-places`}
                name="matchValues"
                placeholder="Lekki Phase 1, Ajah"
                required
              />
            </ComplianceField>
            <ComplianceField htmlFor={`${ids}zone-fee-policy`} label="Fee">
              <SelectControl
                id={`${ids}zone-fee-policy`}
                onValueChange={(value) =>
                  setFeePolicy(value as "fixed" | "manual")
                }
                options={[
                  { label: "Fixed fee", value: "fixed" },
                  { label: "I set the fee for each order", value: "manual" },
                ]}
                value={feePolicy}
              />
            </ComplianceField>
            {feePolicy === "fixed" ? (
              <ComplianceField htmlFor={`${ids}zone-fee`} label="Delivery fee">
                <MoneyInput
                  currencyCode={currencyCode}
                  disabled={!currencyCode}
                  id={`${ids}zone-fee`}
                  name="fixedFee"
                />
              </ComplianceField>
            ) : null}
            <ComplianceField
              htmlFor={`${ids}zone-promise`}
              label="What you promise"
              help="Customers see this, for example Same day."
              helpId={`${ids}zone-promise-help`}
            >
              <Input
                aria-describedby={`${ids}zone-promise-help`}
                id={`${ids}zone-promise`}
                name="promiseText"
                required
              />
            </ComplianceField>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3.5">
            {zoneError ? (
              <p
                role="alert"
                className="min-w-0 flex-[1_1_220px] text-sm text-destructive"
              >
                {zoneError}
              </p>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <Button
                disabled={saveZone.isPending}
                onClick={() => {
                  setAdding(false)
                  setZoneError(null)
                  setFeePolicy("fixed")
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <SubmitButton isSubmitting={saveZone.isPending} size="sm">
                Add area
              </SubmitButton>
            </div>
          </div>
        </form>
      ) : null}

      {zones.length === 0 && !adding ? (
        <p className="px-4 py-3.5 text-sm text-muted-foreground">
          No delivery areas yet.
        </p>
      ) : (
        zones.map((zone) => {
          const places = placesCovered(zone.matchValues)
          return (
            <div className="grid gap-0.5 px-4 py-3" key={zone.id}>
              <p className="text-sm font-medium">{zone.name}</p>
              <p className="text-sm text-muted-foreground">
                {zone.feePolicy === "FIXED"
                  ? zone.fixedFeeMinor !== null
                    ? formatMinorMoney(zone.fixedFeeMinor, zone.currencyCode)
                    : "Fixed fee"
                  : "You set the fee for each order"}{" "}
                · {zone.promiseText}
                {places ? ` · ${places}` : ""}
              </p>
            </div>
          )
        })
      )}

      {manualReviews.length ? (
        <div className="grid gap-3 px-4 py-3.5">
          <div>
            <p className="text-sm font-medium">Delivery fees to set</p>
            <p className="text-sm text-muted-foreground">
              These orders are in an area where you set the fee yourself.
            </p>
          </div>
          {manualReviews.map((review) => (
            <form
              className="grid gap-2 rounded-md border border-border p-3"
              key={review.id}
              onSubmit={(event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                const feeMinor = majorToMinor(String(data.get("fee") ?? ""))
                if (feeMinor === null || feeMinor < 0) {
                  setReviewErrors((current) => ({
                    ...current,
                    [review.id]: "Enter a delivery fee.",
                  }))
                  return
                }
                setReviewErrors(({ [review.id]: _removed, ...rest }) => rest)
                approveManualFee.mutate({
                  addressId: review.id,
                  clientDecisionId: crypto.randomUUID(),
                  feeMinor,
                  reason: String(data.get("reason") ?? ""),
                  storeId,
                })
              }}
            >
              <p className="text-sm">
                Order total:{" "}
                {formatMinorMoney(
                  review.quoteVersion.totalMinor,
                  review.quoteVersion.currencyCode,
                )}
                {review.promiseText ? ` · ${review.promiseText}` : ""}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label
                    htmlFor={`${ids}${review.id}-fee`}
                    className="text-sm font-medium"
                  >
                    Delivery fee
                  </label>
                  <MoneyInput
                    currencyCode={review.quoteVersion.currencyCode}
                    id={`${ids}${review.id}-fee`}
                    name="fee"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <label
                    htmlFor={`${ids}${review.id}-reason`}
                    className="text-sm font-medium"
                  >
                    Why this fee?
                  </label>
                  <Input
                    id={`${ids}${review.id}-reason`}
                    name="reason"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {reviewErrors[review.id] ? (
                  <p
                    role="alert"
                    className="min-w-0 flex-1 text-sm text-destructive"
                  >
                    {reviewErrors[review.id]}
                  </p>
                ) : null}
                <SubmitButton
                  className="ml-auto"
                  isSubmitting={
                    approveManualFee.isPending &&
                    approveManualFee.variables?.addressId === review.id
                  }
                  disabled={approveManualFee.isPending}
                  size="sm"
                >
                  Approve fee
                </SubmitButton>
              </div>
            </form>
          ))}
        </div>
      ) : null}
    </SettingsSection>
  )
}

type PrivacyRequest = { id: string; status: string; type: string }

function PrivacyRequestsSection({
  requests,
  storeId,
}: {
  requests: PrivacyRequest[]
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const workflow = useDashboardWorkflow()
  const ids = useId()
  const [type, setType] = useState<PrivacyType>("access")
  const [exportRequestId, setExportRequestId] = useState("")
  const [identityVerificationEvidence, setIdentityVerificationEvidence] =
    useState("")
  const privacyResult = useQuery({
    ...trpc.prescriptions.privacyRequestResult.queryOptions({
      privacyRequestId: exportRequestId,
      storeId,
    }),
    enabled: Boolean(exportRequestId),
  })
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.prescriptions.complianceEvents.queryKey({ storeId }),
    })
  const createPrivacy = useMutation(
    trpc.prescriptions.createPrivacyRequest.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        toast("Request saved. Confirm the customer's identity next.")
      },
    }),
  )
  const verifyPrivacy = useMutation(
    trpc.prescriptions.verifyPrivacyRequest.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: async () => {
        await invalidate()
        setIdentityVerificationEvidence("")
        toast("Identity confirmed. We've started the request.")
      },
    }),
  )
  const typeLabel = (value: string) =>
    PRIVACY_TYPES.find((item) => item.value === value.toLowerCase())?.label ??
    "Data request"

  return (
    <SettingsSection
      title="Customer data requests"
      description="When a customer asks to see, download, correct, limit or delete their data."
    >
      <form
        className="grid"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
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
        <div className="grid sm:grid-cols-2">
          <ComplianceField
            htmlFor={`${ids}privacy-type`}
            label="What they asked for"
          >
            <SelectControl
              id={`${ids}privacy-type`}
              onValueChange={(value) => setType(value as PrivacyType)}
              options={PRIVACY_TYPES.map((item) => ({
                label: item.label,
                value: item.value,
              }))}
              value={type}
            />
          </ComplianceField>
          <ComplianceField
            htmlFor={`${ids}privacy-subject`}
            label="Customer's phone, email or request reference"
          >
            <Input
              id={`${ids}privacy-subject`}
              name="subjectReference"
              required
            />
          </ComplianceField>
          {type === "correction" ? (
            <ComplianceField
              htmlFor={`${ids}privacy-name`}
              label="Correct name"
            >
              <Input id={`${ids}privacy-name`} name="correctedName" />
            </ComplianceField>
          ) : null}
          <ComplianceField
            htmlFor={`${ids}privacy-reason`}
            label="Reason for the request"
          >
            <Input id={`${ids}privacy-reason`} name="privacyReason" required />
          </ComplianceField>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3.5">
          {createPrivacy.error ? (
            <p
              role="alert"
              className="min-w-0 flex-[1_1_220px] text-sm text-destructive"
            >
              {createPrivacy.error.message}
            </p>
          ) : null}
          <SubmitButton
            className="ml-auto"
            isSubmitting={createPrivacy.isPending}
            size="sm"
            variant="outline"
          >
            Save request
          </SubmitButton>
        </div>
      </form>

      {requests.map((request) => (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          key={request.id}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{typeLabel(request.type)}</p>
            <p className="text-sm text-muted-foreground">
              {PRIVACY_STATUS_LABELS[request.status] ?? "In progress"}
            </p>
          </div>
          {request.status === "PENDING" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="How you confirmed who they are"
                className="w-64"
                onChange={(event) =>
                  setIdentityVerificationEvidence(event.target.value)
                }
                placeholder="How you confirmed who they are"
                value={identityVerificationEvidence}
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
                Confirm identity and start
              </Button>
            </div>
          ) : null}
          {request.status === "COMPLETED" &&
          (request.type === "ACCESS" || request.type === "EXPORT") ? (
            exportRequestId === request.id && privacyResult.data ? (
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
                size="sm"
                type="button"
              >
                Download data file
              </Button>
            ) : (
              <Button
                disabled={
                  exportRequestId === request.id && privacyResult.isFetching
                }
                onClick={() => setExportRequestId(request.id)}
                size="sm"
                type="button"
                variant="outline"
              >
                Prepare data file
              </Button>
            )
          ) : null}
        </div>
      ))}
    </SettingsSection>
  )
}

type IncidentControl = { id: string; status: string; type: string }

function EmergencyControlsSection({
  controls,
  storeId,
}: {
  controls: IncidentControl[]
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const ids = useId()
  const [type, setType] = useState<IncidentType>("freeze_processing")
  const [resolveErrors, setResolveErrors] = useState<Record<string, string>>({})
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.prescriptions.complianceEvents.queryKey({ storeId }),
    })
  const incident = useMutation(
    trpc.prescriptions.activateIncident.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        toast("Emergency control is on. This is logged.")
      },
    }),
  )
  const resolveIncident = useMutation(
    trpc.prescriptions.resolveIncident.mutationOptions({
      onError: (error, values) =>
        setResolveErrors((current) => ({
          ...current,
          [values.controlId]: error.message,
        })),
      onSuccess: async () => {
        await invalidate()
        toast(
          "Resolved. Turn prescriptions back on yourself when you're ready.",
        )
      },
    }),
  )
  const activeControls = controls.filter(
    (control) => control.status === "ACTIVE",
  )
  const typeLabel = (value: string) =>
    INCIDENT_TYPES.find((item) => item.value === value.toLowerCase())?.label ??
    sentence(value)

  return (
    <SettingsSection
      title="Emergency controls"
      description="Stop part of the service straight away. Each use is logged."
    >
      {activeControls.length ? (
        <div className="p-3">
          <SettingsNotice tone="warning">
            {activeControls.length === 1
              ? "1 emergency control is on."
              : `${activeControls.length} emergency controls are on.`}
          </SettingsNotice>
        </div>
      ) : null}
      {activeControls.map((control) => (
        <form
          className="grid gap-2 px-4 py-3.5"
          key={control.id}
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            setResolveErrors(({ [control.id]: _removed, ...rest }) => rest)
            resolveIncident.mutate({
              controlId: control.id,
              reviewReason: String(data.get("reviewReason") ?? ""),
              storeId,
            })
          }}
        >
          <p className="text-sm font-medium">{typeLabel(control.type)}</p>
          <label
            htmlFor={`${ids}${control.id}-review`}
            className="text-sm text-muted-foreground"
          >
            What happened, and what did you check?
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-0 flex-[1_1_240px]"
              id={`${ids}${control.id}-review`}
              name="reviewReason"
              required
            />
            <SubmitButton
              isSubmitting={
                resolveIncident.isPending &&
                resolveIncident.variables?.controlId === control.id
              }
              disabled={resolveIncident.isPending}
              size="sm"
              variant="outline"
            >
              Mark resolved
            </SubmitButton>
          </div>
          {resolveErrors[control.id] ? (
            <p role="alert" className="text-sm text-destructive">
              {resolveErrors[control.id]}
            </p>
          ) : null}
        </form>
      ))}
      <form
        className="grid"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
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
        <div className="grid sm:grid-cols-2">
          <ComplianceField htmlFor={`${ids}incident-type`} label="Control">
            <SelectControl
              id={`${ids}incident-type`}
              onValueChange={(value) => setType(value as IncidentType)}
              options={INCIDENT_TYPES.map((item) => ({
                description: item.description,
                label: item.label,
                value: item.value,
              }))}
              value={type}
            />
          </ComplianceField>
          <ComplianceField
            htmlFor={`${ids}incident-reason`}
            label="Why are you doing this?"
          >
            <Input id={`${ids}incident-reason`} name="reason" required />
          </ComplianceField>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3.5">
          <p className="min-w-0 flex-[1_1_220px] text-sm text-muted-foreground">
            {INCIDENT_TYPES.find((item) => item.value === type)?.description}
          </p>
          {incident.error ? (
            <p role="alert" className="w-full text-sm text-destructive">
              {incident.error.message}
            </p>
          ) : null}
          <SubmitButton
            className="ml-auto"
            isSubmitting={incident.isPending}
            size="sm"
            variant="outline"
          >
            Turn on
          </SubmitButton>
        </div>
      </form>
    </SettingsSection>
  )
}

type SensitiveAccess = {
  accessType: string
  actorUserId: string
  effectiveAt: Date | string
  id: string
  reason: string
}

function PrivateDataAccessSection({
  entries,
  storeId,
}: {
  entries: SensitiveAccess[]
  storeId: string
}) {
  const trpc = useTRPC()
  const setup = useQuery(
    trpc.prescriptions.setup.queryOptions({ storeId }, { retry: false }),
  )
  if (!entries.length) return null
  const names = new Map(
    setup.data?.eligibleMembers.map((member) => [member.id, member.name]) ?? [],
  )
  return (
    <SettingsSection title="Who viewed private data">
      <details>
        <summary className="cursor-pointer px-4 py-3.5 text-sm font-medium">
          Show {entries.length === 1 ? "1 view" : `${entries.length} views`}
        </summary>
        <div className="divide-y divide-border border-t border-border">
          {entries.map((access) => (
            <div className="grid gap-0.5 px-4 py-3" key={access.id}>
              <p className="text-sm font-medium">
                {ACCESS_TYPE_LABELS[access.accessType] ??
                  sentence(access.accessType)}{" "}
                · {names.get(access.actorUserId) ?? "A former team member"}
              </p>
              <p className="text-sm text-muted-foreground">
                {new Date(access.effectiveAt).toLocaleString("en-NG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                ·{" "}
                {/^[a-z_]+$/.test(access.reason)
                  ? sentence(access.reason)
                  : access.reason}
              </p>
            </div>
          ))}
        </div>
      </details>
    </SettingsSection>
  )
}
