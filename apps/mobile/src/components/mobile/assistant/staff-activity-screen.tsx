import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import {
  type StaffActivityTarget,
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
  staffActivityTargetSchema,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { ListCard } from "../green-till/kit"
import { staffActivityOpen } from "./general-model"

const relationLabel = {
  PERFORMED: "did",
  APPROVED: "approved",
  ASSIGNED: "was assigned",
} as const

/**
 * The exact events an assistant answer showed, re-read under current authority
 * before anything renders. Each opens its native original, or says why not.
 */
export function StaffActivityScreen({ raw }: { raw: string | undefined }) {
  let target: StaffActivityTarget | null = null
  try {
    target = raw ? staffActivityTargetSchema.parse(JSON.parse(raw)) : null
  } catch {}
  if (!target)
    return (
      <View className="p-5">
        <Text className="text-sm text-foreground">
          This activity link is invalid. Go back and open the answer again.
        </Text>
      </View>
    )
  return <ScopedActivity target={target} />
}

function ScopedActivity({ target }: { target: StaffActivityTarget }) {
  const { profile } = useAuthContext()
  // A new user, business, Store or role remounts the read, so rows from
  // earlier access never show.
  const scope = JSON.stringify([
    profile?.id,
    profile?.businessId,
    profile?.storeId,
    profile?.role,
    profile?.staffAccessMode,
  ])
  return <ShownActivity key={scope} target={target} />
}

function ShownActivity({ target }: { target: StaffActivityTarget }) {
  const router = useRouter()
  const trpc = useTRPC()
  const auth = useAuthContext()
  // The saved target supplies identities and filters only.
  // Each mount owns its read: a reopen never joins a request started under
  // earlier access, and leaving aborts the request this mount started.
  const [mount] = useState(nextReadMount)
  const shown = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffActivityShown.queryOptions(
        {
          ...target.filters,
          events: target.shown.map(({ stream, id }) => ({ stream, id })),
        },
        {
          retry: false,
          staleTime: 0,
          gcTime: 0,
          refetchOnMount: "always",
          trpc: { abortOnUnmount: true },
        },
      ),
      mount,
    ),
  )
  const fresh = freshShownRead(shown)
  if (fresh.state === "checking")
    return (
      <View className="p-5">
        <Text className="text-sm text-muted-foreground">
          Checking your current access…
        </Text>
      </View>
    )
  if (fresh.state === "refused")
    return (
      <View className="p-5">
        <Text className="text-sm text-foreground">
          This activity is unavailable for your business or access.
        </Text>
      </View>
    )
  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
      <Text className="text-xs text-muted-foreground">
        Shown in the assistant answer, checked against your current access.
        Current activity may differ; ask again to refresh.
      </Text>
      <ListCard>
        {target.shown.map((saved) => {
          const event = fresh.data.data.find(
            (fresh) => fresh.stream === saved.stream && fresh.id === saved.id,
          )
          if (!event)
            return (
              <View key={`${saved.stream}:${saved.id}`} className="py-3">
                <Text className="text-sm text-muted-foreground">
                  No longer available to you.
                </Text>
              </View>
            )
          const open = staffActivityOpen(event, auth.profile?.storeId)
          const actor =
            event.actor.coverage === "unknown"
              ? "Unknown (not recorded)"
              : event.actor.coverage === "unavailable"
                ? "Unavailable person"
                : event.actor.name
          return (
            <View key={`${event.stream}:${event.id}`} className="gap-2 py-3">
              <Text className="text-sm font-bold text-foreground">
                {actor} {relationLabel[event.relation]}: {event.outcome}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {event.record.label}
                {event.store?.name ? ` · ${event.store.name}` : ""} ·{" "}
                {new Date(event.at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </Text>
              {"route" in open && open.route ? (
                <ActionButton
                  variant="outline"
                  className="w-auto self-start px-4"
                  onPress={() => router.push(open.route)}
                >
                  Open
                </ActionButton>
              ) : (
                <Text className="text-xs text-muted-foreground">
                  {open.unavailable}
                </Text>
              )}
            </View>
          )
        })}
      </ListCard>
    </ScrollView>
  )
}
