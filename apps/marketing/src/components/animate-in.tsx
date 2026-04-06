"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/utils"

type AnimateInProps = {
  children: React.ReactNode
  className?: string
  /** Delay in milliseconds before the transition starts once visible */
  delay?: number
  /** Starting translation direction */
  from?: "bottom" | "left" | "right" | "top"
}

/**
 * Wraps children in a div that fades + slides in once the element
 * enters the viewport. Uses IntersectionObserver — fires once, then
 * disconnects so the element stays visible.
 */
export function AnimateIn({
  children,
  className,
  delay = 0,
  from = "bottom"
}: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -48px 0px" }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const hiddenTranslate = {
    bottom: "translate-y-8",
    top: "-translate-y-8",
    left: "-translate-x-8",
    right: "translate-x-8"
  }[from]

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] ease-out",
        visible ? "opacity-100 translate-y-0 translate-x-0" : `opacity-0 ${hiddenTranslate}`,
        className
      )}
      style={{
        transitionDuration: "640ms",
        transitionDelay: visible ? `${delay}ms` : "0ms"
      }}
    >
      {children}
    </div>
  )
}
