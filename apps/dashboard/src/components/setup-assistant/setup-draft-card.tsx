"use client"

import type { SetupEntityPayload } from "@ewatrade/assistant/setup/contracts"
import { Badge, Button, Input, MoneyInput, cn } from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import Link from "next/link"
import { type ReactNode, useId, useState } from "react"
import {
  type SetupDraftEntity,
  entityEmoji,
  entityErrorCopy,
  entityPayload,
  entityQuestions,
  entitySummary,
} from "./setup-format"

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
  currencyCode: string
  pending: boolean
  onSave: (payload: SetupEntityPayload) => void
  onState: (state: "CONFIRMED" | "PROPOSED" | "SKIPPED") => void
}

export function SetupDraftCard({
  entity,
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

  return (
    <li
      className={cn("flex flex-col gap-3 px-4 py-3", skipped && "opacity-60")}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-base"
        >
          {emoji ?? payload.name.slice(0, 1).toUpperCase()}
        </span>
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
              {entityErrorCopy(entity.errorCode)}
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
            href={entity.kind === "CUSTOMER" ? "/customers" : "/catalog"}
            className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
          >
            {entity.kind === "CUSTOMER"
              ? "View in Customers"
              : "View in Catalog"}
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
  payload: SetupEntityPayload
  currencyCode: string
  pending: boolean
  onCancel: () => void
  onSave: (payload: SetupEntityPayload) => void
}) {
  const [name, setName] = useState(payload.name)
  const [price, setPrice] = useState(
    payload.kind !== "customer" ? minorToMajorInput(payload.priceMinor) : "",
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
      priceMinor,
      unitName: unit.trim() || payload.unitName,
      openingStock: /^\d+(\.\d{1,6})?$/.test(openingStock)
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
          <EditorField
            id={`${id}-price`}
            label={
              payload.kind === "product"
                ? `Price per ${unit.toLowerCase() || "unit"}`
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
          {payload.kind === "product" ? (
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
