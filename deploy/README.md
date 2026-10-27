# 可替换钩子的发布流程

`release.py` 是 Python 3.10+、Linux 上仅使用标准库的发布入口。它不导入示例，不读取 GitLab/阿里云变量，也不自动选择任何钩子。GitLab、ACR、SSH、Compose、PostgreSQL 和 OSS 的实际接入代码位于 `examples/`，必须显式配置后才会使用。

## 目录与入口

- `release.py`：钩子协议、构建清单、目标发布锁、阶段记录、备份门禁、失败恢复。
- `examples/gitlab/pipeline.yml`：GitLab tag 检查、构建及手动生产部署入口。
- `examples/aliyun/`：可实际执行的独立示例钩子及组合配置，见其 [接入说明](examples/aliyun/README.md)。
- `tests/`：独立钩子测试、示例命令边界测试、可选隔离 Docker 集成测试。

公共命令：

```bash
python3 deploy/release.py build --profile /path/to/profile.json \
  --source-root /path/to/repo --work-dir /path/to/new-bundle \
  --release-id COMMIT-PIPELINE --commit FULL_COMMIT_SHA --tag v1.2.3
python3 deploy/release.py dispatch --bundle /path/to/built-bundle --config-file /path/to/runtime.env
```

`build` 只运行构建和推送钩子，产物包含代码、显式选择的配置和无密钥清单。它不接收生产应用配置。每次 `dispatch` 复制构建产物并生成独立发布尝试 ID，使用相同镜像；原构建产物不写入密钥或生产配置。

目标端命令：

```bash
python3 /path/to/bundle/deploy/release.py release --root /srv/rapidkit-release --bundle /path/to/bundle
python3 /path/to/bundle/deploy/release.py status  --root /srv/rapidkit-release --bundle /path/to/bundle
python3 /path/to/bundle/deploy/release.py recover --root /srv/rapidkit-release --bundle /path/to/bundle
```

`adopt` 是已有生产的一次性显式导入，不能把找不到旧版本当成首次空安装。实际导入方式由运行钩子决定，Compose 示例提供独立命令。

## 发布顺序

目标锁覆盖全过程：

1. 校验必要钩子与清单，检查是否有未完成发布，保存本次代码及配置快照。
2. 拉取固定镜像，检查当前运行版本、配置、依赖和备份存储。
3. 进入维护，暂停调度并正常退出业务进程，确认停写。
4. 备份数据库，校验本地文件；上传、下载验证并提交完成标记。
5. **先记录迁移开始，再执行迁移**，确认实际版本等于目标版本。
6. 启动并验证新服务，提交运行状态，保存成功版本，解除维护。

迁移前失败会使用原发布的钩子及配置恢复旧版；恢复失败仍保持维护。迁移开始后的失败保持维护，并尽力停止新服务。显式恢复必须先由数据库钩子确认兼容性；核心不执行数据库降级或覆盖恢复。

目标目录的 `release.lock` 防止并发操作，`active.json` 阻止未完成发布被另一次发布覆盖，`releases/<id>/state.json` 保存阶段。目标进程中断后，即使文件锁已释放，未完成标记仍会阻止新的发布。不要通过删除标记绕过恢复检查。已完成记录与成功指针一致时，核心可以清理崩溃遗留的活动标记。代码及配置快照保存完整性校验，恢复前拒绝使用意外修改的快照。

如果旧应用因结构变化不能恢复，修复代码、构建新产物后，可显式执行 `dispatch --repair-from <失败ID>`。目标锁内确认没有迁移进程仍运行、保持维护并停写，再把未完成记录交接给新的发布尝试；新尝试仍须重新备份和校验。它继承“数据库可能已变化”的边界，预检/备份失败也不会恢复不兼容的旧应用。成功后旧记录保留 `superseded` 和 `repaired_by`。首次 adopt 的失败须先恢复 baseline，不能把未完成导入当成已有生产。

## 钩子协议 v1

显式配置，例如：

```json
{
  "version": 1,
  "hooks": {
    "storage": {
      "command": ["python3", "{bundle}/deploy/custom/storage.py"],
      "actions": ["preflight", "put", "verify", "commit", "get"],
      "env": ["CUSTOM_STORAGE_CONFIG"],
      "options": {"prefix": "production/backups"},
      "timeout": 1800
    }
  }
}
```

这是单个映射示意，真实发布需要补齐所有必要能力。每个钩子必须在 actions 中声明该能力的完整动作集合；缺项会在操作前失败。钩子可使用任何语言；一个程序可以实现多个动作。`{bundle}` 是当前代码快照根路径，代码放在 `deploy/` 下才能自动随发布包保存。构建钩子自行将运行所需的其他资源复制到 bundle；核心不复制 Docker 或云厂商专用文件。

