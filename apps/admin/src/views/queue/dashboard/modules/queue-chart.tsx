import { useTranslation } from "react-i18next"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts"
import type { QueueOverview, TaskRanking, WorkerRanking } from "@/services/api/worker"
import { parseApiDate } from "@/shared/date-time"
import { queueTime } from "./queue-presentation"
export function QueueChart({
  kind,
  dashboard,
  tasks = [],
  workers = [],
  onSelect,
}: {
  kind: "completion" | "depth" | "tasks" | "workers"
  dashboard?: QueueOverview
  tasks?: TaskRanking["records"]
  workers?: WorkerRanking
  onSelect?: (name: string) => void
}) {
  const { t, i18n } = useTranslation(),
    p = "queueDashboard.overview.",
    ranked = kind === "tasks" || kind === "workers",
    title = t(
      `${p}${kind === "completion" ? "completionTrend" : kind === "depth" ? "depthTrend" : kind === "tasks" ? "taskRanking" : "workerRanking"}`,
    ),
    success = t(`${p}success`),
    failure = t(`${p}failure`)
  const rows =
    kind === "tasks"
      ? tasks.map((row) => ({ name: row.taskName, success: row.success, failure: row.failure }))
      : workers.map((row) => ({ name: row.workerHostname, success: row.success, failure: row.failure }))
  const tick = ({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) => {
    const name = typeof payload?.value === "string" ? payload.value : ""
    return (
      <text
        x={Number(x) - 8}
        y={Number(y) + 4}
        textAnchor="end"
        fill="var(--foreground)"
        fontSize={12}
        role="button"
        tabIndex={0}
        aria-label={name}
        onClick={() => onSelect?.(name)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onSelect?.(name)
          }
        }}
        className="cursor-pointer"
      >
        <title>{name}</title>
        {name.length > 21 ? `${name.slice(0, 20)}…` : name}
      </text>
    )
  }
  const tooltipStyle = {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--popover-foreground)",
  }
  const timeline =
    kind === "depth"
      ? (dashboard?.depthTimeline ?? []).map((row) => ({
          time: parseApiDate(row.timeBucket).getTime(),
          depth: row.depth,
        }))
      : (dashboard?.timeline ?? []).map((row) => ({
          time: parseApiDate(row.timeBucket).getTime(),
          success: row.success,
          failure: row.failure,
        }))
  return (
    <div role={ranked ? "group" : "img"} aria-label={title} className="h-70 min-w-0 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {ranked ? (
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ left: 0, right: 15, top: 10, bottom: 0 }}
            accessibilityLayer
            role="group"
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis type="category" dataKey="name" width={155} tick={tick} interval={0} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar
              dataKey="success"
              name={success}
              stackId="outcomes"
              fill="var(--chart-2)"
              maxBarSize={18}
              isAnimationActive={false}
              onClick={(_row, index) => {
                const row = rows[index]
                if (row) onSelect?.(row.name)
              }}
            />
            <Bar
              dataKey="failure"
              name={failure}
              stackId="outcomes"
              fill="var(--destructive)"
              maxBarSize={18}
              isAnimationActive={false}
              onClick={(_row, index) => {
                const row = rows[index]
                if (row) onSelect?.(row.name)
              }}
            />
          </BarChart>
        ) : (
          <LineChart data={timeline} margin={{ left: 0, right: 16, top: 8, bottom: 0 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              stroke="var(--muted-foreground)"
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString(i18n.language, { month: "short", day: "numeric", hour: "2-digit" })
              }
              fontSize={11}
            />
            <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => queueTime(Number(value), i18n.language)} />
            <Legend />
            {kind === "depth" ? (
              <Line
                type="linear"
                dataKey="depth"
                name={t(`${p}depth`)}
                stroke="var(--primary)"
                connectNulls={false}
                dot={(dashboard?.depthTimeline.filter((row) => row.depth !== null).length ?? 0) < 3}
                isAnimationActive={false}
              />
            ) : (
              <Line
                type="linear"
                dataKey="success"
                name={success}
                stroke="var(--chart-2)"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {kind !== "depth" && (
              <Line
                type="linear"
                dataKey="failure"
                name={failure}
                stroke="var(--destructive)"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
