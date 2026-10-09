"use client"

import { Badge, Button, Input, MoneyInput, cn } from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import Link from "next/link"
import { type ReactNode, useId, useState } from "react"
import { AttachmentThumbnail } from "./setup-attachment-chips"
import {
  type SetupAttachmentName,
  type SetupCardPayload,
  type SetupDraftEntity,
  type SetupMoneyAccountPayload,
  entityEmoji,
  entityErrorCopy,
  entityPayload,
  entityQuestions,
  entitySource,
  entitySummary,
} from "./setup-format"
import {
  SetupIllustrationControl,
  SetupRecordAvatar,
} from "./setup-illustration"
import {
  SetupVariantFields,
  setupEditedVariants,
  setupVariantEditorRows,
} from "./setup-variant-fields"

const STATE_LABEL: Record<SetupDraftEntity["state"], string> = {
  PROPOSED: "Ready to confirm",
  NEEDS_INPUT: "Needs info",
  CONFIRMED: "Confirmed",
  COMMITTED: "Added",
  FAILED: "Not added",
  SKIPPED: "Skipped",
}

type CardProps = {
  entity: SetupDraftEntity
  /** Files sent in this setup, to show where a record was read from. */
  attachments?: Map<string, SetupAttachmentName>
  currencyCode: string
  pending: boolean
  onSave: (payload: SetupCardPayload) => void
  onState: (state: "CONFIRMED" | "PROPOSED" | "SKIPPED") => void
}

const ADDED_LINK: Record<SetupDraftEntity["kind"], [string, string]> = {
  PRODUCT: ["/catalog", "View in Catalog"],
  SERVICE: ["/catalog", "View in Catalog"],
  CUSTOMER: ["/customers", "View in Customers"],
  MONEY_ACCOUNT: ["/finance/accounts", "View in Finance"],
}

const USAGE_OPTIONS = [
  { value: "FOR_SALE", label: "I sell it" },
  { value: "INTERNAL_USE", label: "I use it, not for sale" },
  { value: "BOTH", label: "I sell it and use it" },
] as const

