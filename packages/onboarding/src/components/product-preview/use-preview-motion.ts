"use client"
import { useEffect, useRef, useState } from "react"
export function usePreviewMotion() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [staticMode, setStaticMode] = useState(true)
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const connection = (
      navigator as Navigator & {
        connection?: {
          saveData?: boolean
          addEventListener?: (event: string, listener: () => void) => void
          removeEventListener?: (event: string, listener: () => void) => void
        }
      }
    ).connection
    const update = () =>
      setStaticMode(media.matches || Boolean(connection?.saveData))
    update()
    media.addEventListener("change", update)
    connection?.addEventListener?.("change", update)
    let intersects = false
    const sync = () => setVisible(intersects && !document.hidden)
    const observer = new IntersectionObserver((entries) => {
      intersects = entries.some((e) => e.isIntersecting)
      sync()
    })
    if (ref.current) observer.observe(ref.current)
    document.addEventListener("visibilitychange", sync)
    return () => {
      observer.disconnect()
      media.removeEventListener("change", update)
      connection?.removeEventListener?.("change", update)
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])
  return { ref, visible, staticMode }
}
