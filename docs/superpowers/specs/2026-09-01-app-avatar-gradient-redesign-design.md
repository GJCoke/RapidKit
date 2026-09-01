# AppAvatar 飞书式渐变重构设计

## 背景

现有 `AppAvatar` 使用稳定单色底色，并叠加最高 42% 不透明度的白色斜向高光。该实现能提供确定性颜色，但视觉上更接近带高光的单色圆形，无法呈现参考头像中大面积、平滑且具有明显色相流动的双端渐变。

本次设计仅重构 `AppAvatar` 的文字兜底头像。图片头像、调用方、其他直接使用 `NAvatar` 的业务组件及后端数据结构均不在范围内。

## 目标

- 文字头像呈现飞书式的大面积双端渐变。
- 蓝到青、红到橙、紫到粉等色组具有明确但平滑的色相变化。
- 不使用白色高光、内阴影、外投影或玻璃质感。
- 同一稳定种子始终映射到同一渐变色组。
- 连续或相似的用户 ID 能够较均匀地分布到色组。
- 图片头像及图片加载失败后的降级语义保持不变。
- 32px、40px 和 42px 常用尺寸下文字清晰、居中且具有足够对比度。

## 非目标

- 不迁移项目中其他直接使用 `NAvatar` 的位置。
- 不修改头像 URL、用户模型、接口或数据库。
- 不增加用户手动选择头像颜色的能力。
- 不随机改变渐变角度或为同一用户生成动态颜色。
- 不修改名称字符提取规则。

## 渐变色板

单色常量替换为版本化的渐变色对。第一版使用八组颜色，覆盖主要色相，同时保持现代、清晰和高饱和的产品感：

```ts
export const AVATAR_GRADIENT_PALETTE_V2 = [
  { start: "#5B5CF6", end: "#22B8E6" }, // 蓝 → 青
  { start: "#3B82F6", end: "#20C997" }, // 蓝 → 绿青
  { start: "#8B5CF6", end: "#E48AD8" }, // 紫 → 粉
  { start: "#6D5DF6", end: "#B56DE2" }, // 靛紫 → 淡紫
  { start: "#FF4D4F", end: "#FF9F43" }, // 红 → 橙
  { start: "#F05A67", end: "#F7B267" }, // 珊瑚红 → 杏橙
  { start: "#16A085", end: "#35C98B" }, // 青绿 → 绿
  { start: "#0F8FA8", end: "#35BFD3" }, // 深青 → 亮青
] as const
```

色板属于前端视觉规则，不写入用户数据。V2 发布后不修改颜色或排列；未来调整使用新的版本化色板，避免同一用户在无意中更换颜色。

## 渐变模型

所有文字头像使用统一方向：

```css
background: linear-gradient(
  145deg,
  var(--avatar-gradient-start) 0%,
  var(--avatar-gradient-end) 100%
);
```

固定方向让整个应用的头像具有一致视觉语言，并与参考图的大范围斜向色相过渡保持一致。组件不叠加白色透明层、内高光、纹理或阴影。视觉层次完全来自两端颜色。

图片头像不应用该背景。只有 `src` 为空或图片加载失败、组件进入文字或通用图标降级状态时才显示渐变。

## 稳定哈希

现有 FNV-1a 映射替换为带最终 avalanche 混合的稳定 32 位哈希。处理流程：

```text
有效 seed
  → UTF-16 code unit 迭代混合
  → 32 位 avalanche
  → 无符号整数
  → hash % AVATAR_GRADIENT_PALETTE_V2.length
```

要求：

- `seed` 存在时始终优先使用 `String(seed)`。
- `seed` 缺失时使用规范化名称。
- 两者都为空时使用固定的默认渐变，而不是随机值。
- 算法不得调用 `Math.random()`，也不得依赖运行时或浏览器状态。
- 测试使用固定输入输出向量锁定算法。
- 连续测试种子应覆盖多个色组，避免低位分布导致明显聚集。

头像工具函数从返回单个颜色改为返回不可变渐变对象：

```ts
interface AvatarGradient {
  readonly start: string
  readonly end: string
}

function getAvatarGradient(
  seed?: string | number | null,
  name?: string | null,
): AvatarGradient
```

旧的 `getAvatarColor`、`AVATAR_PALETTE_V1` 和 `AVATAR_DEFAULT_COLOR` 在项目内无其他消费者后移除，不保留双轨实现。

## AppAvatar 呈现

`AppAvatar` 继续负责图片优先和文字降级。文字态将 `getAvatarGradient` 的结果写入两个 CSS 变量：

```ts
{
  "--avatar-gradient-start": gradient.start,
  "--avatar-gradient-end": gradient.end,
}
```

文字保持纯白色，字重由 700 调整为 600，字号仍按组件尺寸计算并保留合理上下限。中文与英文继续复用现有字符提取逻辑；无可用字符时仍显示通用用户图标。

不改变组件 props、默认尺寸、圆形控制、`alt`、`aria-label`、图片错误处理或 `src` 更新后的重试逻辑。

## 错误与兼容

- 图片 URL 有效时仅显示图片，渐变不得覆盖或染色图片。
- 图片加载失败时切换到对应用户的稳定渐变文字头像。
- `src` 更新后继续重试新图片，失败状态不跨 URL 保留。
- 空名称使用默认渐变与通用用户图标。
- 相同 ID 改名后渐变不变。
- 不新增 CSS 特性兼容负担；实现只依赖标准 `linear-gradient` 和 CSS 自定义属性。

## 测试

### 头像工具测试

- 固定输入向量锁定新 32 位哈希结果。
- 相同种子始终返回同一 V2 渐变对象。
- ID 不变、名称变化时渐变不变。
- 缺少种子时规范化名称产生稳定结果。
- 种子和名称均为空时返回固定默认渐变。
- 一组连续种子能够分布到多个色组。
- 返回值只来自 `AVATAR_GRADIENT_PALETTE_V2`。

### 组件与视觉验证

- 图片成功时不显示文字渐变。
- 无图片及图片失败时正确注入两个渐变 CSS 变量。
- 32px、40px、42px 下中英文文字均不裁切。
- 浅色与深色主题下白字保持清晰可读。
- 组件不存在旧白色高光、内阴影或外投影。
- 现有图片错误恢复、可访问性和圆角行为保持通过。

## 实施边界

本次实施只修改：

- `apps/frontend/src/utils/avatar.ts`
- `apps/frontend/src/utils/avatar.test.ts`
- `apps/frontend/src/components/common/app-avatar.vue`
- 与 `AppAvatar` 直接相关且确有必要的测试

不修改调用方接口，不批量迁移其他头像组件，也不调整后端。
