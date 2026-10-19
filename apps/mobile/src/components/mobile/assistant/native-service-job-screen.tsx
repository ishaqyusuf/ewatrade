import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { ActionButton } from "../action-button"
import { ServiceJobsContent } from "../service-jobs/service-jobs-screen"
import {
  nativeServiceJobContext,
  nativeServiceJobId,
  nativeServiceJobMatches,
} from "./native-service-job-state"
import {
  type NativeServiceWorkScope,
  nativeServiceWorkScope,
} from "./native-service-work-values"

type Props = { jobId: string; onBack: () => void }
const options = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}

/** Current native management, reached only after the protected nonclinical proof. */
export function NativeServiceJobScreen({ jobId: raw, onBack }: Props) {
  const { profile } = useAuthContext()
  const parsed = nativeServiceJobId.safeParse(raw)
  const key = JSON.stringify([
    profile?.id,
    profile?.businessId,
    profile?.storeId,
    profile?.role,
    profile?.staffAccessMode,
    profile?.catalogEditor,
    profile?.status,
    parsed.success ? parsed.data : null,
  ])
  const current = useRef(key)
  const mounted = useRef(true)
  current.current = key
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  if (!parsed.success) return <Unavailable onBack={onBack} />
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
    return <Unavailable onBack={onBack} />
  const scope: NativeServiceWorkScope = {
    tenantId: profile.businessId,
    storeId: profile.storeId,
    actorUserId: profile.id,
    role: profile.role,
    accessMode: profile.staffAccessMode,
  }
  return (
    <CurrentJob
      key={key}
      jobId={parsed.data}
      onBack={onBack}
      scope={scope}
      scopeCurrent={() => mounted.current && current.current === key}
    />
  )
}
function CurrentJob({
  jobId,
  onBack,
  scope,
  scopeCurrent,
}: Props & { scope: NativeServiceWorkScope; scopeCurrent: () => boolean }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)
  const refreshOwner = useRef<object | null>(null)
  const allowed = useRef(false)
  const tenantQuery = useQuery(
    mountOwnedRead(trpc.tenant.current.queryOptions(undefined, options), mount),
  )
  const tenantRead = freshShownRead(tenantQuery)
  let tenantReady = false
  if (tenantRead.state === "ready") {
    try {
      nativeServiceWorkScope(tenantRead.data, scope)
      tenantReady = true
    } catch {}
  }
  const proofQuery = useQuery(
    mountOwnedRead(
      trpc.serviceAssistantWork.editorContext.queryOptions(
        { jobId },
        { ...options, enabled: tenantReady },
      ),
      mount,
    ),
  )
  const proofRead = freshShownRead(proofQuery)
  let proof: ReturnType<typeof nativeServiceJobContext> | null = null
  if (tenantReady && proofRead.state === "ready") {
    try {
      proof = nativeServiceJobContext(proofRead.data, scope, jobId)
    } catch {}
  }
  const jobQuery = useQuery(
    mountOwnedRead(
      trpc.services.getJob.queryOptions(
        { jobId },
        { ...options, enabled: Boolean(proof) },
      ),
      mount,
    ),
  )
  const jobRead = freshShownRead(jobQuery)
  const job =
    !refreshing &&
    proof &&
    jobRead.state === "ready" &&
    nativeServiceJobMatches(jobRead.data, proof, jobId)
      ? jobRead.data
      : null
  // Preserve the command/uncertain-attempt owner for this exact keyed lifetime.
  // A retained identity is never permission to show its old facts or act.
  const retainedJob = useRef<typeof job>(null)
  if (job) retainedJob.current = job
  allowed.current = Boolean(job) && scopeCurrent()
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      refreshOwner.current = null
    }
  }, [])
  const [isCurrent] = useState(
    () => () => mounted.current && scopeCurrent() && allowed.current,
  )
  async function refresh() {
    if (!mounted.current || !scopeCurrent() || refreshOwner.current) return
    const owner = {}
    refreshOwner.current = owner
    allowed.current = false
    setRefreshing(true)
    const owns = () =>
      mounted.current && scopeCurrent() && refreshOwner.current === owner
    try {
      const tenant = await tenantQuery.refetch()
      if (!owns()) return
      if (!tenant.isSuccess) throw Error("Current workspace unavailable")
      nativeServiceWorkScope(tenant.data, scope)
      const context = await proofQuery.refetch()
      if (!owns()) return
      if (!context.isSuccess) throw Error("Service work proof unavailable")
      const freshProof = nativeServiceJobContext(context.data, scope, jobId)
      const currentJob = await jobQuery.refetch()
      if (!owns()) return
      if (
        !currentJob.isSuccess ||
        !nativeServiceJobMatches(currentJob.data, freshProof, jobId)
      )
        throw Error("Exact saved Job unavailable")
    } finally {
      if (owns()) {
        refreshOwner.current = null
        setRefreshing(false)
      }
    }
  }
  const checking =
    refreshing ||
    tenantRead.state === "checking" ||
    (tenantReady && proofRead.state === "checking") ||
    (proof && jobRead.state === "checking")
  if (retainedJob.current)
    return (
      <ServiceJobsContent
        focusedJob={{
          job: retainedJob.current,
          isCurrent,
          refresh,
          onBack,
          checking: Boolean(checking),
        }}
      />
    )
  if (checking)
    return (
      <View className="gap-3 p-5">
        <Text>Checking current access to this exact saved Service Job…</Text>
        <ActionButton variant="outline" onPress={onBack}>
          Back to the assistant
        </ActionButton>
      </View>
    )
  return (
    <Unavailable
      onBack={onBack}
      retry={() => {
        void refresh().catch(() => {})
      }}
    />
  )
}
function Unavailable({
  onBack,
  retry,
}: { onBack: () => void; retry?: () => void }) {
  return (
    <View className="gap-3 p-5">
      <Text accessibilityRole="alert">
        This exact saved Service Job is unavailable for the current business,
        Store or service-management access. No queue or cached Job substitutes
        for it.
      </Text>
      {retry ? (
        <ActionButton variant="outline" onPress={retry}>
          Retry exact Job
        </ActionButton>
      ) : null}
      <ActionButton variant="outline" onPress={onBack}>
        Back to the assistant
      </ActionButton>
    </View>
  )
}
