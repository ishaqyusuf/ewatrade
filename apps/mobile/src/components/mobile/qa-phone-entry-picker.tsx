import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  getStoredQaAuthorization,
  getStoredQaClientId,
  setStoredQaAuthorization,
  setStoredQaClientId,
} from "@/lib/qa-authorization-store"
import { useTRPC } from "@/trpc/client"
import { QA_ACCELERATOR_CONTRACT_VERSION } from "@ewatrade/utils/qa-accelerator"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useState } from "react"
import { AuthActionButton } from "./auth-header"
import { FormField } from "./form-field"

export type SelectedQaPhone = { id: string; phone: string; token: string }
/** Uses an existing tester grant; an unauthorised client never receives contacts. */
export function QaPhoneEntryPicker({
  value,
  onChange,
  disabled,
}: {
  value: SelectedQaPhone | null
  onChange: (v: SelectedQaPhone | null) => void
  disabled?: boolean
}) {
  const trpc = useTRPC()
  const capability = useQuery(
    trpc.qaAccess.phoneCapability.queryOptions(undefined, {
      retry: false,
      refetchInterval: 60_000,
    }),
  )
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState(
    () => getStoredQaAuthorization()?.token ?? "",
  )
  const [domain, setDomain] = useState("")
  const [credential, setCredential] = useState("")
  const exchange = useMutation(
    trpc.qaAccess.exchange.mutationOptions({
      onSuccess(result) {
        setStoredQaAuthorization({
          ...result.authorization,
          expiresAt: result.authorization.expiresAt.toISOString(),
          token: result.token,
        })
        setToken(result.token)
        setCredential("")
      },
    }),
  )
  const entries = useQuery(
    trpc.qaAccess.phoneEntries.queryOptions(
      { token },
      { enabled: open && !!token, retry: false, staleTime: 0 },
    ),
  )
  const [authorizing, setAuthorizing] = useState(false)
  if (value)
    return (
      <View className="gap-2 rounded-xl border border-primary/30 p-3">
        <Text className="text-xs text-muted-foreground">
          Filled from your QA entry. A normal WhatsApp code goes to this number.
          Selection does not sign you in.
        </Text>
        <View className="flex-row justify-between">
          <Pressable
            disabled={disabled}
            onPress={() => {
              onChange(null)
              setOpen(true)
            }}
          >
            <Text className="text-primary">Change QA entry</Text>
          </Pressable>
          <Pressable
            disabled={disabled}
            onPress={() => {
              onChange(null)
              setOpen(false)
            }}
          >
            <Text className="text-primary">Use another number</Text>
          </Pressable>
        </View>
      </View>
    )
  if (!capability.data?.enabled) return null
  return (
    <View className="gap-3">
      <Pressable disabled={disabled} onPress={() => setOpen(!open)}>
        <Text className="text-primary">
          {open ? "Close QA selection" : "Sign in as a QA tester"}
        </Text>
      </Pressable>
      {open && (
        <>
          {entries.data?.map((entry) => (
            <Pressable
              key={entry.id}
              disabled={disabled}
              className="rounded-xl border border-border p-3"
              onPress={() =>
                onChange({ id: entry.id, phone: entry.phone, token })
              }
            >
              <Text>{entry.name ?? entry.qa}</Text>
              <Text className="text-xs text-muted-foreground">
                {entry.phone.slice(0, 4)} ··· {entry.phone.slice(-4)}
              </Text>
            </Pressable>
          ))}
          {entries.isFetching && <Text>Loading your QA entries…</Text>}
          {entries.data?.length === 0 && (
            <Text>No active phone entry is available for this QA access.</Text>
          )}
          {(!token || entries.error || authorizing) && (
            <>
              <FormField
                label="QA domain"
                value={domain}
                onChangeText={setDomain}
                autoCapitalize="none"
                editable={!exchange.isPending}
              />
              <FormField
                label="Tester access key"
                value={credential}
                onChangeText={setCredential}
                secureTextEntry
                autoCapitalize="none"
                editable={!exchange.isPending}
              />
              {exchange.error && (
                <Text className="text-destructive">
                  {exchange.error.message}
                </Text>
              )}
              <AuthActionButton
                disabled={
                  !domain.trim() || !credential.trim() || exchange.isPending
                }
                onPress={() => {
                  const clientId =
                    getStoredQaClientId() ?? `mobile_${Crypto.randomUUID()}`
                  setStoredQaClientId(clientId)
                  exchange.mutate({
                    clientId,
                    contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
                    qaDomain: domain.trim(),
                    credential: credential.trim(),
                  })
                  setAuthorizing(false)
                }}
              >
                {exchange.isPending ? "Checking access…" : "Load my QA entries"}
              </AuthActionButton>
            </>
          )}
          {!!token && !authorizing && (
            <Pressable onPress={() => setAuthorizing(true)}>
              <Text className="text-primary">
                Use a different tester access key
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  )
}
