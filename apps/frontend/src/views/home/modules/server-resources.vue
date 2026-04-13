<script setup lang="ts">
  import { computed, watch } from "vue"
  import { useThemeVars } from "naive-ui"
  import type { SelectOption } from "naive-ui"
  import { useEcharts } from "@/hooks/common/echarts"
  import { $t } from "@/locales"

  defineOptions({ name: "DashboardServerResources" })

  const props = defineProps<{
    resources: Api.Dashboard.ResourceStats
    instanceResources: Map<string, Api.Dashboard.InstanceResourceStats>
    selectedInstance: string
  }>()

  const emit = defineEmits<{
    (e: "update:selectedInstance", value: string): void
  }>()

  const instanceOptions = computed<SelectOption[]>(() => {
    const n = props.instanceResources.size
    if (n <= 1) return []
    const opts: SelectOption[] = [{ label: $t("page.home.dashboard.allInstances", { n }), value: "summary" }]
    for (const hostname of props.instanceResources.keys()) {
      opts.push({ label: hostname, value: hostname })
    }
    return opts
  })

  const showSelector = computed(() => instanceOptions.value.length > 0)

  const theme = useThemeVars()

  function gaugeOption(label: string, percent: number) {
    const color =
      percent >= 80 ? theme.value.errorColor : percent >= 60 ? theme.value.warningColor : theme.value.successColor
    return {
      series: [
        {
          type: "gauge" as const,
          center: ["50%", "65%"],
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          radius: "100%",
          pointer: { show: false },
          progress: {
            show: true,
            width: 12,
            roundCap: true,
            itemStyle: { color },
          },
          axisLine: {
            lineStyle: {
              width: 12,
              color: [[1, "rgba(128,128,128,0.25)"]] as [number, string][],
            },
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            valueAnimation: true,
            formatter: "{value}%",
            fontSize: 16,
            fontWeight: "bold" as const,
            fontFamily: "inherit",
            offsetCenter: [0, "10%"],
            color,
          },
          title: {
            offsetCenter: [0, "42%"],
            fontSize: 11,
          },
          data: [{ value: percent, name: label }],
        },
      ],
    }
  }

  const { domRef: cpuRef, setOptions: setCpu } = useEcharts(() => gaugeOption("CPU", 0))
  const { domRef: memRef, setOptions: setMem } = useEcharts(() => gaugeOption($t("page.home.dashboard.memory"), 0))
  const { domRef: diskRef, setOptions: setDisk } = useEcharts(() => gaugeOption($t("page.home.dashboard.disk"), 0))

  watch(
    () => props.resources,
    (r) => {
      setCpu(gaugeOption("CPU", r.cpuPercent))
      setMem(gaugeOption($t("page.home.dashboard.memory"), r.memoryPercent))
      setDisk(gaugeOption($t("page.home.dashboard.disk"), r.diskPercent))
    },
    { deep: true },
  )

  const netInfo = computed(() => {
    const format = (bytes: number) => {
      if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB/s`
      if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB/s`
      return `${(bytes / 1024).toFixed(1)} KB/s`
    }
    return {
      sent: format(props.resources.netSent),
      recv: format(props.resources.netRecv),
    }
  })
</script>

<template>
  <NCard :bordered="false" class="card-wrapper h-full">
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between mb-8px">
        <div class="flex items-center gap-8px text-15px font-600">
          <SvgIcon icon="carbon:bare-metal-server" class="text-16px text-primary" />
          {{ $t("page.home.dashboard.serverResources") }}
        </div>
        <NSelect
          v-if="showSelector"
          :value="props.selectedInstance"
          :options="instanceOptions"
          size="tiny"
          class="w-auto max-w-160px"
          :consistent-menu-width="false"
          @update:value="emit('update:selectedInstance', $event)"
        />
      </div>

      <div class="flex-1 flex flex-col justify-center">
        <div class="grid grid-cols-3 gap-4px">
          <div ref="cpuRef" class="h-110px" />
          <div ref="memRef" class="h-110px" />
          <div ref="diskRef" class="h-110px" />
        </div>

        <div class="flex gap-12px mt-4px pt-10px border-t border-[var(--border-color)]">
          <div class="flex-1 flex items-center gap-6px px-10px py-6px rd-8px bg-[var(--n-color-modal)]">
            <SvgIcon icon="carbon:arrow-up" class="text-14px text-success" />
            <span class="text-12px text-[var(--text-color-3)]">{{ $t("page.home.dashboard.netSent") }}</span>
            <span class="text-13px font-500 tabular-nums">{{ netInfo.sent }}</span>
          </div>
          <div class="flex-1 flex items-center gap-6px px-10px py-6px rd-8px bg-[var(--n-color-modal)]">
            <SvgIcon icon="carbon:arrow-down" class="text-14px text-primary" />
            <span class="text-12px text-[var(--text-color-3)]">{{ $t("page.home.dashboard.netRecv") }}</span>
            <span class="text-13px font-500 tabular-nums">{{ netInfo.recv }}</span>
          </div>
        </div>
      </div>
    </div>
  </NCard>
</template>
