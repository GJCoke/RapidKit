import { useTranslation } from "react-i18next"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Tooltip,
} from "recharts"
import { Card, CardHeader, CardTitle, CardContent } from "@rapidkit/ui"
import { instrumentChartRows, type InstrumentState } from "./instrument-model"
const tooltipStyle = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  maxWidth: "min(260px, calc(100vw - 64px))",
  whiteSpace: "normal",
}
const colors = ["var(--chart-1)", "var(--chart-2)"]
function bytes(value: unknown) {
  return typeof value === "number" ? (value >= 1024 ? `${(value / 1024).toFixed(2)} KB` : `${value} B`) : String(value)
}
export function InstrumentDistribution({ polling, websocket }: { polling: number; websocket: number }) {
  const rows = [
    { name: "WebSocket", value: websocket },
    { name: "Polling", value: polling },
  ]
  return (
    <div>
      <ResponsiveContainer width="100%" height={170} initialDimension={{ width: 400, height: 170 }}>
        <PieChart>
          <Tooltip contentStyle={tooltipStyle} />
          <Pie data={rows} nameKey="name" dataKey="value" innerRadius={42} outerRadius={62} isAnimationActive={false}>
            {rows.map((row, index) => (
              <Cell key={row.name} fill={colors[index]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <dl className="flex flex-wrap justify-center gap-5 text-sm">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-2">
            <dt>{row.name}</dt>
            <dd className="font-mono font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
export function InstrumentCharts({ data, now }: { data: InstrumentState; now: number }) {
  const { t, i18n } = useTranslation(),
    rows = instrumentChartRows(data, now)
  const time = (value: unknown) =>
    typeof value === "number" ? new Date(value).toLocaleTimeString(i18n.language) : String(value)
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t("socketInstrument.connectionStatistics")}</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <figure aria-label={t("socketInstrument.connectionStatistics")}>
            <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 400, height: 260 }}>
              <BarChart data={rows.connections} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="timestamp" tickFormatter={time} tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis allowDecimals={false} width={34} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={time} />
                <Legend />
                <Bar
                  dataKey="connected"
                  name={t("socketInstrument.connect")}
                  fill={colors[0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="disconnected"
                  name={t("socketInstrument.disconnect")}
                  fill={colors[1]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
            {!rows.connections.length && (
              <figcaption className="text-center text-xs text-muted-foreground">
                {t("socketInstrument.noChartData")}
              </figcaption>
            )}
          </figure>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t("socketInstrument.networkTraffic")}</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <figure aria-label={t("socketInstrument.networkTraffic")}>
            <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 400, height: 260 }}>
              <BarChart data={rows.traffic} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="timestamp" tickFormatter={time} tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis width={46} tickFormatter={(value) => bytes(value)} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={time} formatter={(value) => bytes(value)} />
                <Legend />
                <Bar
                  dataKey="received"
                  name={t("socketInstrument.receivedBytes")}
                  fill={colors[0]}
                  isAnimationActive={false}
                />
                <Bar dataKey="sent" name={t("socketInstrument.sentBytes")} fill={colors[1]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            {!rows.traffic.length && (
              <figcaption className="text-center text-xs text-muted-foreground">
                {t("socketInstrument.noChartData")}
              </figcaption>
            )}
          </figure>
        </CardContent>
      </Card>
    </div>
  )
}
