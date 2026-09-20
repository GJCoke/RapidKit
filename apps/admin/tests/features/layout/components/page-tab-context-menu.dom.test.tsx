// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, test, vi } from "vitest"

import { getPageTabContextMenuState, PageTabContextMenu } from "@/features/layout/components/page-tab-context-menu"

const labels = {
  closeAllLabel: "Close all",
  closeLabel: "Close",
  closeLeftLabel: "Close left",
  closeOthersLabel: "Close others",
  closeRightLabel: "Close right",
  pinLabel: "Pin tab",
  unpinLabel: "Unpin tab",
}

function renderMenu(overrides: Partial<React.ComponentProps<typeof PageTabContextMenu>> = {}) {
  return render(
    <PageTabContextMenu
      {...labels}
      canCloseAll
      canCloseLeft
      canCloseOthers
      canCloseRight
      closable
      onClose={vi.fn()}
      onCloseAll={vi.fn()}
      onCloseLeft={vi.fn()}
      onCloseOthers={vi.fn()}
      onCloseRight={vi.fn()}
      onPin={vi.fn()}
      onUnpin={vi.fn()}
      pinned={false}
      systemFixed={false}
      {...overrides}
    >
      <div data-testid="tab">Users</div>
    </PageTabContextMenu>,
  )
}

test("opens from right click in the frontend-compatible action order", async () => {
  const onClose = vi.fn()
  const onPin = vi.fn()
  renderMenu({ onClose, onPin })

  fireEvent.contextMenu(screen.getByTestId("tab"), { clientX: 20, clientY: 20 })
  expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
    "Close",
    "Close others",
    "Close left",
    "Close right",
    "Close all",
    "Pin tab",
  ])
  expect(screen.getAllByRole("separator")).toHaveLength(1)

  fireEvent.click(screen.getByRole("menuitem", { name: "Close" }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  fireEvent.contextMenu(screen.getByTestId("tab"), { clientX: 20, clientY: 20 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "Pin tab" }))
  await waitFor(() => expect(onPin).toHaveBeenCalledOnce())
})

test("derives disabled actions and the backend-fixed unpin state through a pure function", async () => {
  expect(
    getPageTabContextMenuState({
      canCloseAll: false,
      canCloseLeft: false,
      canCloseOthers: false,
      canCloseRight: false,
      closable: false,
      systemFixed: true,
    }),
  ).toEqual({ close: true, closeAll: true, closeLeft: true, closeOthers: true, closeRight: true, pin: true })

  renderMenu({
    canCloseAll: false,
    canCloseLeft: false,
    canCloseOthers: false,
    canCloseRight: false,
    closable: false,
    pinned: false,
    systemFixed: true,
  })

  fireEvent.contextMenu(screen.getByTestId("tab"), { clientX: 20, clientY: 20 })
  for (const name of ["Close", "Close others", "Close left", "Close right", "Close all", "Unpin tab"]) {
    expect(await screen.findByRole("menuitem", { name })).toHaveAttribute("aria-disabled", "true")
  }
})

test("shows the unpin action for a user-pinned tab", async () => {
  const onUnpin = vi.fn()
  renderMenu({ onUnpin, pinned: true })

  fireEvent.contextMenu(screen.getByTestId("tab"), { clientX: 20, clientY: 20 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "Unpin tab" }))

  await waitFor(() => expect(onUnpin).toHaveBeenCalledOnce())
})
