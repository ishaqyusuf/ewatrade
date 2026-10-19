import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import {
  type ServiceRequestPageTarget,
  type ServiceRequestTarget,
  serviceRequestReadTargetSchema,
} from "@ewatrade/assistant/general/service-request-read"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useFocusEffect, useRouter } from "expo-router"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { NativeServiceRequestContent } from "./native-service-request-content"
import { NativeServiceRequestPageContent } from "./native-service-request-page-content"
import {
  type NativeServiceRequestScope,
  nativeServiceRequestOriginal,
  nativeServiceRequestPage,
  nativeServiceRequestScope,
} from "./native-service-request-state"

const options = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}

/** Fresh protected source views; saved origin never changes the active workspace. */
export function NativeServiceRequestScreen({ target }: { target: unknown }) {
  const { profile } = useAuthContext()
  const parsed = serviceRequestReadTargetSchema.safeParse(target)
  const scope = parsed.success
    ? nativeServiceRequestScope(profile, parsed.data.origin)
    : null
  const owner =
    scope && parsed.success ? JSON.stringify([scope.key, parsed.data]) : null
  const live = useRef(owner)
  live.current = owner
  const mounted = useRef(true)
  const focus = useRef(true)
  const focusLifetime = useRef(0)
  const renderedFocusLifetime = focusLifetime.current
  const [focused, setFocused] = useState(true)
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useFocusEffect(
    useCallback(() => {
      if (!mounted.current) return
      if (!focus.current) setGeneration((value) => value + 1)
      focus.current = true
      setFocused(true)
      return () => {
        // Retire this rendered lifetime synchronously. Reentry can happen
        // before React commits the new generation; it must not revive any
        // callback retained from the earlier focus, even for the same target.
        focusLifetime.current += 1
        focus.current = false
        if (mounted.current) setFocused(false)
      }
    }, []),
  )
  const current = () =>
    mounted.current &&
    focus.current &&
    focusLifetime.current === renderedFocusLifetime &&
    owner !== null &&
    live.current === owner
  if (!parsed.success)
    return (
      <Notice>
        This Service Request link is invalid. Return to the saved answer.
      </Notice>
    )
  if (!scope)
    return (
      <Notice>
        Current Owner, Admin or legacy Manager access to this original business
        and Store is required. Return to the assistant and choose the original
        workspace.
      </Notice>
    )
  if (!focused && parsed.data.kind !== "service_request_page")
    return (
      <Notice>Checking current Service Request access when you return…</Notice>
    )
  const key = JSON.stringify([owner, generation])
  return parsed.data.kind === "service_request_page" ? (
    <PageOwner
      key={owner}
      scope={scope}
      target={parsed.data}
      current={current}
      active={focused}
      focusGeneration={generation}
    />
  ) : (
    <OriginalRead
      key={key}
      scope={scope}
      target={parsed.data}
      current={current}
      reload={() => {
        if (current()) setGeneration((value) => value + 1)
      }}
    />
  )
}

function PageOwner({
  scope,
  target,
  current,
  active,
  focusGeneration,
}: {
  scope: NativeServiceRequestScope
  target: ServiceRequestPageTarget
  current: () => boolean
  active: boolean
  focusGeneration: number
}) {
  const [view, setView] = useState({ filters: target.filters, generation: 0 })
  if (!active)
    return (
      <Notice>Checking current Service Request access when you return…</Notice>
    )
  return (
    <PageRead
      key={JSON.stringify([view, focusGeneration])}
      scope={scope}
      target={{ ...target, filters: view.filters }}
      current={current}
      replace={(filters) => {
        if (current())
          setView((value) => ({ filters, generation: value.generation + 1 }))
      }}
    />
  )
}

