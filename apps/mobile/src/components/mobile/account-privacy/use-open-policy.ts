import { type PublicLegalPath, publicLegalUrl } from "@/lib/public-legal-url"
import { useState } from "react"
import { Linking } from "react-native"

/** Opens a public legal page in the browser and remembers why it failed. */
export function useOpenPolicy() {
  const [linkError, setLinkError] = useState<string | null>(null)
  const openPolicy = async (path: PublicLegalPath) => {
    const url = publicLegalUrl(path)
    if (!url) {
      setLinkError("Policy pages are not available in this build.")
      return
    }
    try {
      await Linking.openURL(url)
      setLinkError(null)
    } catch {
      setLinkError("The page could not open. Try again when you are online.")
    }
  }
  return {
    hasLegalPages: Boolean(publicLegalUrl("terms")),
    linkError,
    openPolicy,
  }
}
