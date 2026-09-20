import { DndContext, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { ColumnPinningState, VisibilityState } from "@tanstack/react-table"
import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from "@rapidkit/ui"
import { GripVerticalIcon, PinIcon, RotateCcwIcon, Settings2Icon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cycleColumnPinning, moveColumn } from "./table-state"

export interface TableColumnSettingItem {
  id: string
  title: string
  hideable?: boolean
  pinnable?: boolean
}
interface Props {
  columns: TableColumnSettingItem[]
  visibility: VisibilityState
  order: string[]
  pinning: ColumnPinningState
  onVisibilityChange: (state: VisibilityState) => void
  onOrderChange: (order: string[]) => void
  onPinningChange: (state: ColumnPinningState) => void
}

function SortableColumn({
  column,
  visible,
  pinned,
  onVisible,
  onPin,
}: {
  column: TableColumnSettingItem
  visible: boolean
  pinned: false | "left" | "right"
  onVisible: (value: boolean) => void
  onPin: () => void
}) {
  const { t } = useTranslation()
  const sortable = useSortable({ id: column.id })
  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent"
    >
      <button
        type="button"
        aria-label={t("datatable.dragColumn", { title: column.title })}
        className="cursor-grab text-muted-foreground"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <Checkbox
        aria-label={column.title}
        checked={visible}
        disabled={column.hideable === false}
        onCheckedChange={(checked) => onVisible(checked === true)}
      />
      <span className="flex-1 text-sm">{column.title}</span>
      {column.pinnable && (
        <Button
          type="button"
          aria-label={t("datatable.pinColumn", { title: column.title })}
          variant="ghost"
          size="icon-sm"
          onClick={onPin}
        >
          <PinIcon />
        </Button>
      )}
      {pinned && (
        <span className="w-4 text-xs text-muted-foreground">
          {pinned === "left" ? t("datatable.pinnedLeft") : t("datatable.pinnedRight")}
        </span>
      )}
    </div>
  )
}

export function TableColumnSetting({
  columns,
  visibility,
  order,
  pinning,
  onVisibilityChange,
  onOrderChange,
  onPinningChange,
}: Props) {
  const { t } = useTranslation()
  const ordered = order
    .map((id) => columns.find((column) => column.id === id))
    .filter(Boolean) as TableColumnSettingItem[]
  const hideable = columns.filter((column) => column.hideable !== false)
  const allVisible = hideable.every((column) => visibility[column.id] !== false)
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (over) onOrderChange(moveColumn(order, String(active.id), String(over.id)))
  }
  const reset = () => {
    onVisibilityChange({})
    onOrderChange(columns.map((column) => column.id))
    onPinningChange({ left: [], right: [] })
  }
  return (
    <Popover>
      <PopoverTrigger render={<Button aria-label={t("datatable.columnSettings")} variant="outline" size="icon-sm" />}>
        <Settings2Icon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Checkbox
            aria-label={t("datatable.allColumns")}
            checked={allVisible}
            onCheckedChange={(checked) =>
              onVisibilityChange(Object.fromEntries(hideable.map((column) => [column.id, checked === true])))
            }
          />
          <span className="flex-1 text-sm font-medium">{t("datatable.columnSettings")}</span>
          <Button aria-label={t("datatable.resetColumns")} variant="ghost" size="icon-sm" onClick={reset}>
            <RotateCcwIcon />
          </Button>
        </div>
        <DndContext onDragEnd={dragEnd}>
          <SortableContext items={ordered.map((column) => column.id)} strategy={verticalListSortingStrategy}>
            <div className="grid gap-1">
              {ordered.map((column) => (
                <SortableColumn
                  key={column.id}
                  column={column}
                  visible={visibility[column.id] !== false}
                  pinned={
                    pinning.left?.includes(column.id) ? "left" : pinning.right?.includes(column.id) ? "right" : false
                  }
                  onVisible={(value) => onVisibilityChange({ ...visibility, [column.id]: value })}
                  onPin={() => onPinningChange(cycleColumnPinning(pinning, column.id))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </PopoverContent>
    </Popover>
  )
}
