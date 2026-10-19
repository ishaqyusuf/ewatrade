import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type GeneralAnswer,
  staffHistoryTargetSchema,
  staffMemberTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { ListCard } from "../green-till/kit"

type Target = Extract<
  NonNullable<GeneralAnswer["target"]>,
  { kind: "staff_member" }
>
type Member = RouterOutputs["retailOps"]["staffDirectoryMember"]
type Props = {
  target: Target
  onOpen: (target: NonNullable<GeneralAnswer["target"]>) => void
}
const utc = (value: Date | string | null | undefined) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : "Not recorded"

/** Navigation selects a membership; only the protected read supplies facts. */
export function NativeStaffMemberScreen({ target, onOpen }: Props) {
  const { profile } = useAuthContext()
  const parsed = staffMemberTargetSchema.safeParse(target)
  if (!parsed.success)
    return (
      <Notice>
        This staff member link is invalid. Go back and open a fresh result.
      </Notice>
    )
  const administrative = profile?.role === "OWNER" || profile?.role === "ADMIN"
  const legacyManager =
    profile?.role === "MANAGER" && profile.staffAccessMode === "LEGACY"
  if (
    !profile?.id ||
    !profile.businessId ||
    (profile.status !== undefined && profile.status !== "ACTIVE") ||
    (!administrative && !legacyManager)
  )
    return (
      <Notice>
        Current business staff-management access is required for this member.
      </Notice>
    )
  const scope = JSON.stringify([
    profile.id,
    profile.businessId,
    profile.storeId,
    profile.role,
    profile.staffAccessMode,
    profile.catalogEditor,
    profile.status,
    parsed.data,
  ])
  return (
    <MemberRead
      key={scope}
      target={parsed.data}
      historyAllowed={administrative}
      onOpen={onOpen}
    />
  )
}

function MemberRead({
  target,
  historyAllowed,
  onOpen,
}: Props & { historyAllowed: boolean }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffDirectoryMember.queryOptions(
        { membershipId: target.membershipId },
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
  const read = freshShownRead(query)
  if (read.state === "checking")
    return <Notice>Checking current access to this exact membership…</Notice>
  if (
    read.state === "refused" ||
    read.data.membershipId !== target.membershipId
  )
    return (
      <View className="gap-4 p-5">
        <Text accessibilityRole="alert">
          Staff membership is unavailable for your current business or access.
        </Text>
        <ActionButton variant="outline" onPress={() => void query.refetch()}>
          Try again
        </ActionButton>
      </View>
    )
  const member: Member = read.data
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      <ListCard>
        <View className="gap-3 py-3">
          <Text
            accessibilityRole="header"
            className="text-lg font-bold text-foreground"
          >
            {member.name}
          </Text>
          <Text className="text-sm text-foreground">{member.email}</Text>
          {[
            ["Current role", member.role],
            ["Current status", member.status],
            ["Membership reference", member.membershipId],
            ["Invited at (UTC)", utc(member.invitedAt)],
            ["Accepted at (UTC)", utc(member.acceptedAt)],
            ["Membership created (UTC)", utc(member.createdAt)],
            ["Membership updated (UTC)", utc(member.updatedAt)],
          ].map(([name, value]) => (
            <View key={name} className="gap-1">
              <Text className="text-xs text-muted-foreground">{name}</Text>
              <Text className="text-sm text-foreground">{value}</Text>
            </View>
          ))}
        </View>
      </ListCard>
      <View className="gap-2">
        <Text className="text-xs text-muted-foreground">
          {member.profileCoverage === "available"
            ? "Durable profile identity available. Role and status come from the current membership."
            : "Durable profile unavailable; membership identity is shown."}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Current status does not establish invitation delivery or past access.
          Lifecycle, actor and Store access history have not been read.
        </Text>
      </View>
      {historyAllowed ? (
        <ActionButton
          variant="outline"
          onPress={() =>
            onOpen(
              staffHistoryTargetSchema.parse({
                kind: "staff_history",
                filters: { membershipId: member.membershipId },
              }),
            )
          }
        >
          Open history
        </ActionButton>
      ) : null}
      <ActionButton variant="outline" onPress={() => void query.refetch()}>
        Refresh member
      </ActionButton>
    </ScrollView>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <View className="p-5">
      <Text className="text-sm text-muted-foreground">{children}</Text>
    </View>
  )
}
