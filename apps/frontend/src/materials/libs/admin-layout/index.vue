<script setup lang="ts">
  import { computed, ref } from "vue"
  import { useResizeObserver } from "@vueuse/core"
  import type { AdminLayoutProps } from "../../types"
  import { LAYOUT_MAX_Z_INDEX, LAYOUT_SCROLL_EL_ID, createLayoutCssVars } from "./shared"
  import styleModule from "./index.module.css"

  defineOptions({
    name: "AdminLayout",
  })

  const style = styleModule

  const props = withDefaults(defineProps<AdminLayoutProps>(), {
    mode: "vertical",
    scrollMode: "content",
    scrollElId: LAYOUT_SCROLL_EL_ID,
    commonClass: "transition-all-300",
    fixedTop: true,
    maxZIndex: LAYOUT_MAX_Z_INDEX,
    headerVisible: true,
    bannerVisible: false,
    headerHeight: 56,
    tabVisible: true,
    tabHeight: 48,
    siderVisible: true,
    siderCollapse: false,
    siderWidth: 220,
    siderCollapsedWidth: 64,
    footerVisible: true,
    footerHeight: 48,
    rightFooter: false,
  })

  interface Emits {
    /** Update siderCollapse */
    (e: "update:siderCollapse", collapse: boolean): void
  }

  const emit = defineEmits<Emits>()
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  type SlotFn = (props?: Record<string, unknown>) => any

  type Slots = {
    /** Main */
    default?: SlotFn
    /** Header */
    header?: SlotFn
    banner?: SlotFn
    /** Tab */
    tab?: SlotFn
    /** Sider */
    sider?: SlotFn
    /** Footer */
    footer?: SlotFn
  }

  const slots = defineSlots<Slots>()

  const bannerElement = ref<HTMLElement>()
  const bannerHeight = ref(0)
  useResizeObserver(bannerElement, ([entry]) => {
    bannerHeight.value = entry?.borderBoxSize[0]?.blockSize ?? entry?.contentRect.height ?? 0
  })
  const showBanner = computed(() => Boolean(slots.banner) && props.bannerVisible)
  const siderPositionStyle = {
    top: "var(--soy-banner-height)",
    height: "calc(100% - var(--soy-banner-height))",
  }
  const cssVars = computed(() => ({
    ...createLayoutCssVars(props),
    "--soy-banner-height": `${showBanner.value ? bannerHeight.value : 0}px`,
    "--soy-visible-header-height": `${!props.fullContent && showHeader.value ? props.headerHeight : 0}px`,
  }))

  // config visible
  const showHeader = computed(() => Boolean(slots.header) && props.headerVisible)
  const showTab = computed(() => Boolean(slots.tab) && props.tabVisible)
  const showSider = computed(() => !props.isMobile && Boolean(slots.sider) && props.siderVisible)
  const showMobileSider = computed(() => props.isMobile && Boolean(slots.sider) && props.siderVisible)
  const showFooter = computed(() => Boolean(slots.footer) && props.footerVisible)

  // scroll mode
  const isWrapperScroll = computed(() => props.scrollMode === "wrapper")
  const isContentScroll = computed(() => props.scrollMode === "content")

  // layout direction
  const isVertical = computed(() => props.mode === "vertical")
  const isHorizontal = computed(() => props.mode === "horizontal")

  const fixedHeaderAndTab = computed(
    () => showBanner.value || props.fixedTop || (isHorizontal.value && isWrapperScroll.value),
  )

  // css
  const leftGapClass = computed(() => {
    if (!props.fullContent && showSider.value) {
      return props.siderCollapse ? style["left-gap_collapsed"] : style["left-gap"]
    }

    return ""
  })

  const headerLeftGapClass = computed(() => (isVertical.value ? leftGapClass.value : ""))

  const footerLeftGapClass = computed(() => {
    const condition1 = isVertical.value
    const condition2 = isHorizontal.value && isWrapperScroll.value && !props.fixedFooter
    const condition3 = Boolean(isHorizontal.value && props.rightFooter)

    if (condition1 || condition2 || condition3) {
      return leftGapClass.value
    }

    return ""
  })

  const siderPaddingClass = computed(() => {
    let cls = ""

    if (showHeader.value && !headerLeftGapClass.value) {
      cls += style["sider-padding-top"]
    }
    if (showFooter.value && !footerLeftGapClass.value) {
      cls += ` ${style["sider-padding-bottom"]}`
    }

    return cls
  })

  function handleClickMask() {
    emit("update:siderCollapse", true)
  }
