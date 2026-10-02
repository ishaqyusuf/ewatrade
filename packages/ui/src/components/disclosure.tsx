"use client"

import type { ReactNode } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion"

export function Disclosure({
  title,
  children,
  defaultOpen = false,
  className,
}: {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  return (
    <Accordion
      appearance="dashboard"
      defaultValue={defaultOpen ? ["content"] : []}
      className={className}
    >
      <AccordionItem value="content">
        <AccordionTrigger>{title}</AccordionTrigger>
        <AccordionContent keepMounted>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
