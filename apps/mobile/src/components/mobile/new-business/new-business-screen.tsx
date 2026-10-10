import { ActionButton } from "@/components/mobile/action-button"
import * as Classic from "@/components/mobile/appearances/classic/new-business"
import * as Market from "@/components/mobile/appearances/market-day/new-business"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Text } from "@/components/ui/text"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { useTRPC } from "@/trpc/client"
import { listBusinessProfiles } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { VariableContextProvider } from "nativewind"
import { useEffect, useRef, useState } from "react"
import { type ScrollView, View } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import {
  NewBusinessDetails,
  NewBusinessProfile,
  NewBusinessReview,
} from "./new-business-fields"
import { useNewBusiness } from "./use-new-business"

export function NewBusinessWorkflowChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="new-business" />
}

type PlanSnapshot = {
  entitlements: Array<{ key: string; isAtLimit: boolean; limit: number | null }>
  plan: { id: string; name: string; limits: { businesses: number | null } }
  plans: Array<{
    id: string
    name: string
    limits: { businesses: number | null }
  }>
}

/** The owner's plan business limit; Create becomes See plans (design 21, Limit). */
function useBusinessLimit(enabled: boolean) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, {
      enabled,
      retry: false,
    }),
  )
  const data = query.data as PlanSnapshot | undefined
  const atLimit = Boolean(
    data?.entitlements.find((item) => item.key === "businesses")?.isAtLimit,
  )
  if (!data || !atLimit) return null
  const allowed = data.plan.limits.businesses
  const next = data.plans.find(
    (plan) =>
      plan.limits.businesses === null ||
      (allowed !== null && plan.limits.businesses > allowed),
  )
  return {
    title: `${data.plan.name} includes ${allowed ?? 0} owned business${allowed === 1 ? "" : "es"}`,
    message: next
      ? `${next.name} lets you own ${next.limits.businesses ?? "unlimited"}. Your answers stay here while you check plans.`
      : "Your answers stay here while you check plans.",
  }
}

