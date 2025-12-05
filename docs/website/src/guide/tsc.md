## TypeScript 类型检查使用指南

本项目采用 **TypeScript** 开发，根目录和各子项目均有 `tsconfig.json` 配置，子项目的 `tsconfig` 会继承根目录的配置。

通过 **Turborepo** 统一管理和执行类型检查，保证多包一致性和高效构建。

## tsconfig 结构

- **根目录 tsconfig.json**
  - 定义全局 TypeScript 配置，例如 `strict`、`target`、`module`、`paths` 等
  - 子项目通过 `extends` 继承根配置，避免重复配置

- **子项目 tsconfig.json**
  - 继承根目录 tsconfig
  - 可针对本项目特性覆盖部分配置，例如 `include`、`exclude` 或特定路径别名
  - 示例继承方式：
  ```json
  {
    "extends": "../../tsconfig.json",
    "compilerOptions": {
      "outDir": "dist"
    },
    "include": ["src"]
  }
  ```

## Turborepo 检查方式

- 项目中使用 **Turborepo** 进行任务调度和并行执行
- 通过 `turbo run typecheck` 或自定义 script 对子项目执行类型检查
- 每个子项目可以独立使用自己的 `tsconfig.json`，确保针对该包的类型检查准确

### 示例检查流程

1. Turborepo 遍历各子项目
2. 调用 `tsc --noEmit`
   - `--noEmit` 表示只做类型检查，不输出编译文件
3. 任务缓存机制：

- 如果子项目没有代码变更，则跳过类型检查
- 提升 CI/CD 效率

## 本地开发类型检查

- 可以在子项目目录执行类型检查，确保修改不会破坏类型安全

```bash
pnpm typecheck -F @monorepo-exmaple/frontend
```

- 支持并行执行，加速大型 Monorepo 项目类型检查

```bash
pnpm typecheck
```

## VSCode 集成

- VSCode 会自动识别根 tsconfig 和子项目 tsconfig
- 建议使用 **workspace** 打开整个 Monorepo，确保类型检查覆盖所有子项目
- 可以在编辑器中实时显示类型错误，提高开发效率

## 注意事项

- 子项目 tsconfig 必须继承根目录 tsconfig，保证全局规则一致
- 不同子项目可以覆盖部分配置，例如 `paths` 或 `strict` 级别
- 使用 Turborepo 时，请确保 task pipeline 中包括 `typecheck` 任务，以实现增量检查

## 总结

- 根 tsconfig 统一全局配置，子项目继承并可局部覆盖
- Turborepo 提供高性能增量检查和并行执行
- 支持单项目或全局类型检查
- VSCode 集成可实时提示类型错误，提高开发体验
- 配合 ESLint/Prettier 形成完整静态分析与代码质量保障

此文档可作为团队开发规范，确保 Monorepo 项目在多子项目、多包场景下的 TypeScript 类型检查统一和高效。
