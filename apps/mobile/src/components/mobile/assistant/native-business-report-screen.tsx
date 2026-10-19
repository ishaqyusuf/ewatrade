import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { BusinessReportTarget } from "@ewatrade/assistant/general/business-report-target"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { NativeBusinessReportContent } from "./native-business-report-content"
import {
  nativeBusinessReportOriginalRoute,
  nativeBusinessReportPage,
  nativeBusinessReportResultMatches,
  nativeBusinessReportScopeMatches,
  readNativeBusinessReportTarget,
} from "./native-business-report-target"

type Profile = NonNullable<ReturnType<typeof useAuthContext>["profile"]>
const options = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}
const pageable = (target: BusinessReportTarget) =>
  target.request.report === "item_sales" ||
  target.request.report === "customer_debt"
const hasCursor = (target: BusinessReportTarget | null) =>
  Boolean(
    target &&
      "cursor" in target.request.filters &&
      target.request.filters.cursor,
  )

/** Original filters select a protected read; no report scope is inferred. */
export function NativeBusinessReportScreen({ raw }: { raw: unknown }) {
  const { profile } = useAuthContext()
  const target = readNativeBusinessReportTarget(raw)
  const rawKey = typeof raw === "string" ? raw : null
  const scope = JSON.stringify([
    profile?.id,
    profile?.businessId,
    profile?.storeId,
    profile?.role,
    profile?.staffAccessMode,
    profile?.catalogEditor,
    profile?.status,
  ])
  const ownerKey = JSON.stringify([scope, rawKey])
  const live = useRef(ownerKey)
  const mounted = useRef(true)
  live.current = ownerKey
  const [page, setPage] = useState({ rawKey, scope, target })
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const owns = () => mounted.current && live.current === ownerKey
  if (!target)
    return (
      <Notice>This report link is invalid. Open the saved answer again.</Notice>
    )
  if (
    !profile?.id ||
    !profile.businessId ||
    (profile.status !== undefined && profile.status !== "ACTIVE")
  )
    return (
      <Notice>
        Current active business access is required to read this report.
      </Notice>
    )

  const cursorLost =
    page.rawKey === rawKey &&
    page.scope !== scope &&
    (hasCursor(page.target) || hasCursor(target))
  if (cursorLost && pageable(target))
    return (
      <View className="gap-3 p-5">
        <Text>
          Current access changed. Start at the first page to check this report
          again; the old cursor has not been reused.
        </Text>
        <ActionButton
          variant="outline"
          onPress={() => {
            if (!owns()) return
            const first = nativeBusinessReportPage(target)
            if (first) setPage({ rawKey, scope, target: first })
          }}
        >
          First page
        </ActionButton>
      </View>
    )
  const selected =
    page.rawKey === rawKey && page.scope === scope && page.target
      ? page.target
      : target
  const key = JSON.stringify([ownerKey, selected, generation])
  return (
    <ReportRead
      key={key}
      target={selected}
      profile={profile}
      scopeCurrent={owns}
      onReload={() => {
        if (owns()) setGeneration((value) => value + 1)
      }}
      onPage={(next) => {
        if (owns()) setPage({ rawKey, scope, target: next })
      }}
    />
  )
}

function currentScopeMatches(
  target: BusinessReportTarget,
  current: RouterOutputs["tenant"]["current"],
  profile: Profile,
) {
  const mode = current.membership.staffAccessMode ?? current.staffAccess?.mode
  const catalog =
    current.membership.catalogEditor ?? current.staffAccess?.catalogEditor
  return (
    current.tenant.id === profile.businessId &&
    current.membership.tenantId === profile.businessId &&
    current.membership.role === profile.role &&
    (profile.staffAccessMode === undefined ||
      mode === profile.staffAccessMode) &&
    (profile.catalogEditor === undefined ||
      catalog === profile.catalogEditor) &&
    (!current.staffAccess || current.staffAccess.status === "ACTIVE") &&
    (profile.storeId == null || profile.storeId === current.activeStore?.id) &&
    (target.origin.storeId === null ||
      (profile.storeId === target.origin.storeId &&
        current.activeStore?.status === "ACTIVE")) &&
    nativeBusinessReportScopeMatches(
      target,
      {
        actorUserId: current.actorUserId,
        tenantId: current.tenant.id,
        storeId: current.activeStore?.id ?? null,
      },
      profile.id,
    )
  )
}

