import { useState } from "react"
import { useTranslation } from "react-i18next"
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react"
import { Button, Input, Textarea } from "@rapidkit/ui"
import { FormSelect } from "@/shared/crud/form-select"
import { CodePreview } from "@/shared/code-viewers/code-preview"
import {
  ArgumentError,
  decodeArguments,
  encodeArguments,
  formatPythonCall,
  type ArgumentRow,
  type ArgumentType,
  type KeywordRow,
  type PythonArguments,
} from "./arguments"
export interface ArgumentDraft {
  args: (ArgumentRow & { id: string })[]
  kwargs: (KeywordRow & { id: string })[]
}
export function createArgumentDraft(value: PythonArguments = { args: [], kwargs: {} }): ArgumentDraft {
  const rows = decodeArguments(value)
  return {
    args: rows.args.map((row) => ({ ...row, id: crypto.randomUUID() })),
    kwargs: rows.kwargs.map((row) => ({ ...row, id: crypto.randomUUID() })),
  }
}
export function parseArgumentDraft(
  draft: ArgumentDraft,
): { value: PythonArguments; error?: never } | { value?: never; error: ArgumentError } {
  try {
    return { value: encodeArguments(draft.args, draft.kwargs) }
  } catch (error) {
    if (error instanceof ArgumentError) return { error }
    throw error
  }
}
const argumentTypes = ["string", "number", "boolean", "none", "json"] as const
const defaults = { string: "", number: "0", boolean: "true", none: "", json: "{}" }
function ArgumentCard({
  row,
  index,
  group,
  total,
  disabled,
  error,
  update,
  updateKey,
  remove,
  move,
}: {
  row: ArgumentRow & { id: string; key?: string }
  index: number
  group: "args" | "kwargs"
  total: number
  disabled: boolean
  error?: ArgumentError
  update: (patch: Partial<ArgumentRow>) => void
  updateKey: (key: string) => void
  remove: () => void
  move: (direction: number) => void
}) {
  const { t } = useTranslation(),
    sortable = useSortable({ id: row.id, disabled: disabled || group !== "args" }),
    invalid = error?.group === group && error.index === index
  return (
    <article
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.5 : 1,
      }}
      className={`min-w-0 overflow-hidden rounded-lg border ${invalid ? "border-destructive" : ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 p-2">
        <span className="flex items-center gap-2">
          {group === "args" && (
            <button
              type="button"
              ref={sortable.setActivatorNodeRef}
              {...sortable.attributes}
              {...sortable.listeners}
              disabled={disabled}
              aria-label={`${t("pythonArguments.position")} ${index + 1}`}
              className="touch-none cursor-grab rounded p-1"
            >
              <GripVertical className="size-4" />
            </button>
          )}
          <code>
            {group}[{index}]
          </code>
        </span>
        <span className="flex items-center gap-1">
          {group === "args" && (
            <>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={disabled || index === 0}
                aria-label={t("pythonArguments.up")}
                onClick={() => move(-1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={disabled || index === total - 1}
                aria-label={t("pythonArguments.down")}
                onClick={() => move(1)}
              >
                <ArrowDown className="size-4" />
              </Button>
            </>
          )}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            aria-label={t("common.delete")}
            onClick={remove}
          >
            <Trash2 className="size-4" />
          </Button>
        </span>
      </header>
      <div className="grid min-w-0 gap-3 p-3 sm:grid-cols-2">
        {group === "kwargs" && (
          <label className="grid min-w-0 gap-1 text-sm">
            {t("pythonArguments.key")}
            <Input
              aria-label={t("pythonArguments.key")}
              placeholder={t("pythonArguments.keyPlaceholder")}
              value={row.key ?? ""}
              disabled={disabled}
              onChange={(event) => updateKey(event.target.value)}
            />
          </label>
        )}
        <label className="grid min-w-0 gap-1 text-sm">
          {t("pythonArguments.type")}
          <FormSelect
            label={t("pythonArguments.type")}
            value={row.type}
            disabled={disabled}
            options={argumentTypes.map((value) => ({ value, label: t(`pythonArguments.${value}`) }))}
            onChange={(next) => {
              const type = argumentTypes.find((type) => type === next)
              if (type) update({ type, value: defaults[type] })
            }}
          />
        </label>
        <label
          className={`grid min-w-0 gap-1 text-sm ${group === "kwargs" || row.type === "json" ? "sm:col-span-2" : ""}`}
        >
          {t("pythonArguments.value")}
          {row.type === "boolean" ? (
            <FormSelect
              label={t("pythonArguments.value")}
              value={row.value}
              disabled={disabled}
              options={[
                { value: "true", label: "True" },
                { value: "false", label: "False" },
              ]}
              onChange={(value) => update({ value })}
            />
          ) : row.type === "none" ? (
            <span className="rounded-md bg-muted p-2">
              <code>None</code> · {t("pythonArguments.noneHint")}
            </span>
          ) : row.type === "json" ? (
            <Textarea
              aria-label={t("pythonArguments.value")}
              value={row.value}
              disabled={disabled}
              rows={3}
              className="font-mono"
              onChange={(event) => update({ value: event.target.value })}
            />
          ) : (
            <Input
              aria-label={t("pythonArguments.value")}
              value={row.value}
              disabled={disabled}
              onChange={(event) => update({ value: event.target.value })}
            />
          )}
        </label>
        {invalid && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {group}[{index}] · {t(`pythonArguments.error.${error.code}`)}
          </p>
        )}
      </div>
    </article>
  )
}
export function PythonArgumentsEditor({
  value,
  onChange,
  functionName = "task",
  disabled = false,
  showPreview = true,
}: {
  value: ArgumentDraft
  onChange: (next: ArgumentDraft) => void
  functionName?: string
  disabled?: boolean
  showPreview?: boolean
}) {
  const { t } = useTranslation(),
    [tab, setTab] = useState<"python" | "json">("python"),
    result = parseArgumentDraft(value),
    sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )
  function move(from: number, to: number) {
    if (!disabled && to >= 0 && to < value.args.length) onChange({ ...value, args: arrayMove(value.args, from, to) })
  }
  function drag(event: DragEndEvent) {
    if (event.over && !disabled)
      move(
        value.args.findIndex((row) => row.id === event.active.id),
        value.args.findIndex((row) => row.id === event.over?.id),
      )
  }
  return (
    <div className="min-w-0 space-y-6">
      {(["args", "kwargs"] as const).map((group) => (
        <section key={group} aria-label={t(`pythonArguments.${group}`)} className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">
              {t(`pythonArguments.${group}`)}{" "}
              <code className="text-xs text-muted-foreground">{group === "args" ? "*args" : "**kwargs"}</code>{" "}
              <span className="text-sm text-muted-foreground">{value[group].length}</span>
            </h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                onChange(
                  group === "args"
                    ? { ...value, args: [...value.args, { id: crypto.randomUUID(), type: "string", value: "" }] }
                    : {
                        ...value,
                        kwargs: [...value.kwargs, { id: crypto.randomUUID(), key: "", type: "string", value: "" }],
                      },
                )
              }
            >
              {t("pythonArguments.add")}
            </Button>
            <p className="w-full text-xs text-muted-foreground">{t(`pythonArguments.${group}Hint`)}</p>
          </div>
          {!value[group].length && (
            <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
              {t("pythonArguments.empty")}
            </p>
          )}
          <DndContext sensors={sensors} onDragEnd={group === "args" ? drag : undefined}>
            <SortableContext items={value[group].map((row) => row.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {value[group].map((row, index) => (
                  <ArgumentCard
                    key={row.id}
                    row={row}
                    index={index}
                    group={group}
                    total={value[group].length}
                    disabled={disabled}
                    error={result.error}
                    move={(direction) => move(index, index + direction)}
                    remove={() => {
                      if (!disabled)
                        onChange(
                          group === "args"
                            ? { ...value, args: value.args.filter((item) => item.id !== row.id) }
                            : { ...value, kwargs: value.kwargs.filter((item) => item.id !== row.id) },
                        )
                    }}
                    updateKey={(key) => {
                      if (!disabled)
                        onChange({
                          ...value,
                          kwargs: value.kwargs.map((item) => (item.id === row.id ? { ...item, key } : item)),
                        })
                    }}
                    update={(patch) => {
                      if (!disabled)
                        onChange(
                          group === "args"
                            ? {
                                ...value,
                                args: value.args.map((item) => (item.id === row.id ? { ...item, ...patch } : item)),
                              }
                            : {
                                ...value,
                                kwargs: value.kwargs.map((item) => (item.id === row.id ? { ...item, ...patch } : item)),
                              },
                        )
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </section>
      ))}
      {showPreview && (
        <section className="min-w-0 space-y-3 border-t pt-4">
          <h3 className="font-medium">{t("pythonArguments.output")}</h3>
          {result.value ? (
            <>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("pythonArguments.output")}>
                {(["python", "json"] as const).map((value) => (
                  <Button
                    type="button"
                    key={value}
                    role="tab"
                    aria-selected={tab === value}
                    variant={tab === value ? "default" : "outline"}
                    onClick={() => setTab(value)}
                  >
                    {t(value === "python" ? "pythonArguments.preview" : "pythonArguments.payload")}
                  </Button>
                ))}
              </div>
              <div
                role="tabpanel"
                aria-label={t(tab === "python" ? "pythonArguments.preview" : "pythonArguments.payload")}
              >
                <CodePreview
                  code={
                    tab === "python"
                      ? formatPythonCall(functionName, result.value)
                      : JSON.stringify(result.value, null, 2)
                  }
                  language={tab}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("pythonArguments.invalidPreview")}</p>
          )}
        </section>
      )}
    </div>
  )
}