function PageRead({
  scope,
  target,
  current,
  replace,
}: {
  scope: NativeServiceRequestScope
  target: ServiceRequestPageTarget
  current: () => boolean
  replace: (filters: ServiceRequestPageTarget["filters"]) => void
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
  const query = useQuery(
    mountOwnedRead(
      trpc.serviceAssistantRequests.listPage.queryOptions(
        target.filters,
        options,
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const page =
    read.state === "ready"
      ? nativeServiceRequestPage(read.data, scope, target)
      : null
  const shown = useRef<{
    page: typeof page
    phase: typeof read.state
    token: object
  }>({
    page: null,
    phase: read.state,
    token: {},
  })
  if (shown.current.page !== page || shown.current.phase !== read.state)
    shown.current = { page, phase: read.state, token: {} }
  const token = shown.current.token
  const owns = () =>
    mounted.current &&
    !retired.current &&
    current() &&
    Boolean(page) &&
    shown.current.token === token
  const changePage = (filters: ServiceRequestPageTarget["filters"]) => {
    if (
      !mounted.current ||
      retired.current ||
      !current() ||
      shown.current.token !== token
    )
      return
    retired.current = true
    replace(filters)
  }
  if (read.state === "checking")
    return (
      <Notice>
        {query.isPaused
          ? "Connect to check current request access."
          : "Checking current access and the saved request filters…"}
      </Notice>
    )
  if (!page)
    return (
      <Unavailable
        retry={() => changePage(target.filters)}
        restart={
          target.filters.cursor
            ? () => {
                const { cursor: _cursor, ...filters } = target.filters
                changePage(filters)
              }
            : undefined
        }
      />
    )
  const filterLabels = [
    ...(target.filters.status
      ? [target.filters.status.replaceAll("_", " ")]
      : ["All statuses"]),
    ...(target.filters.query ? [`Customer name: ${target.filters.query}`] : []),
    `${target.filters.limit} per page`,
  ]
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      <NativeServiceRequestPageContent
        page={page}
        filterLabels={filterLabels}
        onOpen={(requestId) => {
          if (!owns()) return
          const row = page.items.find((item) => item.id === requestId)
          if (!row) return
          router.push({
            pathname: "/service-jobs-modal",
            params: { target: JSON.stringify(row.originalTarget) },
          })
        }}
        onNext={
          page.nextCursor
            ? () => {
                if (owns() && page.nextCursor)
                  changePage({ ...target.filters, cursor: page.nextCursor })
              }
            : undefined
        }
        onRestart={
          target.filters.cursor
            ? () => {
                if (!owns()) return
                const { cursor: _cursor, ...filters } = target.filters
                changePage(filters)
              }
            : undefined
        }
      />
      <ActionButton
        variant="outline"
        onPress={() => {
          if (owns()) changePage(target.filters)
        }}
      >
        Refresh requests
      </ActionButton>
    </ScrollView>
  )
}

function OriginalRead({
  scope,
  target,
  current,
  reload,
}: {
  scope: NativeServiceRequestScope
  target: ServiceRequestTarget
  current: () => boolean
  reload: () => void
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const mounted = useRef(true)
  const retired = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const query = useQuery(
    mountOwnedRead(
      trpc.serviceAssistantRequests.original.queryOptions(
        { requestId: target.requestId },
        options,
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const record =
    read.state === "ready"
      ? nativeServiceRequestOriginal(read.data, scope, target.requestId)
      : null
  const shown = useRef<{
    record: typeof record
    phase: typeof read.state
    token: object
  }>({
    record: null,
    phase: read.state,
    token: {},
  })
  if (shown.current.record !== record || shown.current.phase !== read.state)
    shown.current = { record, phase: read.state, token: {} }
  const token = shown.current.token
  const retry = () => {
    if (
      !mounted.current ||
      retired.current ||
      !current() ||
      shown.current.token !== token
    )
      return
    retired.current = true
    reload()
  }
  if (read.state === "checking")
    return (
      <Notice>
        {query.isPaused
          ? "Connect to check current request access."
          : "Checking current access to the exact saved Service Request…"}
      </Notice>
    )
  if (!record) return <Unavailable retry={retry} />
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      <NativeServiceRequestContent record={record} />
      <ActionButton variant="outline" onPress={retry}>
        Refresh original
      </ActionButton>
    </ScrollView>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <View className="p-5">
      <Text accessibilityRole="alert">{children}</Text>
    </View>
  )
}
function Unavailable({
  retry,
  restart,
}: { retry: () => void; restart?: () => void }) {
  return (
    <View className="gap-3 p-5">
      <Text accessibilityRole="alert">
        This exact request view is unavailable for current access or its saved
        filters. No empty result, zero total or different source is inferred.
      </Text>
      <ActionButton variant="outline" onPress={retry}>
        Try again
      </ActionButton>
      {restart ? (
        <ActionButton variant="outline" onPress={restart}>
          Back to first page
        </ActionButton>
      ) : null}
    </View>
  )
}
