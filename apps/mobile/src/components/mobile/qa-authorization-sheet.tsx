import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Button } from "@/components/ui/button"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import { isCustomerShellPath } from "@/lib/app-lock-route"
import { getAppVariant } from "@/lib/app-variant"
import { shouldSuggestQaAuthorization } from "@/lib/qa-authorization-state"
import { useSegments } from "expo-router"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { FormField } from "./form-field"
import { StatusBanner } from "./status-banner"

export function QaAuthorizationSheet() {
  const qa = useQaAccelerator()
  const largeTextLayout = useLargeTextLayout()
  const segments = useSegments()
  const modal = useModal()
  const [qaDomain, setQaDomain] = useState(qa.authorization?.qaDomain ?? "")
  const [credential, setCredential] = useState("")
  const appVariant = getAppVariant()
  const modeLabel =
    appVariant === "preview"
      ? "Preview"
      : appVariant === "local"
        ? "Local"
        : "Development"
  const modeNoun = `${modeLabel.toLowerCase()} server`
  const isInternalDesignRoute = segments[0] === "design-system"
  const isBusinessShell =
    !isCustomerShellPath(segments) && !isInternalDesignRoute
  const shouldSuggest = shouldSuggestQaAuthorization({
    authorizationPresent: Boolean(qa.authorization),
    clientEnabled: qa.clientEnabled,
    isBusinessShell,
  })
  const hasPresentedSuggestion = useRef(false)
  const lastAuthorizationToken = useRef(qa.authorization?.token ?? null)
  const lastSheetRequest = useRef(qa.authorizationSheetRequest)

  useLayoutEffect(() => {
    if (!qa.clientEnabled || !isBusinessShell) {
      modal.dismiss()
      return
    }

    const authorizationToken = qa.authorization?.token ?? null
    if (authorizationToken) {
      hasPresentedSuggestion.current = false
      if (lastAuthorizationToken.current !== authorizationToken) {
        modal.dismiss()
      }
      lastAuthorizationToken.current = authorizationToken
      return
    }

    lastAuthorizationToken.current = null
    if (shouldSuggest && !hasPresentedSuggestion.current) {
      hasPresentedSuggestion.current = true
      modal.present()
    }
  }, [
    isBusinessShell,
    modal.dismiss,
    modal.present,
    qa.authorization?.token,
    qa.clientEnabled,
    shouldSuggest,
  ])

  useLayoutEffect(() => {
    if (lastSheetRequest.current === qa.authorizationSheetRequest) return
    lastSheetRequest.current = qa.authorizationSheetRequest
    if (qa.clientEnabled && isBusinessShell) modal.present()
  }, [
    isBusinessShell,
    modal.present,
    qa.authorizationSheetRequest,
    qa.clientEnabled,
  ])

  const submit = useCallback(() => {
    const normalizedDomain = qaDomain.trim().toLowerCase()
    if (!normalizedDomain || !credential.trim()) return
    qa.authorize({ credential: credential.trim(), qaDomain: normalizedDomain })
    setCredential("")
  }, [credential, qa, qaDomain])

  if (!qa.clientEnabled || !isBusinessShell) return null

  return (
    <Modal
      accessibilityLabel="Connect QA workspace"
      enableDismissOnClose
      enableDynamicSizing
      enablePanDownToClose
      hideHeader
      keyboardBehavior="extend"
      maxDynamicContentSize={620}
      ref={modal.ref}
      snapPoints={["68%"]}
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={120}
        contentContainerStyle={{ paddingBottom: 24 }}
        extraKeyboardSpace={140}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-5">
          {largeTextLayout ? (
            <View className="gap-3">
              <View className="flex-row items-center justify-between gap-3">
                <QaMark />
                <ModeBadge label={modeLabel} />
              </View>
              <View className="gap-1">
                <Text className="text-xl font-extrabold tracking-tight text-foreground">
                  Connect QA workspace
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  Use the domain that receives your QA email.
                </Text>
              </View>
            </View>
          ) : (
            <View className="flex-row items-start gap-3">
              <QaMark />
              <View className="min-w-0 flex-1 gap-1">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-xl font-extrabold tracking-tight text-foreground">
                    Connect QA workspace
                  </Text>
                  <ModeBadge label={modeLabel} />
                </View>
                <Text className="text-sm leading-5 text-muted-foreground">
                  Use the domain that receives your QA email.
                </Text>
              </View>
            </View>
          )}

          {qa.isLoading ? (
            <StatusBanner
              icon="RefreshCw"
              message={`Checking this ${modeLabel.toLowerCase()} build and any saved QA authorization.`}
              title="Preparing QA access"
              tone="info"
            />
          ) : qa.capabilityCategory === "network_unavailable" ? (
            <View className="gap-3">
              <StatusBanner
                icon="WifiOff"
                message={`Reconnect to the ${modeNoun}, then retry when you want to use QA tools.`}
                title={`${modeLabel} server unavailable`}
                tone="warning"
              />
              <Button
                accessibilityLabel={`Retry QA ${modeLabel.toLowerCase()} connection`}
                className="h-12 rounded-2xl"
                onPress={() => void qa.retryCapability()}
              >
                <Text>Retry connection</Text>
              </Button>
            </View>
          ) : qa.capabilityCategory === "upgrade_required" ? (
            <StatusBanner
              icon="RefreshCw"
              message={`Install the latest ${modeLabel.toLowerCase()} build, then reopen the app.`}
              title={`${modeLabel} update required`}
              tone="warning"
            />
          ) : !qa.capabilityAvailable ? (
            <View className="gap-3">
              <StatusBanner
                icon="TriangleAlert"
                message="This preview server has not enabled the QA accelerator. Update its QA configuration, then retry."
                title="QA access is not configured"
                tone="warning"
              />
              <Button
                accessibilityLabel="Retry QA capability check"
                className="h-12 rounded-2xl"
                onPress={() => void qa.retryCapability()}
              >
                <Text>Retry configuration</Text>
              </Button>
            </View>
          ) : (
            <>
              {qa.authorizationError ? (
                <StatusBanner
                  icon="TriangleAlert"
                  message={qa.authorizationError}
                  title="QA access needs attention"
                  tone="destructive"
                />
              ) : null}
              <View className="gap-4">
                <FormField
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  label="QA domain"
                  leadingIcon="Globe"
                  onChangeText={setQaDomain}
                  placeholder="ishack.qa.test"
                  value={qaDomain}
                />
                <FormField
                  autoCapitalize="none"
                  autoCorrect={false}
                  label="Tester credential"
                  leadingIcon="Lock"
                  onChangeText={setCredential}
                  placeholder="Enter tester credential"
                  secureTextEntry
                  value={credential}
                />
              </View>
              <View className="flex-row items-start gap-2 rounded-2xl bg-muted/70 px-3.5 py-3">
                <Text className="text-xs text-muted-foreground">◆</Text>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-xs font-bold text-foreground">
                    Protected access.
                  </Text>
                  <Text className="text-xs leading-5 text-muted-foreground">
                    The domain is only a scope; the credential authorizes it.
                  </Text>
                </View>
              </View>
              <Button
                accessibilityLabel="Load QA businesses"
                className="h-12 rounded-2xl"
                disabled={
                  !qaDomain.trim() || !credential.trim() || qa.isAuthorizing
                }
                onPress={submit}
              >
                <Text>
                  {qa.isAuthorizing
                    ? "Authorizing QA workspace…"
                    : "Load QA businesses"}
                </Text>
              </Button>
            </>
          )}
          <Button
            accessibilityHint="Closes QA setup and keeps normal login and registration available"
            accessibilityLabel="Continue without QA"
            className="h-12 rounded-2xl"
            onPress={modal.dismiss}
            variant="outline"
          >
            <Text>Continue without QA</Text>
          </Button>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  )
}

function QaMark() {
  return (
    <View className="size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
      <Text className="text-lg font-black text-primary">QA</Text>
    </View>
  )
}

function ModeBadge({ label }: { label: string }) {
  return (
    <View className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1">
      <Text className="text-[10px] font-black uppercase tracking-[1.2px] text-primary">
        {label}
      </Text>
    </View>
  )
}
