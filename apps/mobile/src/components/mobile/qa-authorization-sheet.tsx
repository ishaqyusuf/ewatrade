import { KeyboardInlineComposer } from "@/components/mobile/keyboard-inline-composer"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import { isCustomerShellPath } from "@/lib/app-lock-route"
import { normalizeQaDomain } from "@ewatrade/utils/qa-accelerator"
import { useSegments } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Keyboard } from "react-native"

/**
 * QA domain entry: the input bar above the keyboard, with a send button
 * beside it. It opens only from the QA button and closes with the keyboard
 * or once QA connects.
 */
export function QaAuthorizationSheet() {
  const qa = useQaAccelerator()
  const isBusinessShell = !isCustomerShellPath(useSegments())
  const enabled = qa.clientEnabled && isBusinessShell
  const [open, setOpen] = useState(false)
  const [qaDomain, setQaDomain] = useState(
    qa.authorization?.qaDomain ?? qa.rememberedDomain ?? "",
  )
  const [domainError, setDomainError] = useState<string | null>(null)
  const lastRequest = useRef(qa.authorizationSheetRequest)
  const lastToken = useRef(qa.authorization?.token ?? null)
  const token = qa.authorization?.token ?? null

  useEffect(() => {
    if (lastRequest.current === qa.authorizationSheetRequest) return
    lastRequest.current = qa.authorizationSheetRequest
    if (enabled) {
      setDomainError(null)
      setOpen(true)
    }
  }, [enabled, qa.authorizationSheetRequest])

  useEffect(() => {
    if (token && lastToken.current !== token) {
      setOpen(false)
      Keyboard.dismiss()
    }
    lastToken.current = token
  }, [token])

  useEffect(() => {
    if (!enabled) setOpen(false)
  }, [enabled])

  useEffect(() => {
    if (!open) return
    const hide = Keyboard.addListener("keyboardDidHide", () => setOpen(false))
    return () => hide.remove()
  }, [open])

  if (!enabled) return null

  const serverProblem = qa.isLoading
    ? null
    : qa.capabilityCategory === "network_unavailable"
      ? "Can’t reach the server. Check it is running."
      : qa.capabilityCategory === "upgrade_required"
        ? "Install the latest build to use QA."
        : !qa.capabilityAvailable
          ? "QA isn’t enabled on this server."
          : null
  const retryServer =
    serverProblem !== null && qa.capabilityCategory !== "upgrade_required"

  const submit = () => {
    if (retryServer) {
      void qa.retryCapability()
      return
    }
    let normalizedDomain: string
    try {
      normalizedDomain = normalizeQaDomain(qaDomain)
    } catch {
      setDomainError("Enter a domain like name.qa.test")
      return
    }
    setDomainError(null)
    qa.authorize({ qaDomain: normalizedDomain })
  }

  return (
    <KeyboardInlineComposer
      autoCapitalize="none"
      canSubmit={retryServer || (serverProblem === null && !!qaDomain.trim())}
      closedOffset={0}
      errorText={serverProblem ?? domainError ?? qa.authorizationError}
      keyboardType="url"
      loading={qa.isLoading || qa.isAuthorizing}
      onChangeText={(value) => {
        setQaDomain(value)
        setDomainError(null)
      }}
      onPillPress={() => undefined}
      onSubmit={submit}
      pills={[]}
      placeholder="QA domain, like name.qa.test"
      submitAccessibilityLabel={
        retryServer ? "Retry server" : "Load QA businesses"
      }
      submitIconName={retryServer ? "RefreshCw" : "ArrowRight"}
      submitLabel={retryServer ? "Retry" : "Load QA businesses"}
      value={qaDomain}
      visible={open}
    />
  )
}
