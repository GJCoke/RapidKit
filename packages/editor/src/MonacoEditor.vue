<script setup lang="ts">
  import { ref, computed, onMounted, onBeforeUnmount, watch, shallowRef, type CSSProperties } from "vue"
  import * as monaco from "monaco-editor"
  import type { MonacoEditorProps } from "./types"

  const props = withDefaults(defineProps<MonacoEditorProps>(), {
    modelValue: "",
    language: "python",
    theme: "vs-dark",
    readOnly: false,
    minimap: true,
    height: "100%",
  })

  const emit = defineEmits<{
    "update:modelValue": [value: string]
    save: []
    run: []
  }>()

  const containerRef = ref<HTMLDivElement>()
  const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor>()
  const isFocused = ref(false)

  let isUpdatingFromProps = false

  const isDark = computed(() => props.theme === "vs-dark")

  const wrapperStyle = computed<CSSProperties>(() => {
    const borderDefault = isDark.value ? "#2d2d2d" : "#e0e0e0"
    const focusBorder = isDark.value ? "#569cd6" : "#1677ff"
    const shadow = isDark.value ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.06)"
    const focusShadow = isDark.value ? "rgba(86,156,214,0.3)" : "rgba(22,119,255,0.2)"

    return {
      height: props.height,
      width: "100%",
      border: `1px solid ${isFocused.value ? focusBorder : borderDefault}`,
      borderRadius: "6px",
      overflow: "hidden",
      boxShadow: isFocused.value ? `0 0 0 1px ${focusShadow}, 0 2px 8px ${shadow}` : `0 2px 8px ${shadow}`,
      transition: "border-color 0.2s, box-shadow 0.2s",
    }
  })

  function defineCustomThemes() {
    monaco.editor.defineTheme("editor-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A9955", fontStyle: "italic" },
        { token: "keyword", foreground: "C586C0" },
        { token: "string", foreground: "CE9178" },
        { token: "number", foreground: "B5CEA8" },
        { token: "type", foreground: "4EC9B0" },
        { token: "function", foreground: "DCDCAA" },
        { token: "variable", foreground: "9CDCFE" },
      ],
      colors: {
        "editor.background": "#1e1e1e",
        "editor.foreground": "#d4d4d4",
        "editor.lineHighlightBackground": "#2a2a2a",
        "editor.selectionBackground": "#264f78",
        "editor.inactiveSelectionBackground": "#3a3d41",
        "editorCursor.foreground": "#569cd6",
        "editorLineNumber.foreground": "#505050",
        "editorLineNumber.activeForeground": "#8a8a8a",
        "editorIndentGuide.background": "#2a2a2a",
        "editorIndentGuide.activeBackground": "#3a3a3a",
        "editorBracketMatch.background": "#0064001a",
        "editorBracketMatch.border": "#888888",
        "scrollbar.shadow": "#00000000",
        "scrollbarSlider.background": "#3e3e3e80",
        "scrollbarSlider.hoverBackground": "#4e4e4eaa",
        "scrollbarSlider.activeBackground": "#5e5e5ecc",
        "editorOverviewRuler.border": "#00000000",
        "minimap.background": "#1e1e1e",
      },
    })

    monaco.editor.defineTheme("editor-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "008000", fontStyle: "italic" },
        { token: "keyword", foreground: "AF00DB" },
        { token: "string", foreground: "A31515" },
        { token: "number", foreground: "098658" },
        { token: "type", foreground: "267F99" },
        { token: "function", foreground: "795E26" },
        { token: "variable", foreground: "001080" },
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#1e1e1e",
        "editor.lineHighlightBackground": "#f5f5f5",
        "editor.selectionBackground": "#add6ff",
        "editor.inactiveSelectionBackground": "#e5ebf1",
        "editorCursor.foreground": "#1677ff",
        "editorLineNumber.foreground": "#b0b0b0",
        "editorLineNumber.activeForeground": "#636363",
        "editorIndentGuide.background": "#eeeeee",
        "editorIndentGuide.activeBackground": "#d0d0d0",
        "editorBracketMatch.background": "#c9e6ca",
        "editorBracketMatch.border": "#b0b0b0",
        "scrollbar.shadow": "#00000000",
        "scrollbarSlider.background": "#c0c0c060",
        "scrollbarSlider.hoverBackground": "#a0a0a080",
        "scrollbarSlider.activeBackground": "#909090a0",
        "editorOverviewRuler.border": "#00000000",
        "minimap.background": "#ffffff",
      },
    })
  }

  const resolvedTheme = computed(() => (isDark.value ? "editor-dark" : "editor-light"))

  onMounted(() => {
    if (!containerRef.value) return

    defineCustomThemes()

    const editor = monaco.editor.create(containerRef.value, {
      value: props.modelValue,
      language: props.language,
      theme: resolvedTheme.value,
      readOnly: props.readOnly,
      minimap: {
        enabled: props.minimap,
        showSlider: "mouseover",
        scale: 2,
      },
      automaticLayout: false,
      fontSize: 14,
      lineHeight: 22,
      tabSize: 2,
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      renderLineHighlight: "all",
      bracketPairColorization: { enabled: true },
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      smoothScrolling: true,
      padding: { top: 12, bottom: 12 },
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
      fontLigatures: true,
      roundedSelection: true,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        verticalSliderSize: 8,
        useShadows: false,
      },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      guides: {
        indentation: true,
        bracketPairs: true,
      },
    })

    editorInstance.value = editor

    editor.onDidFocusEditorText(() => {
      isFocused.value = true
    })
    editor.onDidBlurEditorText(() => {
      isFocused.value = false
    })

    // Content change → emit v-model update
    editor.onDidChangeModelContent(() => {
      if (isUpdatingFromProps) return
      emit("update:modelValue", editor.getValue())
    })

    // Ctrl+S → save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      emit("save")
    })

    // Ctrl+Enter → run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      emit("run")
    })

    // ResizeObserver for auto layout
    const resizeObserver = new ResizeObserver(() => {
      editor.layout()
    })
    resizeObserver.observe(containerRef.value)

    onBeforeUnmount(() => {
      resizeObserver.disconnect()
      editor.dispose()
    })
  })

  // Sync modelValue prop → editor
  watch(
    () => props.modelValue,
    (newValue) => {
      const editor = editorInstance.value
      if (!editor) return
      if (editor.getValue() === newValue) return
      isUpdatingFromProps = true
      editor.setValue(newValue)
      isUpdatingFromProps = false
    },
  )

  // Sync language prop
  watch(
    () => props.language,
    (newLang) => {
      const editor = editorInstance.value
      if (!editor) return
      const model = editor.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, newLang)
      }
    },
  )

  // Sync theme prop — switch Monaco theme
  watch(
    () => props.theme,
    () => {
      monaco.editor.setTheme(resolvedTheme.value)
    },
  )

  // Sync readOnly prop
  watch(
    () => props.readOnly,
    (newVal) => {
      editorInstance.value?.updateOptions({ readOnly: newVal })
    },
  )

  // Sync minimap prop
  watch(
    () => props.minimap,
    (newVal) => {
      editorInstance.value?.updateOptions({ minimap: { enabled: newVal } })
    },
  )
</script>

<template>
  <div ref="containerRef" :style="wrapperStyle" />
</template>
