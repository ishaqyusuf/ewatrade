import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import * as Classic from "@/components/mobile/appearances/classic/new-business"
import * as Market from "@/components/mobile/appearances/market-day/new-business"
import { Text } from "@/components/ui/text"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { listBusinessProfiles } from "@ewatrade/utils"
import { VariableContextProvider } from "nativewind"
import { useEffect, useRef, useState } from "react"
import { View, type ScrollView } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import {
  NewBusinessDetails,
  NewBusinessProfile,
  NewBusinessReview,
} from "./new-business-fields"
import { useNewBusiness } from "./use-new-business"

export function NewBusinessWorkflowChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="new-business" />
}

export function NewBusinessOnboardingScreen() {
  const model = useNewBusiness()
  const market = useMobileDesign("new-business") === "market-day"
  const { BusinessHeader: Header, BusinessProfileRow: ProfileRow } = market
    ? Market
    : Classic
  const palette = useMarketDayPalette()
  const [footerHeight, setFooterHeight] = useState(88)
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
