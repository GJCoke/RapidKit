import { useState } from "react"
import { useTranslation } from "react-i18next"
import { serializeJson } from "./code-model"
import { CodeLines, TextActions } from "./code-preview"
export function JsonViewer({
  value,
  title,
  filename = "data.json",
  maxHeight = 360,
}: {
  value: unknown
  title?: string
  filename?: string
  maxHeight?: number
}) {
  const { t } = useTranslation(),
    [wrap, setWrap] = useState(true),
    [numbers, setNumbers] = useState(true),
    json = serializeJson(value)
  return (
    <section className="min-w-0 space-y-3 rounded-lg border p-3" aria-label={title ?? t("jsonViewer.title")}>
      <h3 className="font-medium">{title ?? t("jsonViewer.title")}</h3>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />
          {t("jsonViewer.wrap")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={numbers} onChange={(event) => setNumbers(event.target.checked)} />
          {t("jsonViewer.lineNumbers")}
        </label>
        <TextActions
          key={`${json.valid}:${json.code}`}
          code={json.code}
          namespace="jsonViewer"
          filename={filename}
          mime="application/json;charset=utf-8"
          disabled={!json.valid}
        />
      </div>
      {json.valid ? (
        <CodeLines code={json.code} language="json" wrap={wrap} lineNumbers={numbers} maxHeight={maxHeight} />
      ) : (
        <p role={value === undefined ? undefined : "alert"} className="text-sm text-muted-foreground">
          {t(value === undefined ? "jsonViewer.empty" : "jsonViewer.invalid")}
        </p>
      )}
    </section>
  )
}
