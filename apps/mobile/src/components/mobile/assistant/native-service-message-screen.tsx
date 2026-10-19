import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { ServiceManualMessageTarget } from "@ewatrade/assistant/general/service-message-read"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { NativeServiceMessageContent } from "./native-service-message-content"
import {
  nativeServiceMessageContextMatches,
  nativeServiceMessageProfileKey,
} from "./native-service-message-values"

const options = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}

export function NativeServiceMessageScreen({
  target,
}: { target: ServiceManualMessageTarget }) {
  const { profile } = useAuthContext()
  const [generation, setGeneration] = useState(0)
  const scope = nativeServiceMessageProfileKey(profile)
  const owner = JSON.stringify([scope, target])
  const live = useRef(owner)
  live.current = owner
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const current = () => mounted.current && live.current === owner
  if (
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE") ||
    !(
      profile.role === "OWNER" ||
      profile.role === "ADMIN" ||
      (profile.role === "MANAGER" && profile.staffAccessMode === "LEGACY")
    )
  )
    return (
      <View className="p-5">
        <Text>
          Current business and Store message access is required for this
          original.
        </Text>
      </View>
    )
  return (
    <OriginalRead
      key={JSON.stringify([owner, generation])}
      target={target}
      profile={profile}
      current={current}
      reload={() => {
        if (current()) setGeneration((v) => v + 1)
      }}
    />
  )
}
function OriginalRead({
  target,
  profile,
  current,
  reload,
}: {
  target: ServiceManualMessageTarget
  profile: NonNullable<ReturnType<typeof useAuthContext>["profile"]>
  current: () => boolean
  reload: () => void
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [mount] = useState(nextReadMount)
  const mounted = useRef(true)
  const retired = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const { kind: _kind, ...input } = target
  const query = useQuery(
    mountOwnedRead(
      trpc.serviceCommunications.manualMessageOriginal.queryOptions(
        input,
        options,
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const raw = read.state === "ready" ? read.data : null
  const record =
    raw &&
    nativeServiceMessageContextMatches(raw, profile, target.jobId) &&
    raw.intent.id === target.intentId &&
    raw.share.id === target.shareId &&
    raw.intent.channel === "MANUAL" &&
    raw.intent.status === "COMPLETED" &&
    raw.intent.purpose === "assistant_manual_share" &&
    raw.kind === "staff_reported_share" &&
    raw.sending === "none" &&
    raw.delivery === "unverified"
      ? raw
      : null
  const owner = useRef<{ record: typeof record; token: object }>({
    record: null,
    token: {},
  })
  if (owner.current.record !== record) owner.current = { record, token: {} }
  const token = owner.current.token
  const owns = () =>
    mounted.current &&
    !retired.current &&
    current() &&
    Boolean(record) &&
    owner.current.token === token
  const retry = () => {
    if (!mounted.current || retired.current || !current()) return
    retired.current = true
    reload()
  }
  if (read.state === "checking")
    return (
      <View className="p-5">
        <Text>Checking current access and the exact saved message…</Text>
      </View>
    )
  if (!record)
    return (
      <View className="gap-3 p-5">
        <Text accessibilityRole="alert">
          This exact saved message is unavailable for current access or its
          original business and Store. No delivery is inferred.
        </Text>
        <ActionButton variant="outline" onPress={retry}>
          Try again
        </ActionButton>
      </View>
    )
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      <NativeServiceMessageContent
        record={record}
        onOpenOrder={() => {
          if (!owns()) return
          router.push({
            pathname: "/order/[orderId]",
            params: { orderId: record.order.id },
          })
        }}
      />
      <ActionButton variant="outline" onPress={retry}>
        Refresh original
      </ActionButton>
    </ScrollView>
  )
}