export function SetupDraftCard({
  entity,
  attachments,
  currencyCode,
  pending,
  onSave,
  onState,
}: CardProps) {
  const payload = entityPayload(entity)
  const questions = entityQuestions(entity)
  const [editing, setEditing] = useState(false)
  const emoji = entityEmoji(payload)
  const skipped = entity.state === "SKIPPED"
  const locked = entity.state === "COMMITTED"
  const addedLink =
    ADDED_LINK[payload.kind === "money_account" ? "MONEY_ACCOUNT" : entity.kind]
  const source = entitySource(entity)
  const origin = source.attachmentId
    ? attachments?.get(source.attachmentId)
    : undefined
  const photoId =
    payload.kind === "product" ? payload.photoAttachmentId : undefined

  return (
    <li
      className={cn("flex flex-col gap-3 px-4 py-3", skipped && "opacity-60")}
    >
      <div className="flex items-start gap-3">
        <SetupRecordAvatar
          payload={payload}
          emoji={emoji}
          className="size-9 text-base"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {payload.name}
            </p>
            <Badge
              variant={
                entity.state === "CONFIRMED" || entity.state === "COMMITTED"
                  ? "default"
                  : entity.state === "NEEDS_INPUT"
                    ? "outline"
                    : "secondary"
              }
            >
              {STATE_LABEL[entity.state]}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entitySummary(payload, currencyCode)}
          </p>
          {origin || (source.uncertain && !locked) ? (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {origin ? (
                <span className="min-w-0 truncate">
                  From {origin.fileName}
                  {source.location ? ` · ${source.location}` : ""}
                </span>
              ) : null}
              {source.uncertain && !locked ? (
                <Badge variant="outline" title="Part of this was hard to read">
                  Check this
                </Badge>
              ) : null}
            </p>
          ) : null}
          {photoId ? (
            <div className="mt-2 flex items-center gap-2">
              <AttachmentThumbnail
                src={`/api/assistant/attachments/${encodeURIComponent(photoId)}/content`}
                kind="IMAGE"
              />
              <span className="text-[11px] text-muted-foreground">
                {locked
                  ? "Photo sent with this product"
                  : "This photo is added with the product"}
              </span>
            </div>
          ) : null}
          {!locked && !skipped && !editing ? (
            <SetupIllustrationControl
              payload={payload}
              pending={pending}
              onSave={onSave}
            />
          ) : null}
          {entity.state === "FAILED" || (locked && entity.errorCode) ? (
            <p
              role={entity.state === "FAILED" ? "alert" : undefined}
              className={cn(
                "mt-2 text-xs",
                entity.state === "FAILED"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {entityErrorCopy(entity.errorCode, payload)}
            </p>
          ) : null}
          {questions.length > 0 && !skipped && !locked ? (
            <ul className="mt-2 space-y-1">
              {questions.map((question) => (
                <li
                  key={`${question.field}:${question.question}`}
                  className={cn(
                    "text-xs",
                    question.required
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {question.required ? "Needed: " : "Optional: "}
                  {question.question}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {editing ? (
        <SetupDraftEditor
          payload={payload}
          currencyCode={currencyCode}
          pending={pending}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            onSave(next)
            setEditing(false)
          }}
        />
      ) : locked ? (
        <div className="pl-12">
          <Link
            href={addedLink[0]}
            className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
          >
            {addedLink[1]}
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pl-12">
          {entity.state === "FAILED" ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => onState("CONFIRMED")}
            >
              Try again
            </Button>
          ) : null}
          {entity.state === "PROPOSED" ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => onState("CONFIRMED")}
            >
              Confirm
            </Button>
          ) : null}
          {entity.state === "CONFIRMED" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onState("PROPOSED")}
            >
              Undo confirm
            </Button>
          ) : null}
          {!skipped ? (
            <Button
              type="button"
              size="sm"
              variant={entity.state === "NEEDS_INPUT" ? "default" : "outline"}
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              {entity.state === "NEEDS_INPUT" ? "Add details" : "Edit"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => onState(skipped ? "PROPOSED" : "SKIPPED")}
          >
            {skipped ? "Restore" : "Skip"}
          </Button>
        </div>
      )}
    </li>
  )
}

function SetupDraftEditor({
  payload,
  currencyCode,
  pending,
  onCancel,
  onSave,
}: {
  payload: SetupCardPayload
  currencyCode: string
  pending: boolean
  onCancel: () => void
  onSave: (payload: SetupCardPayload) => void
}) {
  if (payload.kind === "money_account")
    return (
      <MoneyAccountEditor
        payload={payload}
        currencyCode={currencyCode}
        pending={pending}
        onCancel={onCancel}
        onSave={onSave}
      />
    )
  return (
    <RecordEditor
      payload={payload}
      currencyCode={currencyCode}
      pending={pending}
      onCancel={onCancel}
      onSave={onSave}
    />
  )
}

function RecordEditor({
  payload,
  currencyCode,
  pending,
  onCancel,
  onSave,
}: {
  payload: Exclude<SetupCardPayload, SetupMoneyAccountPayload>
  currencyCode: string
  pending: boolean
  onCancel: () => void
  onSave: (payload: SetupCardPayload) => void
}) {
  const [name, setName] = useState(payload.name)
  const [price, setPrice] = useState(
    payload.kind !== "customer" ? minorToMajorInput(payload.priceMinor) : "",
  )
  const [usage, setUsage] = useState(
    payload.kind === "product" ? (payload.usage ?? "FOR_SALE") : "FOR_SALE",
  )
  const [stock, setStock] = useState(
    payload.kind === "product" ? (payload.openingStock ?? "") : "",
  )
  const [unit, setUnit] = useState(
    payload.kind === "product" ? payload.unitName : "",
  )
  const [phone, setPhone] = useState(
    payload.kind === "customer" ? (payload.phone ?? "") : "",
  )
  const [balance, setBalance] = useState(
    payload.kind === "customer"
      ? minorToMajorInput(payload.opening?.amountMinor)
      : "",
  )
  const perVariant =
    payload.kind === "product" &&
    Boolean(payload.options?.length || payload.variants?.length)
  const [variantRows, setVariantRows] = useState(() =>
    payload.kind === "product" ? setupVariantEditorRows(payload) : [],
  )

  function submit() {
    const trimmedName = name.trim() || payload.name
    if (payload.kind === "customer") {
      const amountMinor = majorToMinor(balance)
      onSave({
        ...payload,
        name: trimmedName,
        phone: phone.trim() || undefined,
        opening:
          amountMinor && amountMinor > 0
            ? {
                direction: payload.opening?.direction ?? "owes_business",
                amountMinor,
              }
            : undefined,
      })
      return
    }
    const priceMinor = majorToMinor(price) ?? undefined
    if (payload.kind === "service") {
      onSave({ ...payload, name: trimmedName, priceMinor })
      return
    }
    const openingStock = stock.trim().replace(/,/g, "")
    onSave({
      ...payload,
      name: trimmedName,
      priceMinor: perVariant ? undefined : priceMinor,
      usage: usage === "FOR_SALE" && !payload.usage ? undefined : usage,
      unitName: unit.trim() || payload.unitName,
      ...(perVariant
        ? {
            variants: setupEditedVariants(payload, variantRows),
            sellingUnits: payload.sellingUnits?.map((unit) => ({
              ...unit,
              priceMinor: undefined,
            })),
          }
        : {}),
      openingStock: perVariant
        ? variantRows.every((row) => row.stock.trim())
          ? undefined
          : payload.openingStock
        : /^\d+(\.\d{1,6})?$/.test(openingStock)
          ? openingStock
          : undefined,
    })
  }

  const id = useId()
  return (
    <form
      className="grid gap-3 pl-12 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <EditorField id={`${id}-name`} label="Name" wide>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </EditorField>
      {payload.kind === "customer" ? (
        <>
          <EditorField id={`${id}-phone`} label="Phone">
            <Input
              id={`${id}-phone`}
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </EditorField>
          <EditorField
            id={`${id}-balance`}
            label={
              payload.opening?.direction === "business_owes"
                ? "You hold for them"
                : "They owe you"
            }
          >
            <MoneyInput
              id={`${id}-balance`}
              currencyCode={currencyCode}
              inputMode="decimal"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
            />
          </EditorField>
        </>
      ) : (
        <>
          {payload.kind === "product" ? (
            <EditorField id={`${id}-usage`} label="How you use it" wide>
              <select
                id={`${id}-usage`}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={usage}
                onChange={(event) =>
                  setUsage(event.target.value as typeof usage)
                }
              >
                {USAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </EditorField>
          ) : null}
          {!perVariant ? (
            <EditorField
              id={`${id}-price`}
              label={
                payload.kind === "product"
                  ? `${usage === "INTERNAL_USE" ? "Selling price (optional)" : "Price"} per ${unit.toLowerCase() || "unit"}`
                  : "Price"
              }
            >
              <MoneyInput
                id={`${id}-price`}
                currencyCode={currencyCode}
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </EditorField>
          ) : null}
          {payload.kind === "product" ? (
            <>
              {perVariant ? (
                <SetupVariantFields
                  rows={variantRows}
                  unitName={payload.unitName}
                  currencyCode={currencyCode}
                  internalUse={usage === "INTERNAL_USE"}
                  onChange={setVariantRows}
                />
              ) : (
                <>
                  <EditorField id={`${id}-unit`} label="Counted in">
                    <Input
                      id={`${id}-unit`}
                      value={unit}
                      onChange={(event) => setUnit(event.target.value)}
                    />
                  </EditorField>
                  <EditorField id={`${id}-stock`} label="In stock now">
                    <Input
                      id={`${id}-stock`}
                      inputMode="decimal"
                      value={stock}
                      onChange={(event) => setStock(event.target.value)}
                    />
                  </EditorField>
                </>
              )}
            </>
          ) : null}
        </>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function EditorField({
  id,
  label,
  wide = false,
  children,
}: {
  id: string
  label: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function MoneyAccountEditor({
  payload,
  currencyCode,
  pending,
  onCancel,
  onSave,
}: {
  payload: SetupMoneyAccountPayload
  currencyCode: string
  pending: boolean
  onCancel: () => void
  onSave: (payload: SetupCardPayload) => void
}) {
  const [name, setName] = useState(payload.name)
  const [purpose, setPurpose] = useState(payload.purpose)
  const [bankName, setBankName] = useState(payload.bankName ?? "")
  const [balance, setBalance] = useState(
    minorToMajorInput(payload.openingBalanceMinor),
  )
  const id = useId()
  return (
    <form
      className="grid gap-3 pl-12 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        const openingBalanceMinor = majorToMinor(balance)
        onSave({
          ...payload,
          name: name.trim() || payload.name,
          purpose,
          bankName:
            purpose === "BANK" ? bankName.trim() || undefined : undefined,
          openingBalanceMinor:
            openingBalanceMinor !== null && openingBalanceMinor >= 0
              ? openingBalanceMinor
              : undefined,
        })
      }}
    >
      <EditorField id={`${id}-name`} label="Name" wide>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </EditorField>
      <EditorField id={`${id}-purpose`} label="Kind">
        <select
          id={`${id}-purpose`}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={purpose}
          onChange={(event) =>
            setPurpose(
              event.target.value as SetupMoneyAccountPayload["purpose"],
            )
          }
        >
          <option value="CASH">Cash</option>
          <option value="BANK">Bank account</option>
        </select>
      </EditorField>
      {purpose === "BANK" ? (
        <EditorField id={`${id}-bank`} label="Bank">
          <Input
            id={`${id}-bank`}
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
          />
        </EditorField>
      ) : null}
      <EditorField id={`${id}-balance`} label="Money in it now">
        <MoneyInput
          id={`${id}-balance`}
          currencyCode={currencyCode}
          inputMode="decimal"
          value={balance}
          onChange={(event) => setBalance(event.target.value)}
        />
      </EditorField>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
