"use client"
import {
  Button,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"

export function ExternalDomainFlow({
  store,
}: {
  store: { id: string; name: string }
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useDomainParams()
  const [domain, setDomain] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [verification, setVerification] = useState<{
    id: string
    name: string | null
    type: string | null
    value: string | null
  } | null>(null)
  const connect = useMutation(
    trpc.domains.connectExternal.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (result) =>
        setVerification({ id: result.id, ...result.verification }),
    }),
  )
  const verify = useMutation(
    trpc.domains.verifyConnection.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.domains.list.queryKey(),
        })
        setParams(null)
      },
    }),
  )

  if (verification) {
    return (
      <div className="grid gap-5">
        <div className="border border-border p-4">
          <p className="text-sm font-medium">
            Add this TXT record at your current DNS provider
          </p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="mt-1 break-all font-mono">{verification.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Value</dt>
              <dd className="mt-1 break-all font-mono">{verification.value}</dd>
            </div>
          </dl>
        </div>
        <p className="text-sm text-muted-foreground">
          DNS can take a few minutes to update. Your current website stays
          untouched until verification succeeds.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          appearance="form"
          disabled={verify.isPending}
          onClick={() => verify.mutate({ connectionId: verification.id })}
        >
          {verify.isPending ? "Checking DNS…" : "I added the record"}
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError(null)
        connect.mutate({ domain, storeId: store.id })
      }}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <ControlField label={<>Domain you already own</>}>
          <Input
            placeholder="yourbusiness.com"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
          />
        </ControlField>
        <p className="text-sm text-muted-foreground">
          You keep the domain at your current registrar. We only verify
          ownership and connect it to your EwaTrade storefront.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <FormActions>
          <SubmitButton
            isSubmitting={connect.isPending}
            type="submit"
            disabled={connect.isPending}
          >
            {connect.isPending ? "Preparing record…" : "Continue"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
