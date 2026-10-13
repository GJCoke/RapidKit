import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "./button"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav aria-label="pagination" data-slot="pagination" className={cn("flex justify-center", className)} {...props} />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="pagination-content" className={cn("flex items-center gap-1", className)} {...props} />
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

function PaginationPrevious({ children = "Previous", ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button aria-label="Go to previous page" variant="outline" size="sm" {...props}>
      <ChevronLeftIcon />
      {children}
    </Button>
  )
}

function PaginationNext({ children = "Next", ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button aria-label="Go to next page" variant="outline" size="sm" {...props}>
      {children}
      <ChevronRightIcon />
    </Button>
  )
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-8 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
    </span>
  )
}

export { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationNext, PaginationPrevious }
