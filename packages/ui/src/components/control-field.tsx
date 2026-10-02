"use client"

import { type ReactElement, type ReactNode, cloneElement, useId } from "react"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "./field"

export function ControlField({
  label,
  description,
  error,
  afterControl,
  children,
  className,
}: {
  label: ReactNode
  description?: ReactNode
  error?: string
  afterControl?: ReactNode
  className?: string
  children: ReactElement<{
    id?: string
    "aria-invalid"?: boolean
    "aria-describedby"?: string
    disabled?: boolean
  }>
}) {
  const generatedId = useId()
  const id = children.props.id ?? generatedId
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`
  return (
    <Field
      className={className}
      data-invalid={Boolean(error || children.props["aria-invalid"])}
      data-disabled={Boolean(children.props.disabled)}
    >
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {cloneElement(children, {
        id,
        "aria-invalid": Boolean(error) || children.props["aria-invalid"],
        "aria-describedby":
          [
            children.props["aria-describedby"],
            description ? descriptionId : null,
            error ? errorId : null,
          ]
            .filter(Boolean)
            .join(" ") || undefined,
      })}
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      {afterControl}
    </Field>
  )
}

export function CheckboxField({
  label,
  description,
  error,
  children,
  className,
}: {
  label: ReactNode
  description?: ReactNode
  error?: string
  className?: string
  children: ReactElement<{
    id?: string
    disabled?: boolean
    "aria-invalid"?: boolean
    "aria-describedby"?: string
  }>
}) {
  const generatedId = useId()
  const id = children.props.id ?? generatedId
  return (
    <Field
      orientation="horizontal"
      className={className}
      data-invalid={Boolean(error || children.props["aria-invalid"])}
      data-disabled={Boolean(children.props.disabled)}
    >
      {cloneElement(children, {
        id,
        "aria-invalid": Boolean(error) || children.props["aria-invalid"],
        "aria-describedby":
          [
            children.props["aria-describedby"],
            description ? `${id}-description` : null,
            error ? `${id}-error` : null,
          ]
            .filter(Boolean)
            .join(" ") || undefined,
      })}
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? (
          <FieldDescription id={`${id}-description`}>
            {description}
          </FieldDescription>
        ) : null}
        {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      </FieldContent>
    </Field>
  )
}
