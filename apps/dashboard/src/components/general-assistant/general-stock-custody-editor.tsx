"use client"

import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import {
  Button,
  ControlField,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

type Action = Extract<GeneralAction, { action: "stock_custody_move" }>
type Person = { id: string; name: string }

/**
 * The staff a custody assignment may choose, from a fresh read bound to the
 * current Tenant/Store: the canonical Store-eligible assignees that the
 * protected staff list also authorizes. A list for another Store, or a
 * drafted identity that is no longer eligible, is never offered as a choice.
 */
export function custodyStaffChoices(input: {
  read: "loading" | "ready" | "unavailable"
  activeStoreId: string | undefined
  optionsStoreId: string | undefined
  assignees: Person[] | undefined
  selected: string
}) {
  if (input.read === "loading")
    return { status: "loading" as const, people: [], selectedEligible: false }
  if (
    input.read === "unavailable" ||
    !input.activeStoreId ||
    input.optionsStoreId !== input.activeStoreId
  )
    return {
      status: "unavailable" as const,
      people: [],
      selectedEligible: false,
    }
  const people = input.assignees ?? []
  return {
    status: people.length ? ("ready" as const) : ("empty" as const),
    people,
    selectedEligible: people.some((person) => person.id === input.selected),
  }
}

type Trpc = ReturnType<typeof useTRPC>
// Both reads belong to one editor opening: their own cache entry (the SDK
// still sends its canonical key and input) and abort on close, so a request
// started before a reopen or an authority change can never answer it.
const freshOptions = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}
/** The current Tenant/Store/member, read fresh for this editor opening. */
export function custodyContextRead(trpc: Trpc, mount: string) {
  return mountOwnedRead(
    trpc.tenant.current.queryOptions(undefined, freshOptions),
    mount,
  )
}
/** Store-eligible staff for this opening (canonical protected read). */
export function custodyOptionsRead(
  trpc: Trpc,
  mount: string,
  enabled: boolean,
) {
  return mountOwnedRead(
    trpc.serviceAssistantIntake.options.queryOptions(
      {},
      { ...freshOptions, enabled },
    ),
    mount,
  )
}

/** Tenant/Store/member identity; a change remounts the form from scratch. */
export function custodyEditorScope(
  context:
    | {
        tenant: { id: string }
        activeStore?: { id: string } | null
        membership: { id: string }
      }
    | null
    | undefined,
) {
  return `${context?.tenant.id}:${context?.activeStore?.id}:${context?.membership.id}`
}

/**
 * Edits a drafted custody move. The source balance and direction stay as
 * drafted; the server re-checks eligibility at review and confirmation.
 */
