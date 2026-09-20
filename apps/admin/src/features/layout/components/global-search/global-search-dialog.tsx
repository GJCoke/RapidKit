import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@rapidkit/ui/components/command"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@rapidkit/ui/components/dialog"
import type { SearchRouteItem } from "./search-model"

interface GlobalSearchDialogProps {
  open: boolean
  keyword: string
  routes: SearchRouteItem[]
  onKeywordChange: (keyword: string) => void
  onOpenChange: (open: boolean) => void
  onSelectRoute: (route: SearchRouteItem) => void
  title: string
  placeholder: string
  empty: string
}

export function GlobalSearchDialog({
  open,
  keyword,
  routes,
  onKeywordChange,
  onOpenChange,
  onSelectRoute,
  title,
  placeholder,
  empty,
}: GlobalSearchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="inset-2 flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-auto max-w-none translate-x-0 translate-y-0 gap-0 p-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[min(32rem,calc(100dvh-4rem))] sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{placeholder}</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} loop className="flex-1">
          <CommandInput
            autoFocus
            value={keyword}
            onValueChange={onKeywordChange}
            placeholder={placeholder}
            aria-label={placeholder}
          />
          <CommandList className="max-h-none flex-1 sm:max-h-72 sm:flex-none">
            <CommandEmpty>{empty}</CommandEmpty>
            <CommandGroup heading={title}>
              {routes.map((route) => (
                <CommandItem key={route.routeName} value={route.routeName} onSelect={() => onSelectRoute(route)}>
                  {route.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
