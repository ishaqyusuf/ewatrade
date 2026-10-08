"use client"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import {
  PlatformProvider,
  PlatformSwitch,
  usePlatform,
} from "../product-preview/platform"
import { ProductPreview } from "../product-preview/product-preview"
import "../product-preview/product-preview.css"
const PreviewContext = createContext<{
  update: (name?: string, city?: string) => void
}>({ update: () => {} })
export function SignupPreviewSync({
  name,
  city,
}: { name?: string; city?: string }) {
  const { update } = useContext(PreviewContext)
  useEffect(() => {
    update(name, city)
  }, [name, city, update])
  return null
}
function Presentation({ children }: { children: ReactNode }) {
  const [name, setName] = useState("")
  const [city, setCity] = useState("")
  const [offline, setOffline] = useState(false)
  const { platform } = usePlatform()
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    addEventListener("online", update)
    addEventListener("offline", update)
    return () => {
      removeEventListener("online", update)
      removeEventListener("offline", update)
    }
  }, [])
  const update = useCallback((name?: string, city?: string) => {
    if (name) setName(name)
    if (city) setCity(city)
  }, [])
  const businessName = name.trim() || "Your business"
  const initials = name.trim()
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()
    : "?"
  return (
    <PreviewContext.Provider value={{ update }}>
      <div
        className="signup-presentation"
        onInputCapture={(event) => {
          const field = event.target
          if (!(field instanceof HTMLInputElement)) return
          if (field.name === "businessName") setName(field.value)
          if (field.name === "city") setCity(field.value)
        }}
      >
        <div className="signup-live-strip">
          <span>{initials}</span>
          <div>
            <small>Your store</small>
            <b>{businessName}</b>
          </div>
          <span className="signup-live-status">Taking shape</span>
        </div>
        {offline && (
          <output className="signup-offline">
            You’re offline. Your typed details are still here. Reconnect to
            continue.
          </output>
        )}
        {children}
        <aside
          className="signup-preview launch-v4"
          data-platform={platform}
          aria-label="Your store preview"
        >
          <img
            className="signup-preview-mark"
            src="/brand/ewatrade-mark-precision-rise-v1-reverse.svg"
            alt=""
          />
          <PlatformSwitch />
          <p className="signup-preview-label">Your store, as you build it</p>
          <div
            className={
              platform === "web" ? "signup-web-preview" : "signup-phone-preview"
            }
          >
            <ProductPreview
              platform={platform}
              view="overview"
              state={{
                business: {
                  name: businessName,
                  city: city || "Your city",
                  initials,
                  owner: "there",
                },
              }}
              label={`Preview of ${businessName}; illustrative figures`}
            />
          </div>
          <p className="signup-preview-caption">
            {platform === "web"
              ? "Your web dashboard. Ready when you are."
              : "Mobile app · coming soon."}
            <br />
            Illustrative figures. Your business starts fresh.
          </p>
        </aside>
      </div>
    </PreviewContext.Provider>
  )
}
export function SignupPresentation({ children }: { children: ReactNode }) {
  return (
    <PlatformProvider>
      <Presentation>{children}</Presentation>
    </PlatformProvider>
  )
}