export function NewBusinessOnboardingScreen() {
  const model = useNewBusiness()
  const router = useRouter()
  // Warn from the first step, so the owner learns before filling the form.
  const limit = useBusinessLimit(!model.local && !model.isOffline)
  const market = useMobileDesign("new-business") === "market-day"
  const { BusinessHeader: Header, BusinessProfileRow: ProfileRow } = market
    ? Market
    : Classic
  const palette = useMarketDayPalette()
  const [footerHeight, setFooterHeight] = useState(88)
  const scrollHide = useBottomSearchScroll()
  const scrollRef = useRef<ScrollView>(null)
  useEffect(() => {
    if (model.error) scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [model.error])
  if (model.scopeChanged)
    return (
      <View className="p-5">
        <StatusBanner
          tone="warning"
          title="Setup context changed"
          message="Reopen business setup in the intended account. No new request was sent after the account or workspace changed."
        />
      </View>
    )
  const header = (
    <View className="gap-6 pb-6 pt-3">
      <Header step={model.step} />
      {model.error ? (
        <StatusBanner
          tone={model.status === "uncertain" ? "warning" : "destructive"}
          message={model.error}
        />
      ) : null}
      {limit ? (
        <StatusBanner
          tone="warning"
          title={limit.title}
          message={limit.message}
        />
      ) : null}
      {model.local ? (
        <StatusBanner
          title="Local preview"
          message="This session creates a device-local workspace, not a server business."
        />
      ) : model.isOffline ? (
        <StatusBanner
          tone="warning"
          title="Offline mode"
          message="Prepare your draft here. Reconnect before creating the business."
        />
      ) : null}
      <QaQuickFillButton
        canUndo={model.canUndoFill}
        formId="mobile.business.create"
        isDirty={model.dirty}
        onFill={model.fill}
        onUndo={model.undoFill}
      />
      {model.step === 1 ? (
        <Text
          className={
            market
              ? "text-sm text-market-muted-ink [-rn-line-height:21]"
              : "text-sm text-muted-foreground [-rn-line-height:21]"
          }
        >
          The type personalizes recommendations. It does not restrict what this
          business can sell.
        </Text>
      ) : null}
    </View>
  )
  return (
    <VariableContextProvider
      value={{ "--new-business-footer": footerHeight + 24 }}
    >
      <View className={market ? "flex-1 bg-market-canvas" : "flex-1"}>
        {model.step === 1 ? (
          <FlatList
            className="flex-1"
            contentContainerClassName="px-4 pb-[var(--new-business-footer)]"
            data={model.profiles}
            keyExtractor={(profile) => profile.key}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={scrollHide.onScroll}
            scrollEventThrottle={16}
            ListHeaderComponent={header}
            renderItem={({ item }) => (
              <ProfileRow
                profile={item}
                selected={model.draft.businessProfileKey === item.key}
                disabled={model.locked}
                onPress={() => model.selectProfile(item)}
              />
            )}
            ListEmptyComponent={
              <Text
                className={
                  market
                    ? "py-8 text-sm text-market-muted-ink"
                    : "py-8 text-sm text-muted-foreground"
                }
              >
                No business type matches that search. Try a broader term.
              </Text>
            }
          />
        ) : (
          <KeyboardAwareScrollView
            ref={scrollRef}
            key={model.step}
            className="flex-1"
            bottomOffset={footerHeight + 12}
            extraKeyboardSpace={0}
            disableScrollOnKeyboardHide
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <View
              pointerEvents={model.locked ? "none" : "auto"}
              className="px-4 pb-[var(--new-business-footer)]"
            >
              {header}
              {model.step === 2 ? (
                <NewBusinessProfile model={model} market={market} />
              ) : model.step === 3 ? (
                <NewBusinessDetails model={model} market={market} />
              ) : (
                <NewBusinessReview model={model} market={market} />
              )}
            </View>
          </KeyboardAwareScrollView>
        )}
        <BottomSearchFooter
          localSearch
          variant={market ? "market-day" : "default"}
          accessibilityLabel={
            model.step === 1
              ? "Search business types"
              : "Business setup actions"
          }
          alwaysShowSearch
          hidden={model.step === 1 && scrollHide.hidden}
          searchVisible={model.step === 1}
          maxLength={160}
          onHeightChange={setFooterHeight}
          onChangeText={model.setProfileQuery}
          placeholder="Search business types"
          totalCount={listBusinessProfiles().length}
          value={model.profileQuery}
        >
          {model.status === "uncertain" ? (
            <ActionButton
              onPress={model.reviewBusinesses}
              foregroundColor={market ? palette.onPalm : undefined}
              className={
                market
                  ? "bg-market-palm active:bg-market-hero-pressed"
                  : undefined
              }
            >
              Review your businesses
            </ActionButton>
          ) : model.status === "created" ? (
            <ActionButton
              onPress={model.openCreatedBusiness}
              foregroundColor={market ? palette.onPalm : undefined}
              className={
                market
                  ? "bg-market-palm active:bg-market-hero-pressed"
                  : undefined
              }
            >
              Open created business
            </ActionButton>
          ) : model.step === 4 && limit ? (
            <>
              <ActionButton
                onPress={() => router.push("/subscription-modal")}
                trailingIcon="ArrowRight"
              >
                See plans
              </ActionButton>
              <ActionButton onPress={model.goBack} variant="outline">
                Back
              </ActionButton>
            </>
          ) : model.step > 1 ? (
            <>
              <ActionButton
                disabled={
                  model.locked ||
                  (model.step === 4 && model.isOffline && !model.local)
                }
                isLoading={model.status === "saving"}
                loadingLabel="Creating business"
                onPress={model.step === 4 ? model.submit : model.continueFlow}
                trailingIcon="ArrowRight"
                foregroundColor={market ? palette.onPalm : undefined}
                disabledForegroundColor={market ? palette.mutedInk : undefined}
                className={
                  market
                    ? model.locked ||
                      (model.step === 4 && model.isOffline && !model.local)
                      ? "bg-market-line active:bg-market-line"
                      : "bg-market-palm active:bg-market-hero-pressed"
                    : undefined
                }
              >
                {model.step === 4
                  ? model.isOffline && !model.local
                    ? "Reconnect to create business"
                    : model.local
                      ? "Create local workspace"
                      : "Create and open business"
                  : "Continue"}
              </ActionButton>
              <ActionButton
                disabled={model.locked}
                onPress={model.goBack}
                variant="outline"
                foregroundColor={market ? palette.ink : undefined}
                className={
                  market
                    ? "border-market-line bg-market-field active:bg-market-line"
                    : undefined
                }
              >
                {model.step === 2 ? "Choose a different business type" : "Back"}
              </ActionButton>
            </>
          ) : null}
        </BottomSearchFooter>
      </View>
    </VariableContextProvider>
  )
}
