---
name: rapidkit-api-client
description: Create and modify frontend API client code for the RapidKit project. Use this skill when the user asks to add API calls, define API types, connect frontend to backend endpoints, or work with the Service.ApiRequest/ApiResponse type system. Trigger whenever the user mentions API client, service functions, API types, or frontend-backend integration.
---

# RapidKit API Client

Unless explicitly described as relative to a package or source file, project paths in this skill are relative to the repository root.

## Prerequisites

Read `rapidkit-conventions` skill first for universal project rules.

## Scope

This skill targets the Vue application in `apps/frontend`. For React admin API integration, inspect `apps/admin/src/services` and its current request/types conventions rather than copying the Vue paths and namespace layout below.

This skill covers:

- OpenAPI schema type extraction (Service.ApiRequest / Service.ApiResponse)
- Per-module API type definitions (Api.\* namespace)
- API function definitions (service/api/\*.ts)
- Request instance configuration and patterns

Out of scope (use other skills):

- Vue component implementation -> use `rapidkit-frontend-design`
- Backend endpoint creation -> use `rapidkit-backend-design`

## Architecture

The API client has a layered type-safe architecture:

```
Backend OpenAPI spec
  -> openapi-typescript generates schema.d.ts
    -> Service.ApiRequest / Service.ApiResponse extract types
      -> Api.* namespace provides named aliases
        -> service/api/*.ts defines fetch functions
          -> Components call fetch functions with full type safety
```

### Key Files

| File                                         | Role                                                           |
| -------------------------------------------- | -------------------------------------------------------------- |
| `apps/frontend/src/typings/schema.d.ts`      | Auto-generated OpenAPI types (DO NOT edit)                     |
| `apps/frontend/src/typings/service.d.ts`     | `Service.ApiRequest` / `Service.ApiResponse` conditional types |
| `apps/frontend/src/typings/api/*.d.ts`       | Per-module named type aliases                                  |
| `apps/frontend/src/service/request/index.ts` | Configured Axios request instance                              |
| `apps/frontend/src/service/api/*.ts`         | Per-module API functions                                       |
| `apps/frontend/src/service/api/index.ts`     | Barrel re-export of all API functions                          |

## Core Patterns

### 1. Type Extraction

`Service.ApiRequest<Path, Method, Location>` extracts request types by location:

- `"path"` -- path parameters
- `"query"` -- query string parameters
- `"body"` -- JSON request body

`Service.ApiResponse<Path, Method>` extracts the `data` field from the standard `{ code, message, data }` response envelope. Method defaults to `"get"` when omitted.

### 2. Per-Module Type Definitions

Each backend module has a corresponding `typings/api/<module>.d.ts` file:

```typescript
import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    namespace Worker {
      // OpenAPI-derived types (preferred for all REST endpoints)
      type WorkerSearchParams = Service.ApiRequest<"/api/v1/workers", "get", "query">
      type WorkerList = Service.ApiResponse<"/api/v1/workers">
      type WorkerDetail = Service.ApiResponse<"/api/v1/workers/{worker_id}">
      type WorkerControlResponse = Service.ApiResponse<"/api/v1/workers/{worker_id}/ping", "post">

      // Manually defined types (only for non-REST: Socket.IO events, frontend-only enums)
      type WorkerStatus = "1" | "2"
      type WorkerStatusEvent = { hostname: string; status: WorkerStatus }
    }
  }
}
```

Rules:

- ALWAYS derive types from OpenAPI schema using `Service.ApiRequest` / `Service.ApiResponse` for REST endpoints
- ONLY define types manually for non-REST concepts (Socket.IO events, frontend-only enums, composite UI types)

### 3. API Functions

Each module's API functions live in `service/api/<module>.ts`:

```typescript
import { request } from "../request"

/** Fetch worker list */
export function fetchGetWorkerList(params?: Api.Worker.WorkerSearchParams) {
  return request<Api.Worker.WorkerList>({ url: "/workers", method: "get", params })
}

/** Fetch worker detail */
export function fetchGetWorkerDetail(workerId: string) {
  return request<Api.Worker.WorkerDetail>({ url: `/workers/${workerId}`, method: "get" })
}

/** Ping a worker */
export function fetchPingWorker(workerId: string) {
  return request<Api.Worker.WorkerControlResponse>({ url: `/workers/${workerId}/ping`, method: "post" })
}
```

