# Repository Instructions

## Git workflow

- At the start of every new task, inspect the current branch and working tree, record the entry branch, then create and switch to a fresh `codex/<task-name>` branch from the current HEAD before editing any repository file, including design documents and plans. Verify the new branch differs from the entry branch. Never implement a new task directly on the branch where it started, even when that branch is already a feature branch.
- Continue on the same task branch for clarifications, validation retries and follow-up fixes within that task; do not create another branch for each skill invocation or message. A separate new task requires a fresh branch.
- Preserve all pre-existing staged, unstaged and untracked changes. Do not reset, clean, stash or discard them to create the task branch. If safe branch creation/switching is blocked, stop before editing and report the blocker; do not fall back to the entry branch or detached HEAD.
- A separate worktree is optional. If one is used, it must also have a newly created named task branch before edits. Do not create a worktree by default when switching to a fresh branch safely preserves the user's working state.
- After the required validation passes, task implementation files (source code, tests, configuration and maintained skill instructions) may be committed automatically. Stage explicit task-owned paths or hunks and review the staged diff first. If task changes cannot be separated safely from pre-existing work, leave them uncommitted and report that fact.
- Never stage or commit task design documents, specifications or implementation plans, regardless of their location or extension. Everything under `docs/superpowers/` (specs, plans and any other file there) stays local and uncommitted; do not force-add ignored planning artifacts.
- Never use blanket staging (`git add .`, `git add -A`) or `git commit -a`. Before committing, check the staged file list and diff, exclude design/plan artifacts, and ensure no unrelated pre-existing changes are included.
- Permission to create a branch or commit implementation does not authorize pushing, merging, rebasing, amending history or deleting branches; perform those actions only when the user explicitly requests them.
- These repository rules take precedence over Git steps in generic workflow skills. In this repository, workflow instructions to commit a spec/plan, implement a new task on its entry branch, or bypass branch setup must not be followed.