function ReportRead({
  target,
  profile,
  scopeCurrent,
  onPage,
  onReload,
}: {
  target: BusinessReportTarget
  profile: Profile
  scopeCurrent: () => boolean
  onPage: (target: BusinessReportTarget) => void
  onReload: () => void
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [mount] = useState(nextReadMount)
  const mounted = useRef(true)
  const retired = useRef(false)
  const readOwner = useRef<{
    report: RouterOutputs["businessReporting"]["read"] | null
    token: object
  }>({ report: null, token: {} })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const tenantQuery = useQuery(
    mountOwnedRead(trpc.tenant.current.queryOptions(undefined, options), mount),
  )
  const tenantRead = freshShownRead(tenantQuery)
  const scopeReady =
    tenantRead.state === "ready" &&
    currentScopeMatches(target, tenantRead.data, profile)
  const reportQuery = useQuery(
    mountOwnedRead(
      trpc.businessReporting.read.queryOptions(target, {
        ...options,
        enabled: scopeReady,
      }),
      mount,
    ),
  )
  const read = freshShownRead(reportQuery)
  const report =
    scopeReady &&
    read.state === "ready" &&
    nativeBusinessReportResultMatches(target, read.data)
      ? read.data
      : null
  if (readOwner.current.report !== report)
    readOwner.current = { report, token: {} }
  const token = readOwner.current.token
  const isCurrent = () =>
    mounted.current &&
    !retired.current &&
    scopeCurrent() &&
    Boolean(report) &&
    readOwner.current.token === token
  const reload = () => {
    if (!mounted.current || retired.current || !scopeCurrent()) return
    retired.current = true
    onReload()
  }
  if (
    tenantRead.state === "checking" ||
    (scopeReady && read.state === "checking")
  )
    return (
      <Notice>Checking current access and the exact report sources…</Notice>
    )
  if (!report)
    return (
      <View className="gap-3 p-5">
        <Text accessibilityRole="alert">
          This report is unavailable for current access or its original business
          and Store. No value or zero is inferred.
        </Text>
        <ActionButton variant="outline" onPress={reload}>
          Try again
        </ActionButton>
      </View>
    )
  const changePage = (cursor?: string) => {
    if (!isCurrent()) return
    const next = nativeBusinessReportPage(target, cursor)
    if (!next || JSON.stringify(next) === JSON.stringify(target)) return
    retired.current = true
    onPage(next)
  }
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      <NativeBusinessReportContent
        report={report}
        canOpen={(original) =>
          Boolean(nativeBusinessReportOriginalRoute(original, profile))
        }
        onOpen={(original) => {
          if (
            !isCurrent() ||
            !report.complete ||
            !report.rows.some(
              (row) =>
                row.target?.kind === original.kind &&
                row.target.id === original.id,
            )
          )
            return
          const route = nativeBusinessReportOriginalRoute(original, profile)
          if (route) router.push(route)
        }}
      />
      {report.complete && pageable(target) && report.pagination ? (
        <View className="gap-3">
          <Text>
            Each detail page is an independent read. The summary covers all
            matching sources; never add pages.
          </Text>
          <ActionButton
            variant="outline"
            disabled={!hasCursor(target)}
            onPress={() => changePage()}
          >
            First page
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={!report.pagination.nextCursor}
            onPress={() => {
              const cursor = report.pagination?.nextCursor
              if (cursor) changePage(cursor)
            }}
          >
            Next page
          </ActionButton>
        </View>
      ) : null}
      <ActionButton variant="outline" onPress={reload}>
        Refresh report
      </ActionButton>
    </ScrollView>
  )
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <View className="p-5">
      <Text>{children}</Text>
    </View>
  )
}
