# @rapidkit/color

颜色工具库,提供色板生成、颜色转换、颜色命名等能力。主要服务于前端主题系统的动态色板计算。

## 安装与引用

```jsonc
// package.json
{
  "dependencies": {
    "@rapidkit/color": "workspace:*",
  },
}
```

```ts
import {
  getColorPalette,
  getPaletteColorByNumber,
  getHex,
  getRgb,
  getHsl,
  addColorAlpha,
  mixColor,
  isValidColor,
  getColorName,
  colorPalettes,
} from "@rapidkit/color"
```

## 依赖关系

| 依赖                              | 用途                               |
| --------------------------------- | ---------------------------------- |
| `colord` + 插件 (names, mix, lab) | 颜色解析、转换、混合、Delta-E 计算 |
| `@rapidkit/utils`                 | 间接依赖                           |

## 导出一览

### 色板生成

| 导出                                                   | 说明                                       |
| ------------------------------------------------------ | ------------------------------------------ |
| `getColorPalette(color, recommended?)`                 | 根据给定颜色生成完整色板(Map: 色号 -> Hex) |
| `getPaletteColorByNumber(color, number, recommended?)` | 获取色板中指定色号的颜色                   |
| `colorPalettes`                                        | 预置色板常量(Slate, Gray, Red, Orange 等)  |

色板色号范围: `50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950`,其中 **500** 为主色。

#### 两种色板算法

- **Ant Design 算法**(`recommended = false`,默认): 基于 Ant Design 的色板生成规则
- **推荐算法**(`recommended = true`): 从预置色板中寻找最接近的颜色族,提供更协调的色彩搭配

```ts
// 生成色板
const palette = getColorPalette("#1890ff")
palette.get(500) // 主色
palette.get(100) // 浅色变体

// 直接获取某一色号
const light = getPaletteColorByNumber("#1890ff", 200)
```

### 颜色转换与工具函数

| 导出                                                | 说明                               |
| --------------------------------------------------- | ---------------------------------- |
| `isValidColor(color)`                               | 校验颜色值是否合法                 |
| `getHex(color)`                                     | 转换为 Hex 格式                    |
| `getRgb(color)`                                     | 转换为 RGB 对象                    |
| `getHsl(color)`                                     | 转换为 HSL 对象                    |
| `getHsv(color)`                                     | 转换为 HSV 对象                    |
| `addColorAlpha(color, alpha)`                       | 添加透明度                         |
| `mixColor(color1, color2, ratio)`                   | 按比例混合两种颜色                 |
| `transformColorWithOpacity(color, alpha, bgColor?)` | 将带透明度的颜色转换为不透明等效色 |
| `isWhiteColor(color)`                               | 判断是否为白色                     |
| `getDeltaE(color1, color2)`                         | 计算两色的 Delta-E 色差            |
| `transformHslToHex(hsl)`                            | HSL 对象转 Hex                     |

### 颜色命名

| 导出                  | 说明                               |
| --------------------- | ---------------------------------- |
| `getColorName(color)` | 根据颜色值返回最接近的英文颜色名称 |

```ts
getColorName("#ff6347") // "Tomato"
getColorName("#1890ff") // 匹配最接近的命名色
```

## 类型定义

```ts
type ColorPaletteNumber = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950
type ColorPalette = { hex: string; number: ColorPaletteNumber }
type ColorPaletteFamily = { name: string; palettes: ColorPalette[] }
type ColorIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
```

::: tip
前端主题系统通过 `getColorPalette` 动态生成主题色的完整色阶,并将其注入 CSS 变量,实现运行时主题切换。
:::