调用不经过 shell：

```text
<command argv...> <action> --context /private/context.json --result /private/result.json
```

上下文包含：`version`、`release_id`、`capability`、`bundle`、`work_dir`、`manifest`、`options`、已有步骤的 `results`，以及阶段需要的 `root`、`env_file`、`previous`、`kind`、`repair_from`。`kind` 为 `adopt` 或 `release`；构建时另外提供 `source_root`。

钩子成功时退出 0，并写入：

```json
{
  "version": 1,
  "release_id": "本次发布ID",
  "capability": "storage",
  "action": "verify",
  "data": {
    "backup_id": "本次发布ID",
    "reference": "storage://backup/unique-id/",
    "verified": true
  }
}
```

失败退出非 0。核心不解析日志判断成功，必须有匹配版本、发布 ID、能力和动作的结果文件。超时会终止钩子进程组，不代表强杀业务容器；运行钩子必须遵守正常退出约定。日志保存在受限工作目录，钩子也不得输出密钥。失败时可写相同信封及已脱敏的 `error` 字符串；核心只公开这段显式错误，不公开原始命令输出。

环境只继承基础工具路径、语言设置及显式 `env` 白名单。配置钩子也可生成仅包含已声明目标凭据的 `bundle/credentials.json`；否则 dispatch 自动收集目标钩子白名单中的变量并交给传输钩子。更换存储钩子时无需把其凭据名称加入 SSH 钩子。按动作划分凭据时使用 `env_by_action`，例如仓库发布只获取推送身份，拉取只获取拉取身份。`options`、清单和结果中禁止放凭据内容。凭据文件路径、应用配置文件由钩子按需读取。白名单减少意外传递，不是恶意代码沙箱；钩子以部署权限运行，必须来自受信版本。

### 能力和结果

| 能力 | 动作 | 关键结果 |
| --- | --- | --- |
| build | build | 构建结果供 registry 消费；示例为 `images` |
| registry | publish / pull | `artifacts` 不可变引用 / `pulled: true` |
| config | materialize | 生成 `bundle/runtime.env`，返回 `env_file` 路径 |
| transport | dispatch / status | 调用目标侧核心，返回发布状态 |
| runtime | inspect | 当前运行信息；adopt 可返回 `artifacts` 和不含密钥的 `runtime` 信息 |
| runtime | preflight / adopt | `ready: true` / `adopted: true` |
| runtime | maintenance-on / maintenance-off | `maintenance: true` / `false` |
| runtime | drain / stop-candidate | 确认业务进程正常停止后返回 `stopped: true` |
| runtime | start / verify / commit / recover | `started` / `ready` / `committed` / `restored` 为 true |
| database | inspect | 当前版本（`revisions`）和 `migration_running` 布尔值；正在迁移时不得发布 |
| database | backup | `backup_id`、`files: [{path, sha256}]`、备份时版本 |
| database | migrate | 排序后的 `revisions` 和 `target_revisions`，二者必须一致且非空 |
| database | check-compatibility | `compatible: true` 才能显式恢复旧应用 |
| storage | preflight / put / verify / commit / get | `ready`；同一 `backup_id` 和 `reference`；`verified`；`complete`；下载结果 |

备份文件必须在本次 `work_dir` 内，核心重新计算 SHA-256。存储 put、verify、commit 必须指向同一备份；未验证不能迁移。`get` 供独立恢复操作调用，不会自动覆盖数据库。

## 更换一种实现

例如由 OSS 改用 S3：实现 `storage.py` 的相同输入输出，替换 `hooks.storage.command/env/options`，运行协议测试和隔离恢复验收。核心和其他钩子不变。

更换整个运行平台需要完整实现 runtime 的维护、停写、启动、验证和恢复能力；更换 CI 平台还需该平台的触发入口，不能只替换一条启动命令。

## 本地验证

```bash
.venv/bin/python -m pytest deploy/tests docker/tests -q
.venv/bin/ruff check deploy
.venv/bin/ruff format --check deploy
RUN_RELEASE_DOCKER_TESTS=1 .venv/bin/python -m pytest deploy/tests/test_docker_integration.py -q
```

最后一项需要本机 Docker，仅创建临时、无外部网络的测试容器，验证实际 PostgreSQL dump/restore、存储 CLI 模拟往返及 Nginx 维护响应；不访问 OSS 或生产服务器。真实 GitLab、ACR、SSH、OSS 的联调须在接入完成后单独验收。
