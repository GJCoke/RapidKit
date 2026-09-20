import * as React from "react"
import { cn } from "../lib/utils"
import { Label } from "./label"

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("grid gap-4", className)} {...props} />
}

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field" className={cn("group/field grid gap-1.5", className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn("gap-1", className)} {...props} />
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("text-xs text-muted-foreground", className)} {...props} />
}

function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  if (!children) return null
  return <p data-slot="field-error" role="alert" className={cn("text-xs text-destructive", className)} {...props}>{children}</p>
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel }
