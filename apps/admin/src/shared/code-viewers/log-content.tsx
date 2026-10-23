import { Component, createRef } from "react"
import { formatEntry, type LogEntry } from "./log-model"
type Anchor = { key: string; offset: number } | null
interface Props {
  entries: readonly LogEntry[]
  retained: readonly LogEntry[]
  height: number
  wrap: boolean
  numbers: boolean
  follow: boolean
  label: string
  onFollow: (follow: boolean) => void
  onLost: () => void
}
/** DOM snapshots preserve the reader's line before React updates or evicts rows. */
export class LogContent extends Component<Props, object, Anchor> {
  private element = createRef<HTMLDivElement>()
  private guarded = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private observer: ResizeObserver | undefined
  private clearGuard = () => {
    this.guarded = false
    clearTimeout(this.timer)
  }
  private guard = () => {
    this.guarded = true
    clearTimeout(this.timer)
    this.timer = setTimeout(this.clearGuard, 100)
  }
  private bottom = () => {
    const element = this.element.current
    if (element) {
      this.guard()
      element.scrollTop = element.scrollHeight
    }
  }
  componentDidMount() {
    if (this.props.follow) this.bottom()
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => {
        if (this.props.follow) this.bottom()
      })
      if (this.element.current) this.observer.observe(this.element.current)
    }
  }
  componentWillUnmount() {
    this.clearGuard()
    this.observer?.disconnect()
  }
  getSnapshotBeforeUpdate(): Anchor {
    const element = this.element.current
    if (!element || this.props.follow) return null
    this.guard()
    const top = element.getBoundingClientRect().top
    for (const row of element.querySelectorAll<HTMLElement>("[data-log-key]")) {
      if (row.getBoundingClientRect().bottom > top)
        return { key: row.dataset.logKey ?? "", offset: row.getBoundingClientRect().top - top }
    }
    return null
  }
  componentDidUpdate(_previous: Props, _state: object, anchor: Anchor) {
    if (this.props.follow) {
      this.bottom()
      return
    }
    if (!anchor) return
    const element = this.element.current
    if (!element) return
    const row = Array.from(element.querySelectorAll<HTMLElement>("[data-log-key]")).find(
      (item) => item.dataset.logKey === anchor.key,
    )
    if (row) {
      this.guard()
      element.scrollTop += row.getBoundingClientRect().top - element.getBoundingClientRect().top - anchor.offset
    } else if (!this.props.retained.some((entry) => `${typeof entry.id}:${entry.id}` === anchor.key))
      this.props.onLost()
  }
  render() {
    const { entries, height, wrap, numbers, label } = this.props
    return (
      <div
        ref={this.element}
        role="log"
        aria-label={label}
        aria-live="off"
        tabIndex={0}
        style={{ height }}
        className="overflow-auto py-3 font-mono text-xs outline-offset-2"
        onWheel={this.clearGuard}
        onPointerDown={this.clearGuard}
        onTouchStart={this.clearGuard}
        onKeyDown={(event) => {
          if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) this.clearGuard()
        }}
        onScroll={(event) => {
          if (!this.guarded) {
            const element = event.currentTarget
            this.props.onFollow(element.scrollHeight - element.scrollTop - element.clientHeight <= 24)
          }
        }}
      >
        <div className={wrap ? "min-w-0" : "w-max min-w-full"}>
          {entries.map((entry) => (
            <div
              key={`${typeof entry.id}:${entry.id}`}
              data-log-key={`${typeof entry.id}:${entry.id}`}
              className="flex min-h-5 gap-3 px-3"
            >
              {numbers && (
                <span aria-hidden className="w-8 shrink-0 text-right text-muted-foreground select-none">
                  {entry.number}
                </span>
              )}
              <code
                className={`${wrap ? "min-w-0 whitespace-pre-wrap wrap-anywhere" : "whitespace-pre"} ${entry.level === "ERROR" ? "text-destructive" : entry.level === "WARN" ? "text-amber-700 dark:text-amber-300" : entry.level === "DEBUG" ? "text-muted-foreground" : ""}`}
              >
                {formatEntry(entry)}
              </code>
            </div>
          ))}
        </div>
      </div>
    )
  }
}
