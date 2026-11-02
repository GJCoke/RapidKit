# Boundary Validation

## Overview

When invalid data causes a bug, fix the source and validate the data once, at the boundary where it enters the system. Do not add the same check at every layer it passes through.

**Core principle:** One check at the entry, types inside. Repeated checks hide where the data came from and make each function harder to read.

## Where the Boundary Is

The boundary is where data comes from outside code you control:

- HTTP request bodies, query parameters and headers
- CLI arguments, environment variables and config files
- File contents, database rows written by other systems, third-party API responses
- Messages from queues and other processes

Code that receives data from your own validated code is inside the boundary. It trusts the types.

## Applying the Pattern

When you find a bug caused by invalid data:

1. **Trace the data flow** (see `root-cause-tracing.md`). Find where the bad value enters.
2. **Fix the source.** If your own code produced the bad value, fix that code. A check downstream does not fix it.
3. **Validate at the entry.** If the bad value came from outside, add one check where it enters. Use the boundary's existing tool (request schema, settings model, argument parser).
4. **Encode the result in the type.** After the check, pass a type that cannot hold the invalid value (non-optional field, enum, parsed model). Inner functions then need no check.
5. **Write one test** that sends the bad value to the entry and expects the rejection.

## Example

Bug: An empty `projectDir` caused `git init` to run in the source tree.

**Data flow:**
1. Test setup passes an empty string
2. `Project.create(name, '')`
3. `WorkspaceManager.createWorkspace('')`
4. `git init` runs in `process.cwd()`

**Fix:**
- Source: the test read `tempDir` before `beforeEach` set it. Make `tempDir` a getter that throws before setup.
- Entry: `Project.create()` is the public API. It rejects an empty or missing directory once.
- Inside: `WorkspaceManager` and `gitInit` receive the validated path. They do not check it again.

## When a Second Check Is Allowed

Add a check inside the boundary only when the user approves it after you state the risk and how likely it is. Typical approved cases: an operation that destroys data, or a guard that stops tests from touching real files. Name the case in your report.
