import type { ReactNode } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "@rapidkit/ui"

export function FormField({
  label,
  htmlFor,
  required,
  description,
  error,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  description?: string
  error?: string
  children: ReactNode
}) {
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={htmlFor}>
        {label}
        {required && (
          <span aria-hidden className="text-destructive">
            *
          </span>
        )}
      </FieldLabel>
      {children}
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  )
}
