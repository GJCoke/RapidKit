<script setup lang="ts">
  import { watch } from "vue"
  import { useThemeVars } from "naive-ui"
  import { useEcharts } from "@/hooks/common/echarts"
  import { $t } from "@/locales"

  defineOptions({ name: "PluginDepGraph" })

  const props = defineProps<{
    graph: Api.Plugin.DependencyGraph
    loading: boolean
  }>()

  const themeVars = useThemeVars()

  const STATUS_CATEGORY: Record<string, number> = {
    loaded: 0,
    disabled: 1,
    failed: 2,
  }

  const { domRef, updateOptions } = useEcharts(() => ({
    tooltip: {},
    legend: [{ data: [] as string[] }],
    animationDuration: 1500,
    animationEasingUpdate: "quinticInOut",
    series: [],
  }))

  watch(
    () => props.graph,
    (graph) => {
      if (!graph.nodes.length) return

      const categories = [
        { name: "loaded", itemStyle: { color: themeVars.value.successColor } },
        { name: "disabled", itemStyle: { color: themeVars.value.warningColor } },
        { name: "failed", itemStyle: { color: themeVars.value.errorColor } },
      ]

      // compute in-degree to scale node size
      const inDegree = new Map<string, number>()
      for (const e of graph.edges) {
        inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
      }
      const outDegree = new Map<string, number>()
      for (const e of graph.edges) {
        outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1)
      }

      updateOptions((opts) => {
        opts.tooltip = {}
        opts.legend = [
          {
            data: categories.map((c) => c.name),
          },
        ]

        opts.series = [
          {
            name: $t("page.monitoring.plugin.depGraph"),
            type: "graph",
            legendHoverLink: false,
            layout: "force",
            force: {
              repulsion: 200,
              edgeLength: 100,
              gravity: 0.2,
              layoutAnimation: false,
            },
            roam: true,
            categories,
            data: graph.nodes.map((node) => {
              const degree = (inDegree.get(node.name) ?? 0) + (outDegree.get(node.name) ?? 0)
              const size = Math.max(20, 14 + degree * 6)
              return {
                name: node.name,
                symbolSize: size,
                value: node.version ?? "-",
                category: STATUS_CATEGORY[node.status] ?? 0,
                label: { show: true },
              }
            }),
            edgeSymbol: ["none", "arrow"],
            edgeSymbolSize: [0, 10],
            links: graph.edges.map((edge) => ({
              source: edge.source,
              target: edge.target,
            })),
            label: {
              position: "right",
              formatter: "{b}",
            },
            lineStyle: {
              color: "source",
              curveness: 0.3,
            },
            emphasis: {
              focus: "adjacency",
              lineStyle: {
                width: 10,
              },
            },
          },
        ] as any
        return opts
      })
    },
    { deep: true },
  )
</script>

<template>
  <NCard :bordered="false" class="card-wrapper h-full" content-class="flex flex-col h-full">
    <div class="flex items-center gap-8px text-15px font-600 mb-12px">
      <SvgIcon icon="carbon:network-3" class="text-16px text-[var(--primary-color)]" />
      {{ $t("page.monitoring.plugin.depGraph") }}
    </div>
    <div class="relative flex-1 min-h-0">
      <NSpin :show="loading" class="absolute inset-0">
        <div ref="domRef" class="absolute inset-0" />
      </NSpin>
    </div>
  </NCard>
</template>
