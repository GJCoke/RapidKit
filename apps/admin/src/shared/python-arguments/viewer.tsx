import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui"
import { CodePreview } from "@/shared/code-viewers/code-preview"
import { formatPython, formatPythonCall, type PythonArguments } from "./arguments"
function ArgumentValue({ name, value }: { name: string; value: unknown }) {
  const { t } = useTranslation(),
    [open, setOpen] = useState(false),
    array = Array.isArray(value),
    object = !!value && typeof value === "object",
    type =
      value === null
        ? "None"
        : array
          ? "list"
          : object
            ? "dict"
            : typeof value === "boolean"
              ? "bool"
              : typeof value === "number"
                ? Number.isInteger(value)
                  ? "int"
                  : "float"
                : "str"
  const entries = object ? Object.entries(value) : []
  return (
    <div className="min-w-0 space-y-2 rounded-md border p-2 text-sm">
      {object ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-w-full whitespace-normal wrap-anywhere"
            aria-expanded={open}
            aria-label={`${name} · ${type}`}
            onClick={() => setOpen(!open)}
          >
            {open ? "▾" : "▸"} {name} <code className="text-muted-foreground">{type}</code>{" "}
            {t(array ? "pythonArgumentsViewer.items" : "pythonArgumentsViewer.fields", { count: entries.length })}
          </Button>
          {open && (
            <div className="min-w-0 space-y-2 border-l pl-3">
              {entries.map(([key, value]) => (
                <ArgumentValue key={key} name={array ? `[${key}]` : key} value={value} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex min-w-0 flex-wrap gap-2">
          <span className="wrap-anywhere">{name}</span>
          <code className="text-muted-foreground">{type}</code>
          <code className="min-w-0 whitespace-pre-wrap wrap-anywhere">{formatPython(value)}</code>
        </div>
      )}
    </div>
  )
}
export function PythonArgumentsViewer({
  value,
  functionName = "task",
}: {
  value: PythonArguments
  functionName?: string
}) {
  const { t } = useTranslation(),
    [preview, setPreview] = useState(false)
  return (
    <div className="min-w-0 space-y-4">
      <section className="space-y-2">
        <h3 className="font-medium">{t("pythonArguments.args")}</h3>
        {value.args.length ? (
          value.args.map((item, index) => <ArgumentValue key={index} name={`args[${index}]`} value={item} />)
        ) : (
          <p className="text-sm text-muted-foreground">{t("pythonArgumentsViewer.emptyArgs")}</p>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">{t("pythonArguments.kwargs")}</h3>
        {Object.keys(value.kwargs).length ? (
          Object.entries(value.kwargs).map(([key, item]) => <ArgumentValue key={key} name={key} value={item} />)
        ) : (
          <p className="text-sm text-muted-foreground">{t("pythonArgumentsViewer.emptyKwargs")}</p>
        )}
      </section>
      <Button type="button" variant="outline" aria-expanded={preview} onClick={() => setPreview(!preview)}>
        {t("pythonArguments.preview")}
      </Button>
      {preview && <CodePreview code={formatPythonCall(functionName, value)} language="python" />}
    </div>
  )
}
