# Queue-depth snapshot schema repair

`capture_queue_depth` 每 300 秒读取 Worker 监听队列的长度，写入
`worker_queue_depth_snapshots`。缺少这张表时，每次采样都会在提交阶段失败。

当前初始化迁移 `453adcbe32a4` 包含该表，但旧数据库的 Worker 版本仍为
`1663b0955ade`，只有 Worker 和任务记录表。新初始化文件不会自动补齐旧库。

新增迁移 `c8f27d61a903` 接续当前初始化迁移，只创建缺失的快照表和三个索引。
已有表时直接返回，可重复执行；回退时保留该表，因为前置初始化迁移也拥有它。
旧 Worker、任务记录和已有快照均不修改。

迁移历史完整的数据库使用：

```bash
pnpm rapidkit db upgrade --plugin worker
```

当前本地数据库另外引用了仓库中已缺失的历史迁移 `826038026163`，因此项目 CLI
无法生成或应用迁移。本次在 PostgreSQL 事务中通过 Alembic `Operations` 执行
同一补表迁移，核对列和索引，并保留了全部原有 `alembic_version` 记录。
没有把数据库标记为已完成整个 Worker 迁移链。

历史迁移链仍需另行恢复；补表本身已经解决此任务的 `UndefinedTableError`。
修复验证覆盖旧库补表、重复执行、新库兼容、数据保留和真实数据库写入。