export function GeneralStockCustodyEditor(props: {
  initial: Action
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const trpc = useTRPC()
  const assigning = props.initial.target.type === "staff"
  const [mount] = useState(nextReadMount)
  const context = useQuery(custodyContextRead(trpc, mount))
  // Only a context read this opening completed counts; a refetch in flight
  // or a cached earlier answer leaves the choices loading.
  const fresh = freshShownRead(context)
  const activeStoreId =
    fresh.state === "ready" ? fresh.data.activeStore?.id : undefined
  const scope = custodyEditorScope(context.data)
  // Keyed by Tenant/Store/member: a scope change starts a fresh list and
  // never retains the previous Store's people or selection.
  return (
    <CustodyForm
      key={scope}
      {...props}
      assigning={assigning}
      contextState={
        fresh.state === "checking"
          ? "loading"
          : fresh.state === "refused" || !activeStoreId
            ? "unavailable"
            : "ready"
      }
      activeStoreId={activeStoreId}
    />
  )
}

function CustodyForm({
  initial,
  disabled,
  onSave,
  onCancel,
  assigning,
  contextState,
  activeStoreId,
}: {
  initial: Action
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
  assigning: boolean
  contextState: "loading" | "ready" | "unavailable"
  activeStoreId: string | undefined
}) {
  const trpc = useTRPC()
  const [payload, setPayload] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [mount] = useState(nextReadMount)
  const options = useQuery(
    custodyOptionsRead(trpc, mount, assigning && contextState === "ready"),
  )
  const freshList = freshShownRead(options)
  const selected = payload.target.type === "staff" ? payload.target.userId : ""
  const choices = custodyStaffChoices({
    read:
      contextState !== "ready"
        ? contextState
        : freshList.state === "checking"
          ? "loading"
          : freshList.state === "refused"
            ? "unavailable"
            : "ready",
    activeStoreId,
    optionsStoreId:
      freshList.state === "ready" ? freshList.data.storeId : undefined,
    assignees:
      freshList.state === "ready" ? freshList.data.assignees : undefined,
    selected,
  })
  return (
    <CustodyFormView
      payload={payload}
      assigning={assigning}
      choices={choices}
      disabled={disabled}
      error={error}
      onChange={setPayload}
      onSubmit={() => {
        const parsed = generalActionSchema.safeParse(payload)
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the custody details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      }}
      onCancel={onCancel}
    />
  )
}

/** Stateless form: what is offered, said and allowed for given choices. */
export function CustodyFormView({
  payload,
  assigning,
  choices,
  disabled,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  payload: Action
  assigning: boolean
  choices: ReturnType<typeof custodyStaffChoices>
  disabled: boolean
  error: string | null
  onChange: (payload: Action) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const selected = payload.target.type === "staff" ? payload.target.userId : ""
  const blocked = assigning && !choices.selectedEligible
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled || blocked) return
        onSubmit()
      }}
    >
      <p className="text-sm text-muted-foreground">
        {assigning
          ? "Choose who takes the stock and how much. The review shows Store stock, reserved and movable quantity before you confirm."
          : "Enter how much returns to the Store. The review shows the staff member's stock before you confirm."}
      </p>
      <FieldGroup>
        {assigning ? (
          <>
            {choices.status === "loading" ? (
              <output aria-live="polite" className="text-sm">
                Loading staff who can hold stock in this Store…
              </output>
            ) : choices.status === "unavailable" ? (
              <p role="alert" className="text-sm text-destructive">
                Staff for this Store are unavailable. Check your Store and
                access, then try again.
              </p>
            ) : choices.status === "empty" ? (
              <p className="text-sm text-muted-foreground">
                No staff can hold stock in this Store.
              </p>
            ) : (
              <ControlField label={<>Staff member</>}>
                <SelectControl
                  value={choices.selectedEligible ? selected : ""}
                  disabled={disabled}
                  onValueChange={(value) =>
                    onChange({
                      ...payload,
                      target: { type: "staff", userId: value },
                    })
                  }
                  options={[
                    ...(choices.selectedEligible
                      ? []
                      : [{ value: "", label: <>Choose a staff member</> }]),
                    ...choices.people.map((person) => ({
                      value: person.id,
                      label: person.name,
                    })),
                  ]}
                />
              </ControlField>
            )}
            {choices.status !== "loading" && !choices.selectedEligible ? (
              <p className="text-sm text-muted-foreground">
                The drafted staff member can't hold stock in this Store now.
                Choose someone listed to save.
              </p>
            ) : null}
          </>
        ) : null}
        <Field>
          <FieldLabel htmlFor="custody-quantity">
            {assigning ? "Quantity to give" : "Quantity to return"}
          </FieldLabel>
          <Input
            id="custody-quantity"
            inputMode="decimal"
            value={payload.quantity}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...payload, quantity: event.target.value })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="custody-reason">Reason</FieldLabel>
          <Textarea
            id="custody-reason"
            value={payload.reason}
            maxLength={500}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...payload, reason: event.target.value })
            }
          />
        </Field>
      </FieldGroup>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={disabled || blocked}>
          Save draft
        </Button>
      </div>
    </form>
  )
}
