import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { Button } from "@rapidkit/ui"
import type { PluginDependencyGraph } from "@/services/api/plugin-monitoring"
import { pluginStatusClass } from "./plugin-state"
type Point = { x: number; y: number }
function initialPositions(graph: PluginDependencyGraph): Record<string, Point> {
  return Object.fromEntries(
    graph.nodes.map((node, index) => {
      const angle = (index * Math.PI * 2) / graph.nodes.length - Math.PI / 2
      return [
        node.name,
        graph.nodes.length === 1
          ? { x: 320, y: 200 }
          : { x: 320 + Math.cos(angle) * 185, y: 200 + Math.sin(angle) * 140 },
      ]
    }),
  )
}
export function PluginDependencyDiagram({ graph }: { graph: PluginDependencyGraph }) {
  const { t } = useTranslation()
  const svg = useRef<SVGSVGElement>(null)
  const marker = useId().replaceAll(":", "")
  const [positions, setPositions] = useState(() => initialPositions(graph))
  const [pixelRatio, setPixelRatio] = useState(1)
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [focused, setFocused] = useState<string | null>(null)
  useEffect(() => {
    const element = svg.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      setView((previous) => ({
        ...previous,
        zoom: Math.min(3, Math.max(0.5, previous.zoom + (event.deltaY < 0 ? 0.1 : -0.1))),
      }))
    }
    const resize = () => {
      const bounds = element.getBoundingClientRect()
      const scale = Math.min(bounds.width / 640, bounds.height / 400)
      if (scale > 0) setPixelRatio(1 / scale)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    // React delegates wheel events passively; the graph must prevent page scrolling while zooming.
    element.addEventListener("wheel", wheel, { passive: false })
    return () => {
      element.removeEventListener("wheel", wheel)
      observer.disconnect()
    }
  }, [])
  const drag = useRef<{ pointer: number; node: string | null; start: Point; origin: Point } | null>(null)
  const statuses = [...new Set(graph.nodes.map((node) => node.status))]
  const visible = graph.nodes.filter((node) => !hidden.has(node.status))
  const names = new Set(visible.map((node) => node.name))
  const edges = graph.edges.filter((edge) => names.has(edge.source) && names.has(edge.target))
  const adjacent = new Set([
    focused,
    ...edges.flatMap((edge) =>
      edge.source === focused ? [edge.target] : edge.target === focused ? [edge.source] : [],
    ),
  ])
  const degree = (name: string) =>
    graph.edges.reduce((count, edge) => count + Number(edge.source === name) + Number(edge.target === name), 0)
  const radius = (name: string) => Math.max(10, 7 + degree(name) * 3) * pixelRatio
  const selected = graph.nodes.find((node) => node.name === focused && !hidden.has(node.status))
  function zoom(delta: number) {
    setView((previous) => ({ ...previous, zoom: Math.min(3, Math.max(0.5, previous.zoom + delta)) }))
  }
  return (
    <div className="grid min-w-0 gap-3">
      <div role="group" aria-label={t("pluginMonitoring.status")} className="flex flex-wrap gap-1">
        {statuses.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={hidden.has(status) ? "ghost" : "outline"}
            aria-pressed={!hidden.has(status)}
            className={pluginStatusClass(status)}
            onClick={() => {
              setHidden((previous) => {
                const next = new Set(previous)
                if (next.has(status)) next.delete(status)
                else next.add(status)
                return next
              })
              setFocused(null)
            }}
          >
            {t(`pluginMonitoring.status_${status}`, { defaultValue: status })}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("pluginMonitoring.zoomIn")}
          disabled={view.zoom >= 3}
          onClick={() => zoom(0.25)}
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("pluginMonitoring.zoomOut")}
          disabled={view.zoom <= 0.5}
          onClick={() => zoom(-0.25)}
        >
          <Minus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("pluginMonitoring.resetView")}
          onClick={() => {
            setView({ x: 0, y: 0, zoom: 1 })
            setPositions(initialPositions(graph))
          }}
        >
          <RotateCcw />
        </Button>
        <span className="ml-1 text-xs text-muted-foreground">{Math.round(view.zoom * 100)}%</span>
      </div>
      <svg
        ref={svg}
        viewBox="0 0 640 400"
        role="group"
        aria-label={t("pluginMonitoring.depGraph")}
        className="h-80 w-full touch-none overflow-hidden rounded-lg border bg-muted/20"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const node =
            event.target instanceof Element
              ? (event.target.closest("[data-node]")?.getAttribute("data-node") ?? null)
              : null
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            pointer: event.pointerId,
            node,
            start: { x: event.clientX, y: event.clientY },
            origin: node ? positions[node] : { x: view.x, y: view.y },
          }
        }}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current || current.pointer !== event.pointerId) return
          const bounds = event.currentTarget.getBoundingClientRect()
          const scale = Math.min(bounds.width / 640, bounds.height / 400)
          if (!scale) return
          const dx = (event.clientX - current.start.x) / scale,
            dy = (event.clientY - current.start.y) / scale
          if (current.node) {
            const name = current.node
            setPositions((previous) => ({
              ...previous,
              [name]: { x: current.origin.x + dx / view.zoom, y: current.origin.y + dy / view.zoom },
            }))
          } else setView((previous) => ({ ...previous, x: current.origin.x + dx, y: current.origin.y + dy }))
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointer === event.pointerId) drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onLostPointerCapture={() => {
          drag.current = null
        }}
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth={7 * pixelRatio}
            markerHeight={7 * pixelRatio}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <g transform={`translate(${320 + view.x} ${200 + view.y}) scale(${view.zoom}) translate(-320 -200)`}>
          {edges.map((edge, index) => {
            const source = positions[edge.source],
              target = positions[edge.target]
            const length = Math.hypot(target.x - source.x, target.y - source.y) || 1,
              offset = radius(edge.target) + 2
            return (
              <line
                key={`${edge.source}-${edge.target}-${index}`}
                data-dependency={`${edge.source} → ${edge.target}`}
                x1={source.x}
                y1={source.y}
                x2={target.x - ((target.x - source.x) / length) * offset}
                y2={target.y - ((target.y - source.y) / length) * offset}
                stroke="currentColor"
                markerEnd={`url(#${marker})`}
                strokeWidth={focused && (edge.source === focused || edge.target === focused) ? 3 : 1.2}
                opacity={focused && edge.source !== focused && edge.target !== focused ? 0.15 : 0.6}
              >
                <title>
                  {edge.source} → {edge.target}
                </title>
              </line>
            )
          })}
          {visible.map((node) => (
            <g
              key={node.name}
              data-node={node.name}
              role="button"
              tabIndex={0}
              aria-label={`${node.name}, ${t(`pluginMonitoring.status_${node.status}`, { defaultValue: node.status })}, ${node.version ?? "-"}`}
              transform={`translate(${positions[node.name].x} ${positions[node.name].y})`}
              className={`cursor-grab outline-none focus:stroke-primary ${pluginStatusClass(node.status)}`}
              opacity={focused && !adjacent.has(node.name) ? 0.2 : 1}
              onMouseEnter={() => setFocused(node.name)}
              onMouseLeave={() => setFocused(null)}
              onFocus={() => setFocused(node.name)}
              onBlur={() => setFocused(null)}
              onKeyDown={(event) => {
                if (["Enter", " "].includes(event.key)) {
                  event.preventDefault()
                  setFocused(node.name)
                }
              }}
            >
              <title>
                {node.name} · {node.version ?? "-"}
              </title>
              <circle
                r={radius(node.name)}
                fill="currentColor"
                stroke={focused === node.name ? "var(--foreground)" : "var(--background)"}
                strokeWidth={2}
              />
              <text
                y={radius(node.name) + 17 * pixelRatio}
                textAnchor="middle"
                fill="var(--foreground)"
                stroke="none"
                fontSize={12 * pixelRatio}
              >
                {node.name.length > 24 ? `${node.name.slice(0, 23)}…` : node.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <p role="status" className="min-h-5 text-xs whitespace-normal wrap-anywhere text-muted-foreground">
        {selected
          ? `${selected.name} · ${selected.version ?? "-"} · ${t(`pluginMonitoring.status_${selected.status}`, { defaultValue: selected.status })}`
          : t("pluginMonitoring.graphHint")}
      </p>
    </div>
  )
}
