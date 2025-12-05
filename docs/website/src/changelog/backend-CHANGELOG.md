# @monorepo-example/backend

## 1.0.1

### Patch Changes

- - Convert all server HTTP response statuses to 200, and display the actual error status code in the code field of the response body.
  - Automatically capitalize the first letter of exception log messages.

## 1.0.0

### Major Changes

- ## add python backend by Async-FastAPI-MultiDB
  - Add the Python server to the monorepo example project
  - Use `ruff` and `mypy` for code quality management
  - Add `turbo` as the build manager
