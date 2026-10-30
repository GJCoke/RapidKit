# Repository Instructions

## Development verification logs

- Write captured test, build, lint, typecheck and browser verification output under `logs/verification/`, creating the directory when needed. Do not place these files directly in `logs/`, which is reserved for runtime logs.
- Verification logs are Git-ignored local artifacts and are excluded from runtime log retention. Never stage or commit them.

## Git workflow

- Work in the current checkout by default. Do not create a worktree unless the user explicitly asks for one (typically because several agents run in parallel).
- Branch choice, decided once at the start of a task: inspect the current branch and working tree.
  - On `main`/`master`: a **simple task** (no design document or plan; at most 1–2 files and a few dozen lines; no database migration; no API contract or permission declaration change) may be done in place. Any other task first creates a branch in place with `git switch -c <type>/<slug>` before editing any repository file, design documents and plans included.
  - On any other branch: keep working on it. Do not create another branch, even for a new task or a fix after an earlier merge; mention the branch you are on in your report.
- Branch names are `<type>/<slug>`. `<type>` is one of `feature`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`; `<slug>` is lowercase English kebab-case naming the concrete change, e.g. `feature/login`, `fix/login-cooldown`, `refactor/permission-grants`. Do not use the `codex/` prefix for new branches.
- When the user asks for a worktree, create it from HEAD with `git worktree add -b <type>/<slug> .worktrees/<type>-<slug> HEAD`, work inside it, and install the dependencies the task needs there (`pnpm install` for frontend work, `uv sync` for backend work). Uncommitted changes in the main checkout are not carried over and stay untouched.
- Continue on the same branch (and worktree, if one was requested) for clarifications, validation retries, follow-up fixes and every skill invocation in the session; never create a branch or worktree per skill or per message.
- Preserve all pre-existing staged, unstaged and untracked changes; `git switch -c` carries them along untouched. Do not reset, clean, stash or discard them. If branch or worktree creation is blocked, stop before editing and report the blocker; do not fall back to `main`/`master` or a detached HEAD.
- A user's request to remove or clean up a worktree also authorizes discarding its local files under `docs/superpowers/`; do not require a separate copy-or-discard confirmation.
- After the required validation passes, task implementation files (source code, tests, configuration and maintained skill instructions) may be committed automatically. Stage explicit task-owned paths or hunks and review the staged diff first. If task changes cannot be separated safely from pre-existing work, leave them uncommitted and report that fact.
- Never stage or commit task design documents, specifications or implementation plans, regardless of their location or extension. Everything under `docs/superpowers/` (specs, plans and any other file there) stays local and uncommitted; do not force-add ignored planning artifacts.
- Never use blanket staging (`git add .`, `git add -A`) or `git commit -a`. Before committing, check the staged file list and diff, exclude design/plan artifacts, and ensure no unrelated pre-existing changes are included.
- Permission to create a branch or commit implementation does not authorize pushing, merging, rebasing, amending history or deleting branches; perform those actions only when the user explicitly requests them. Removing a worktree also needs the user's explicit choice.
- These repository rules take precedence over Git steps in generic workflow skills. In this repository, workflow instructions to commit a spec/plan, create a worktree or a new branch the rules above do not call for, implement a non-simple task directly on `main`/`master`, or use a different branch naming scheme must not be followed.
