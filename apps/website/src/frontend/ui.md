# UI 组件与主题

::: info
本项目前端基于 [Soybean Admin](https://github.com/soybeanjs/soybean-admin)
开发。基础功能和约定请参考 [Soybean Admin 文档](https://docs.soybeanjs.cn/zh/)。
:::

## Naive UI

项目使用 [Naive UI](https://www.naiveui.com/) 2.44 作为组件库。

### 自动导入

通过 `unplugin-vue-components` 配合 `NaiveUiResolver` 实现组件自动导入，无需手动 import：

```vue
<template>
  <!-- 直接使用，无需导入 -->
  <NButton type="primary">按钮</NButton>
  <NDataTable :columns="columns" :data="data" />
</template>
```

自动导入的类型声明生成到 `src/typings/components.d.ts`。

### 全局配置

Naive UI 通过 `NConfigProvider` 提供全局配置，包括：

- **主题** -- 由 Theme Store 的 `naiveTheme` 计算属性提供，包含自定义的主题色覆盖
- **语言** -- 跟随应用语言切换
- **日期语言** -- 日期组件的本地化

## UnoCSS

项目使用 [UnoCSS](https://unocss.dev/) 66 作为原子化 CSS 引擎。

### 预设配置

| 预设                                | 说明                                         |
| ----------------------------------- | -------------------------------------------- |
| `@unocss/preset-uno`                | UnoCSS 默认预设                              |
| `@unocss/preset-wind3`              | Tailwind CSS 兼容预设                        |
| `@unocss/preset-icons`              | 图标预设，支持 Iconify 集合和本地 SVG        |
| `@unocss/transformer-directives`    | 支持 `@apply` 等 CSS 指令                    |
| `@unocss/transformer-variant-group` | 支持变体分组语法 `hover:(bg-red text-white)` |

### 使用示例

```vue
<template>
  <div class="flex items-center gap-4 p-4">
    <span class="text-primary font-bold text-16px">标题</span>
    <span class="text-gray-500 hover:text-primary transition-colors">描述</span>
  </div>
</template>
```

## 主题系统

### 主题模式

支持三种主题模式，通过 Theme Store 的 `themeScheme` 控制：

| 模式    | 说明                                                    |
| ------- | ------------------------------------------------------- |
| `light` | 浅色主题                                                |
| `dark`  | 深色主题                                                |
| `auto`  | 跟随操作系统偏好（通过 `usePreferredColorScheme` 检测） |

切换主题时，通过 `toggleCssDarkMode()` 动态更新 CSS 类名。

### 色彩定制

项目支持自定义 5 种主题色：

| 色彩 Key  | 说明   | 默认用途                   |
| --------- | ------ | -------------------------- |
| `primary` | 主色   | 按钮、链接、高亮           |
| `info`    | 信息色 | 提示信息（可设置跟随主色） |
| `success` | 成功色 | 成功状态                   |
| `warning` | 警告色 | 警告状态                   |
| `error`   | 错误色 | 错误状态                   |

颜色变更后，`@rapidkit/color` 包的 `getPaletteColorByNumber` 会生成推荐色板，并通过 `setupThemeVarsToGlobal()` 注入 CSS
变量。

### 布局模式

通过 `setThemeLayout(mode)` 切换，支持多种布局：

- **vertical** -- 左侧菜单垂直布局
- **horizontal** -- 顶部菜单水平布局
- **mix** -- 混合布局（顶部一级菜单 + 左侧二级菜单）

移动端检测到小屏幕后，自动切换为 `vertical` 布局。

### 辅助显示模式

- **灰度模式**（Grayscale）-- 整体灰度显示
- **色弱模式**（Colour Weakness）-- 色弱友好显示

## 图标系统

项目支持两种图标使用方式：

### 1. Iconify 图标（推荐）

通过 `unplugin-icons` 实现按需加载，支持 Iconify 所有图标集：

```vue
<template>
  <!-- 作为 Vue 组件使用 -->
  <icon-mdi-home class="text-20px" />

  <!-- 通过 UnoCSS 类名使用 -->
  <span class="icon-mdi-home text-20px" />
</template>
```

### 2. 本地 SVG 图标

将 SVG 文件放到 `src/assets/svg-icon/` 目录下，通过 `vite-plugin-svg-icons` 生成雪碧图：

```vue
<template>
  <!-- 使用本地 SVG 图标（前缀为 icon-local） -->
  <icon-local-logo class="text-24px" />
</template>
```

### 图标前缀规则

| 前缀         | 环境变量                 | 说明              |
| ------------ | ------------------------ | ----------------- |
| `icon`       | `VITE_ICON_PREFIX`       | Iconify 图标前缀  |
| `icon-local` | `VITE_ICON_LOCAL_PREFIX` | 本地 SVG 图标前缀 |

## 自动导入的组件

`unplugin-vue-components` 配置了以下自动解析器：

| 解析器            | 说明                                        |
| ----------------- | ------------------------------------------- |
| `NaiveUiResolver` | Naive UI 组件自动导入                       |
| `IconsResolver`   | 图标组件自动导入（支持 Iconify 和本地集合） |

自动导入还包括 Vue Router 的 `RouterLink` 和 `RouterView` 组件。

## 自定义组件

项目在 Naive UI 基础上封装了一些业务组件，位于 `src/components/` 目录下。这些组件同样通过 `unplugin-vue-components`
自动导入，无需手动 import。

::: tip
自定义组件建议使用 `S` 前缀命名（如 `STable`），以区分 Naive UI 原生组件（`N` 前缀）和业务组件。
:::
