import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui"
import { tokenizeCode, type CodeLanguage } from "./code-model"
import { copyText, downloadText } from "./text-actions"

export function TextActions({
  code,
  namespace,
  disabled,
  filename,
  mime,
}: {
  code: string
  namespace: "jsonViewer" | "pythonArguments" | "logViewer"
  disabled?: boolean
  filename?: string
  mime?: string
}) {
  const { t } = useTranslation(),
    [feedback, setFeedback] = useState(""),
    [copying, setCopying] = useState(false),
    mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  async function copy() {
    setCopying(true)
    setFeedback("")
    try {
      await copyText(code)
      if (mounted.current) setFeedback("copied")
    } catch {
      if (mounted.current) setFeedback("copyFailed")
    } finally {
      if (mounted.current) setCopying(false)
    }
  }
  function download() {
    setFeedback("")
    try {
      if (filename) {
        if (mime) downloadText(code, filename, mime)
        else downloadText(code, filename)
      }
    } catch {
      setFeedback(namespace === "jsonViewer" ? "downloadFailed" : "exportFailed")
    }
  }
  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={disabled || copying} onClick={() => void copy()}>
        {t(`${namespace}.copy`)}
      </Button>
      {filename && (
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={download}>
          {t(`${namespace}.${namespace === "jsonViewer" ? "download" : "export"}`)}
        </Button>
      )}
      {feedback && (
        <span className="text-sm" role={feedback === "copied" ? "status" : "alert"}>
          {t(`${namespace}.${feedback}`)}
        </span>
      )}
    </>
  )
}
const tokenClasses = {
  plain: "",
  string: "text-emerald-700 dark:text-emerald-300",
  property: "text-sky-700 dark:text-sky-300",
  number: "text-orange-700 dark:text-orange-300",
  keyword: "text-violet-700 dark:text-violet-300",
  punctuation: "text-muted-foreground",
}
export function CodeLines({
  code,
  language,
  wrap = true,
  lineNumbers = true,
  maxHeight = 360,
}: {
  code: string
  language: CodeLanguage
  wrap?: boolean
  lineNumbers?: boolean
  maxHeight?: number
}) {
  return (
    <div className="overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs" style={{ maxHeight }}>
      <pre className={wrap ? "whitespace-pre-wrap wrap-anywhere" : "whitespace-pre"}>
        {code.split("\n").map((line, index) => (
          <div key={index} className="flex min-h-5 gap-3">
            {lineNumbers && (
              <span aria-hidden className="w-7 shrink-0 text-right text-muted-foreground select-none">
                {index + 1}
              </span>
            )}
            <code className="min-w-0">
              {tokenizeCode(line, language).map((token, tokenIndex) => (
                <span key={tokenIndex} className={tokenClasses[token.kind]}>
                  {token.text}
                </span>
              ))}
            </code>
          </div>
        ))}
      </pre>
    </div>
  )
}
export function CodePreview({ code, language }: { code: string; language: CodeLanguage }) {
  const { t } = useTranslation()
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {t("pythonArguments.lines", { count: code.split("\n").length })}
        </span>
        <TextActions key={code} code={code} namespace="pythonArguments" />
      </div>
      <CodeLines code={code} language={language} />
    </section>
  )
}