</script>

<template>
  <div class="relative h-full" :class="[commonClass]" :style="cssVars">
    <div
      :id="isWrapperScroll ? scrollElId : undefined"
      class="h-full flex flex-col"
      :class="[commonClass, scrollWrapperClass, { 'overflow-y-auto': isWrapperScroll }]"
    >
      <template v-if="showBanner">
        <div ref="bannerElement" class="absolute left-0 w-full bg-container" :class="style['layout-banner']">
          <slot name="banner"></slot>
        </div>
        <div class="shrink-0" :style="{ height: `${bannerHeight}px` }"></div>
      </template>

      <!-- Header -->
      <template v-if="showHeader">
        <header
          v-show="!fullContent"
          class="flex-shrink-0"
          :class="[
            style['layout-header'],
            commonClass,
            headerLeftGapClass,
            { 'absolute left-0 w-full': fixedHeaderAndTab },
          ]"
        >
          <slot name="header"></slot>
        </header>
        <div
          v-show="!fullContent && fixedHeaderAndTab"
          class="flex-shrink-0 overflow-hidden"
          :class="[style['layout-header-placement']]"
        ></div>
      </template>

      <!-- Tab -->
      <template v-if="showTab">
        <div
          class="flex-shrink-0"
          :class="[
            style['layout-tab'],
            commonClass,
            tabClass,
            leftGapClass,
            { 'absolute left-0 w-full': fixedHeaderAndTab },
          ]"
        >
          <slot name="tab"></slot>
        </div>
        <div
          v-show="fullContent || fixedHeaderAndTab"
          class="flex-shrink-0 overflow-hidden"
          :class="[style['layout-tab-placement']]"
        ></div>
      </template>

      <!-- Sider -->
      <template v-if="showSider">
        <aside
          v-show="!fullContent"
          class="absolute left-0"
          :style="siderPositionStyle"
          :class="[
            commonClass,
            siderClass,
            siderPaddingClass,
            siderCollapse ? style['layout-sider_collapsed'] : style['layout-sider'],
          ]"
        >
          <slot name="sider"></slot>
        </aside>
      </template>

      <!-- Mobile Sider -->
      <template v-if="showMobileSider">
        <aside
          class="absolute left-0 w-0 bg-white"
          :style="siderPositionStyle"
          :class="[
            commonClass,
            mobileSiderClass,
            style['layout-mobile-sider'],
            siderCollapse ? 'overflow-hidden' : style['layout-sider'],
          ]"
        >
          <slot name="sider"></slot>
        </aside>
        <div
          v-show="!siderCollapse"
          class="absolute left-0 w-full bg-[rgba(0,0,0,0.2)]"
          :style="siderPositionStyle"
          :class="[style['layout-mobile-sider-mask']]"
          @click="handleClickMask"
        ></div>
      </template>

      <!-- Main Content -->
      <main
        :id="isContentScroll ? scrollElId : undefined"
        class="flex flex-col flex-grow"
        :class="[commonClass, contentClass, leftGapClass, { 'overflow-y-auto': isContentScroll }]"
      >
        <slot></slot>
      </main>

      <!-- Footer -->
      <template v-if="showFooter">
        <footer
          v-show="!fullContent"
          class="flex-shrink-0"
          :class="[
            style['layout-footer'],
            commonClass,
            footerClass,
            footerLeftGapClass,
            { 'absolute left-0 bottom-0 w-full': fixedFooter },
          ]"
        >
          <slot name="footer"></slot>
        </footer>
        <div
          v-show="!fullContent && fixedFooter"
          class="flex-shrink-0 overflow-hidden"
          :class="[style['layout-footer-placement']]"
        ></div>
      </template>
    </div>
  </div>
</template>

<style scoped></style>
