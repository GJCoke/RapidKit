---
name: using-git-worktrees
description: Use only when your human partner explicitly asks for a git worktree (for example to run several agents in parallel) - creates it from HEAD with git worktree add; never use it on your own initiative
---

# Using Git Worktrees

## RapidKit Override: Worktree Only On Request

In the RapidKit repository, the root `AGENTS.md` Git workflow takes
precedence over this skill:

- Use this skill only when your human partner explicitly asks for a
  worktree (typically to run several agents in parallel); that request is
  the consent, so do not ask for it again. Otherwise do not use this
  skill: work in the current checkout, on the current branch, or on a
  `<type>/<slug>` branch created in place with `git switch -c` when
  starting from `main`/`master`.
- Create it with git from the current HEAD, not a native tool that
  branches from elsewhere or places it in another directory:
  `git worktree add -b <type>/<slug> .worktrees/<type>-<slug> HEAD`, then
  work inside it (a native tool that can enter an existing path, such as
  `EnterWorktree` with `path`, may be used to switch the session into it).
- Branch names are `<type>/<slug>`: `<type>` is one of `feature`, `fix`,
  `refactor`, `perf`, `docs`, `test`, `chore`; `<slug>` is lowercase
  English kebab-case, e.g. `feature/login`, `fix/login-cooldown`. Never
  use the `codex/` prefix. Never work on a detached HEAD.
- `.worktrees/` is already ignored. Never edit or commit `.gitignore` on
  your own.
- Uncommitted changes in the main checkout are not carried into the
  worktree. Preserve them: never reset, clean, stash or discard them.
- Project setup (Step 2): run `pnpm install` for frontend work and
  `uv sync` for backend work inside the worktree, only what the task needs.
- Never stage or commit anything under `docs/superpowers/`.

## Overview

Create an isolated worktree from the current HEAD, set it up, and confirm a
clean baseline. The request for a worktree is the consent: do not ask again.

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace."

## Step 0: Detect Existing Isolation

**Before creating anything, check if you are already in an isolated workspace.**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

**Submodule guard:** `GIT_DIR != GIT_COMMON` is also true inside git submodules. Before concluding "already in a worktree," verify you are not in a submodule:

```bash
# If this returns a path, you're in a submodule, not a worktree — treat as normal repo
git rev-parse --show-superproject-working-tree 2>/dev/null
```

**If `GIT_DIR != GIT_COMMON` (and not a submodule):** You are already in a linked worktree. Skip to Step 2 (Project Setup). Do NOT create another worktree. Report: "Already in isolated workspace at `<path>` on branch `<name>`."

**If `GIT_DIR == GIT_COMMON` (or in a submodule):** You are in a normal repo checkout. Continue to Step 1.

## Step 1: Create the Worktree

1. Verify `.worktrees/` is ignored:

   ```bash
   git check-ignore -q .worktrees
   ```

   If it is not ignored, stop and report it. Do not edit `.gitignore`.

2. Create the worktree and branch from the current HEAD:

   ```bash
   git worktree add -b <type>/<slug> .worktrees/<type>-<slug> HEAD
   cd .worktrees/<type>-<slug>
   ```

   A native tool that can enter an existing path (e.g. `EnterWorktree`
   with `path`) may switch the session into it. Do not use a native tool
   to create the worktree: it may branch from elsewhere or use another
   directory.

3. If creation fails (sandbox denial, existing branch, any error), stop
   before editing and report the blocker. Do not fall back to the main
   checkout, `main`/`master` or a detached HEAD.

## Step 2: Project Setup

Install only what the task needs, inside the worktree:

- Frontend work: `pnpm install`
- Backend work: `uv sync`

## Step 3: Verify Clean Baseline

Run the task's relevant test suite. Save the output under
`logs/verification/` and read its tail.

**If tests fail:** Report the failures and ask whether to proceed or investigate.

**If tests pass:** Report ready, by the Document Writing Rules: the result
first, then what (if anything) your human partner must approve.

## Quick Reference

| Situation | Action |
|-----------|--------|
| Already in linked worktree | Skip creation (Step 0) |
| In a submodule | Treat as normal repo (Step 0 guard) |
| Normal checkout | `git worktree add -b <type>/<slug> .worktrees/<type>-<slug> HEAD` |
| `.worktrees/` not ignored | Stop and report; never edit `.gitignore` |
| Creation fails | Stop and report; no fallback |
| Tests fail during baseline | Report failures + ask |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'm obviously not in a worktree — no need to check" | Run Step 0. Harness-created isolation and submodules both fool eyeballing; the detection commands settle it. |
| "A native worktree tool is simpler" | It may branch from elsewhere or place the worktree in another directory. Create it with `git worktree add ... HEAD`; a native tool may only enter it. |
| "Creation failed — I'll just work in place" | Stop and report the blocker. Working elsewhere breaks the parallel setup your human partner asked for. |
| "The workspace is fresh — baseline tests can wait" | A dirty baseline makes every later failure ambiguous. Run the tests now; proceeding past failures is your human partner's call. |
