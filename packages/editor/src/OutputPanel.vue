<script setup lang="ts">
  import { computed, type CSSProperties } from "vue"
  import type { OutputPanelProps, OutputStatus } from "./types"

  const props = withDefaults(defineProps<OutputPanelProps>(), {
    output: "",
    error: null,
    status: "idle",
    runtime: null,
    theme: "vs-dark",
  })

  const isDark = computed(() => props.theme === "vs-dark")

  const statusText = computed(() => {
    switch (props.status) {
      case "idle":
        return "Ready"
      case "running":
        return "Running..."
      case "success":
        return props.runtime != null ? `Done in ${props.runtime.toFixed(2)}s` : "Done"
      case "error":
        return props.runtime != null ? `Failed in ${props.runtime.toFixed(2)}s` : "Failed"
      default:
        return ""
    }
  })

  type StatusColorItem = { color: string; bg: string }
  type StatusColorSet = Record<OutputStatus, StatusColorItem>

  const statusColorMap: Record<"dark" | "light", StatusColorSet> = {
    dark: {
      idle: { color: "#666", bg: "transparent" },
      running: { color: "#dcdcaa", bg: "rgba(220,220,170,0.08)" },
      success: { color: "#6a9955", bg: "rgba(106,153,85,0.1)" },
      error: { color: "#f44747", bg: "rgba(244,71,71,0.1)" },
    },
    light: {
      idle: { color: "#999", bg: "transparent" },
      running: { color: "#b58900", bg: "rgba(181,137,0,0.08)" },
      success: { color: "#16a34a", bg: "rgba(22,163,74,0.08)" },
      error: { color: "#dc2626", bg: "rgba(220,38,38,0.08)" },
    },
  }

  const statusStyle = computed<CSSProperties>(() => {
    const map = isDark.value ? statusColorMap.dark : statusColorMap.light
    const s = map[props.status as OutputStatus] ?? map.idle
    return {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "2px 8px",
      borderRadius: "10px",
      fontSize: "11px",
      fontWeight: "500",
      color: s.color,
      background: s.bg,
      transition: "color 0.3s, background 0.3s",
    }
  })

  const dotStyle = computed<CSSProperties>(() => {
    const successColor = isDark.value ? "#6a9955" : "#16a34a"
    const errorColor = isDark.value ? "#f44747" : "#dc2626"
    const color = props.status === "success" ? successColor : errorColor
    return {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 4px ${color}80`,
    }
  })

  const panelStyle = computed<CSSProperties>(() => ({
    display: "flex",
    flexDirection: "column",
    border: `1px solid ${isDark.value ? "#2d2d2d" : "#e5e5e5"}`,
    borderRadius: "6px",
    overflow: "hidden",
    background: isDark.value ? "#1e1e1e" : "#ffffff",
    color: isDark.value ? "#d4d4d4" : "#1e1e1e",
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
    fontSize: "13px",
    boxShadow: isDark.value ? "0 2px 8px rgba(0,0,0,0.2)" : "0 2px 8px rgba(0,0,0,0.05)",
  }))

  const headerStyle = computed<CSSProperties>(() => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 14px",
    background: isDark.value ? "#252526" : "#f8f8f8",
    borderBottom: `1px solid ${isDark.value ? "#2d2d2d" : "#e5e5e5"}`,
    fontSize: "12px",
    userSelect: "none",
  }))

  const titleStyle = computed<CSSProperties>(() => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    color: isDark.value ? "#7a7a7a" : "#999",
  }))

  const bodyStyle: CSSProperties = {
    padding: "10px 14px",
    overflow: "auto",
    maxHeight: "300px",
    minHeight: "60px",
  }

  const preStyle = computed<CSSProperties>(() => ({
    margin: "0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    lineHeight: "1.6",
    color: isDark.value ? "#d4d4d4" : "#1e1e1e",
  }))

  const placeholderStyle = computed<CSSProperties>(() => ({
    ...preStyle.value,
    color: isDark.value ? "#555" : "#bbb",
    fontStyle: "italic",
  }))

  const errorTextStyle = computed<CSSProperties>(() => ({
    ...preStyle.value,
    color: isDark.value ? "#f44747" : "#dc2626",
    borderLeft: `2px solid ${isDark.value ? "rgba(244,71,71,0.4)" : "rgba(220,38,38,0.3)"}`,
    paddingLeft: "10px",
  }))

  const spinnerStyle: CSSProperties = {
    display: "inline-block",
    width: "10px",
    height: "10px",
    border: "1.5px solid currentColor",
    borderTopColor: "transparent",
    borderRadius: "50%",
    animation: "me-spin 0.8s linear infinite",
  }
</script>

<template>
  <div :style="panelStyle">
    <div :style="headerStyle">
      <span :style="titleStyle">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" :style="{ opacity: 0.6 }">
          <path d="M2 3.5L7 8l-5 4.5V3.5zM8.5 12.5h5v1h-5v-1z" />
        </svg>
        Output
      </span>
      <span :style="statusStyle">
        <span v-if="status === 'running'" :style="spinnerStyle" />
        <span v-else-if="status === 'success' || status === 'error'" :style="dotStyle" />
        {{ statusText }}
      </span>
    </div>
    <div :style="bodyStyle">
      <pre v-if="status === 'idle'" :style="placeholderStyle">Press Ctrl+Enter to run</pre>
      <pre v-else-if="status === 'running'" :style="placeholderStyle">Executing...</pre>
      <template v-else>
        <pre v-if="output" :style="preStyle">{{ output }}</pre>
        <pre v-if="error" :style="errorTextStyle">{{ error }}</pre>
        <pre v-if="!output && !error" :style="placeholderStyle">(no output)</pre>
      </template>
    </div>
  </div>
</template>
