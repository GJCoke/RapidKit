# Pydantic 模型规范

本项目基于 Pydantic v2 和 SQLModel 建立了统一的数据模型体系，涵盖请求校验、响应序列化和数据库 ORM 三个层面。

## BaseModel

所有 Pydantic 模型的基类，配置了 camelCase 别名生成器，使 Python 风格的 `snake_case` 字段名自动映射为前端惯用的 `camelCase`：

```python
from pydantic import AliasGenerator, ConfigDict
from pydantic import BaseModel as _BaseModel
from pydantic.alias_generators import to_camel

class BaseModel(_BaseModel):
    model_config = ConfigDict(
        alias_generator=AliasGenerator(alias=to_camel),
        populate_by_name=True,
    )
```

- `alias_generator`：自动将 `page_size` 映射为 `pageSize`
- `populate_by_name=True`：允许同时通过原始字段名和别名赋值

`BaseModel` 还提供了 `serializable_dict` 方法，是 `model_dump(mode="json", by_alias=True)` 的便捷封装：

```python
def serializable_dict(self, ...) -> dict:
    return self.model_dump(
        mode="json", by_alias=by_alias,
        include=include, exclude=exclude,
        exclude_unset=exclude_unset,
        exclude_defaults=exclude_defaults,
        exclude_none=exclude_none,
    )
```

## 请求模型

请求模型定义在 `common/schemas/request.py` 中，提供常用的请求结构基类：

```python
class PaginatedRequest(BaseRequest):
    """统一分页请求。"""
    page: int = Field(1, description="当前页码。")
    page_size: int = Field(10, description="每页条数。")

class DeleteRequest(BaseRequest):
    """统一删除请求。"""
    id: UUID = Field(..., description="要删除的项 id。")

class BatchRequest(BaseRequest):
    """统一批量请求。"""
    ids: list[UUID] = Field(..., description="项 id 列表。")
```

所有请求模型均继承自 `BaseRequest`，确保 camelCase 别名一致性。前端传入 `{"pageSize": 20}` 或 `{"page_size": 20}` 均可正确解析。

:::tip
`PaginatedRequest` 可直接作为基类组合业务查询字段。例如 Schedule 模块的查询请求：

```python
class PeriodicTaskQueryRequest(PeriodicTaskQueriesSchema, PaginatedRequest):
    """定时任务分页查询请求。"""
```

:::

## 响应模型

### Response[T]

泛型统一响应结构，所有接口的返回值类型：

```python
T = TypeVar("T")

class Response(BaseResponse, Generic[T]):
    code: int = Field(int(StatusCode.SUCCESS), description="状态码。")
    message: str = Field("common.response.success", description="响应消息。")
    data: T | None = Field(None, description="响应数据。")
```

`message` 字段通过 `field_serializer` 自动执行 i18n 翻译：

```python
@field_serializer("message")
def serialize_message(self, value: str) -> str:
    return t(value) if is_i18n_key(value) else value
```

### PaginatedResponse[T]

泛型分页响应结构，嵌套在 `Response` 的 `data` 中使用：

```python
class PaginatedResponse(BaseResponse, Generic[T]):
    page: int = Field(..., description="页码。")
    page_size: int = Field(..., description="每页条数。")
    total: int = Field(..., description="总条数。")
    records: list[T] = Field(..., description="记录列表。")
```

接口使用示例：

```python
@router.get("/user")
def user() -> Response[PaginatedResponse[UserInfo]]:
    pass
```

最终序列化为：

```json
{
  "code": 0,
  "message": "请求成功",
  "data": {
    "page": 1,
    "pageSize": 10,
    "total": 100,
    "records": [...]
  }
}
```

### BaseSchema

带有 `id`、`create_time`、`update_time` 公共字段的响应基类，配置了 `from_attributes=True` 以支持从 ORM 模型直接转换：

```python
class BaseSchema(BaseResponse):
    id: UUID
    create_time: datetime = Field(examples=["2024-07-31 16:07:34"])
    update_time: datetime = Field(examples=["2024-07-31 16:07:34"])

    @field_serializer("create_time", "update_time")
    def serialize_datetime(self, value: datetime) -> str:
        return value.strftime("%Y-%m-%d %H:%M:%S")
```

## SQLModel 数据库基类

数据库模型基类定义在 `common/models.py` 中，结合 SQLModel 和 SQLAlchemy：

```python
from src.utils.uuid7 import uuid7

class SQLModel(_SQLModel):
    id: UUID = Field(
        default_factory=uuid7,
        primary_key=True, index=True, nullable=False,
        description="唯一ID",
    )
    create_time: datetime = Field(default_factory=datetime.now, description="创建时间")
    update_time: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": datetime.now},
        description="更新时间",
    )
```

:::info
主键使用 UUID v7 而非自增 ID 或 UUID v4。UUID v7 基于时间戳生成，天然有序，既保证全局唯一性，又避免了随机 UUID 导致的 B-tree 索引碎片化问题。
:::

## 最佳实践

### 部分更新使用 exclude_unset

更新接口中，使用 `model_dump(exclude_unset=True)` 仅获取客户端实际传入的字段，避免将 `None` 默认值写入数据库：

```python
task_data = body.model_dump(exclude={"interval", "crontab"}, exclude_unset=True)
if task_data:
    await crud.update(task, task_data)
```

### ORM 转换使用 model_validate

将 SQLModel 实例转换为响应 Schema 时，使用 `model_validate` 配合 `from_attributes=True`：

```python
# BaseSchema 已配置 from_attributes=True
response = PeriodicTaskResponse.model_validate(db_task)
```

### 组合继承构建查询请求

通过多继承组合查询字段和分页参数，避免重复定义：

```python
class PeriodicTaskQueriesSchema(BaseModel):
    enabled: bool | None = Field(None, description="启用状态筛选")
    task_name: str | None = Field(None, description="任务名筛选")

class PeriodicTaskQueryRequest(PeriodicTaskQueriesSchema, PaginatedRequest):
    """定时任务分页查询请求。"""
```
