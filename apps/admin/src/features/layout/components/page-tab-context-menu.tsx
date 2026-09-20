import type { ReactElement } from "react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@rapidkit/ui/components/context-menu"

interface PageTabContextMenuAvailability {
  closable: boolean
  canCloseAll: boolean
  canCloseLeft: boolean
  canCloseOthers: boolean
  canCloseRight: boolean
  systemFixed: boolean
}

interface PageTabContextMenuProps extends PageTabContextMenuAvailability {
  children: ReactElement
  closeAllLabel: string
  closeLabel: string
  closeLeftLabel: string
  closeOthersLabel: string
  closeRightLabel: string
  pinLabel: string
  unpinLabel: string
  onClose: () => void
  onCloseAll: () => void
  onCloseLeft: () => void
  onCloseOthers: () => void
  onCloseRight: () => void
  onPin: () => void
  onUnpin: () => void
  pinned: boolean
}

export function getPageTabContextMenuState({
  canCloseAll,
  canCloseLeft,
  canCloseOthers,
  canCloseRight,
  closable,
  systemFixed,
}: PageTabContextMenuAvailability) {
  return {
    close: !closable,
    closeAll: !canCloseAll,
    closeLeft: !canCloseLeft,
    closeOthers: !canCloseOthers,
    closeRight: !canCloseRight,
    pin: systemFixed,
  }
}

export function PageTabContextMenu({
  children,
  closeAllLabel,
  closeLabel,
  closeLeftLabel,
  closeOthersLabel,
  closeRightLabel,
  pinLabel,
  unpinLabel,
  onClose,
  onCloseAll,
  onCloseLeft,
  onCloseOthers,
  onCloseRight,
  onPin,
  onUnpin,
  pinned,
  ...availability
}: PageTabContextMenuProps) {
  const state = getPageTabContextMenuState(availability)
  const fixed = pinned || availability.systemFixed

  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-40" finalFocus={false}>
        <ContextMenuGroup>
          <ContextMenuItem disabled={state.close} onClick={onClose}>
            {closeLabel}
          </ContextMenuItem>
          <ContextMenuItem disabled={state.closeOthers} onClick={onCloseOthers}>
            {closeOthersLabel}
          </ContextMenuItem>
          <ContextMenuItem disabled={state.closeLeft} onClick={onCloseLeft}>
            {closeLeftLabel}
          </ContextMenuItem>
          <ContextMenuItem disabled={state.closeRight} onClick={onCloseRight}>
            {closeRightLabel}
          </ContextMenuItem>
          <ContextMenuItem disabled={state.closeAll} onClick={onCloseAll}>
            {closeAllLabel}
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem disabled={state.pin} onClick={fixed ? onUnpin : onPin}>
            {fixed ? unpinLabel : pinLabel}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