Workers expose reads and control actions, not generic create/delete endpoints. Copy the exact OpenAPI path parameter name (`worker_id`, `user_id`, etc.) when deriving types. UUID resource IDs are strings in TypeScript.

Naming convention: `fetch` + HTTP verb + noun (e.g., `fetchGetWorkerList`, `fetchCreateSchedule`, `fetchDeleteSchedule`).

URL paths omit the `/api/v1` prefix -- it is part of `baseURL`.

All API functions MUST be re-exported through the barrel file `service/api/index.ts`.

### 4. Consuming in Components

The request instance uses the **flat response pattern** (never throws):

```typescript
const { data, error } = await fetchGetWorkerList(params)
if (!error) {
  // data is typed as Api.Worker.WorkerList
  workerList.value = data
}
```

No try/catch needed. Check `error` for failure, use `data` for success.

## Step-by-Step Operations

### Operation 1: Add API Client for a New Backend Module

1. **Regenerate OpenAPI types** (if backend endpoints changed):

   ```bash
   pnpm --filter @rapidkit/frontend dev
   ```

   With the backend running, the Vite plugin `apps/frontend/builder/plugins/openapi.ts` generates `schema.d.ts` from the configured `VITE_SERVICE_OPENAPI_URL` on development startup. To generate without starting Vite, run `pnpm --filter @rapidkit/frontend exec openapi-typescript <configured-openapi-url> -o src/typings/schema.d.ts`, substituting that configured URL.

2. **Create type definition file** at `apps/frontend/src/typings/api/<module>.d.ts`:

   ```typescript
   import type { Service } from "@/typings/service"

   declare global {
     namespace Api {
       namespace <Module> {
         type ListParams = Service.ApiRequest<"/api/v1/<module>", "get", "query">
         type List = Service.ApiResponse<"/api/v1/<module>">
         type Detail = Service.ApiResponse<"/api/v1/<module>/{id}">
         type CreateBody = Service.ApiRequest<"/api/v1/<module>", "post", "body">
         type UpdateBody = Service.ApiRequest<"/api/v1/<module>/{id}", "put", "body">
       }
     }
   }
   ```

3. **Create API function file** at `apps/frontend/src/service/api/<module>.ts`:

   ```typescript
   import { request } from "../request"

   export function fetchGet<Module>List(params?: Api.<Module>.ListParams) {
     return request<Api.<Module>.List>({ url: "/<module>", method: "get", params })
   }

   export function fetchGet<Module>Detail(id: string) {
     return request<Api.<Module>.Detail>({ url: `/<module>/${id}`, method: "get" })
   }

   export function fetchCreate<Module>(data: Api.<Module>.CreateBody) {
     return request<Api.<Module>.Detail>({ url: "/<module>", method: "post", data })
   }

   export function fetchUpdate<Module>(id: string, data: Api.<Module>.UpdateBody) {
     return request<Api.<Module>.Detail>({ url: `/<module>/${id}`, method: "put", data })
   }

   export function fetchDelete<Module>(id: string) {
     return request<null>({ url: `/<module>/${id}`, method: "delete" })
   }
   ```

4. **Add to barrel file** `apps/frontend/src/service/api/index.ts`:
   ```typescript
   export * from "./<module>"
   ```

### Operation 2: Add a Single New API Call

1. Check that the endpoint exists in `schema.d.ts` (regenerate if needed)
2. Add the type alias to the corresponding `typings/api/<module>.d.ts`
3. Add the fetch function to `service/api/<module>.ts`

## Rules

- ALWAYS derive REST types from OpenAPI schema -- never manually define types that OpenAPI can provide
- ALWAYS use the `fetch` + verb + noun naming convention for API functions
- ALWAYS re-export new API functions through the barrel `service/api/index.ts`
- ALWAYS use the flat response pattern (`const { data, error } = await ...`) in components
- NEVER import `axios` directly -- always use the configured `request` instance from `service/request`
- NEVER include `/api/v1` prefix in URL paths -- it is in the baseURL
- PREFER regenerating `schema.d.ts` before adding new type definitions to ensure types are up to date
