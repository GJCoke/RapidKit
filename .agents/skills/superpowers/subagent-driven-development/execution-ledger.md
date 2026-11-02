# Plan Execution: Shared Rules

superpowers:executing-plans and superpowers:subagent-driven-development both
follow this file. Read it before Task 1. Where a skill adds to a rule here,
the skill's text adds to it; it does not replace it.

## RapidKit Rules

- **Conventions first.** Before Task 1, read the root `AGENTS.md`,
  `rapidkit-conventions` (`.agents/skills/rapidkit/rapidkit-conventions/SKILL.md`)
  and every `rapidkit-*` domain skill the plan names or the tasks touch.
  Before editing in a task, re-check the domain skill for that task. A plan
  step that contradicts the conventions is a plan defect: rule in favour of
  the conventions and ledger it.
- **Branch, not worktree.** Follow the `AGENTS.md` Git workflow: work in the
  current checkout on the current branch. Only on `main`/`master`, create a
  `<type>/<slug>` branch in place with `git switch -c` first. Use
  superpowers:using-git-worktrees only when your human partner asked for a
  worktree. Never implement on a detached HEAD. Preserve all pre-existing
  staged, unstaged and untracked changes.
- **Never commit anything under `docs/superpowers/`.** That covers the spec,
  the plan and every other file there, even if a plan's commit step lists
  it. Stage explicit task-owned paths or hunks only (never `git add .`,
  `git add -A`, `git commit -a`, never force-add an ignored path), then
  check `git diff --cached --name-only` before each commit. If task changes
  cannot be separated safely from pre-existing work, leave them uncommitted
  and report why.
- **No subagents under Codex.** In Codex, never dispatch an implementer,
  reviewer or any other subagent: use superpowers:executing-plans in this
  session and take its "Without a subagent tool" path in Final Review.
- **No integration without an explicit request.** Pushing, merging,
  rebasing, amending history and deleting branches need your human
  partner's explicit request; committing on the task branch does not
  authorize them.

## Running the Scripts

Run every script from the repo root by its full path:

- `bash .agents/skills/superpowers/subagent-driven-development/scripts/<name>`
  for `sdd-workspace`, `task-brief` and `review-package`
- `bash .agents/skills/superpowers/executing-plans/scripts/<name>` for
  `task-start` and `task-done`

In the skills, `scripts/<name>` is short for the full path. Pass PLAN_FILE
as the repo-relative plan path.

## Workspace and Ledger

Conversation memory does not survive compaction. Executors that lost their
place have redone entire completed task sequences — the single most
expensive failure observed. Track progress in a ledger file, not only in
todos. Harness todos are a live view; the ledger is the record. Both skills
use the same workspace and ledger format, so a plan can change executors
mid-flight and the new one resumes from the same ledger.

- Each plan owns a workspace: at skill start, run
  `scripts/sdd-workspace PLAN_FILE`. It prints the plan's git-ignored
  directory (`<repo-root>/.superpowers/sdd/<plan-basename>/`), home to every
  artifact for THIS plan: ledger, briefs, reports, review packages. Another
  plan's directory is never yours to read or write.
- Check for this plan's ledger at `<workspace>/progress.md`. If its first
  line names your plan file, tasks with a `Task <N>: complete` line are
  DONE — do not redo them; resume at the first task without one. A task
  whose last line is a fix round is mid-loop: resume the loop at the next
  round. A ledger whose first line names a different plan file — or a stray
  ledger at the old flat path `.superpowers/sdd/progress.md` — is another
  plan's progress: leave it in place and start your own, fresh.
- Create the ledger with its identity as the first line:
  `# SDD ledger — plan: <plan file path>`.
- The commits the ledger names exist in git even when your context no
  longer remembers making them. After compaction, trust the ledger and
  `git log` over your own recollection.
- `git clean -fdx` destroys the workspace (it is git-ignored scratch); if
  that happens, recover from `git log`.
- Captured test, build and lint output goes under `logs/verification/`,
  not the workspace.

## Reading the Plan

Read the plan once, note its context and Global Constraints, and create a
todo per task. If the plan names a Spec, read that too: the spec is the
authority the plan argues from, and conflicts inside the plan resolve
against it. A plan with no reachable spec gets a ledger note saying so —
rulings made without one are provisional.

## Running Without Stalls

**Narration:** between tool calls, narrate at most one short line — the
ledger and the tool results carry the record.

**Continuous execution:** Do not pause to check in with your human partner
between tasks. Execute all tasks from the plan without stopping. "Should I
continue?" prompts and progress summaries waste their time — they asked you
to execute the plan, so execute it.

**Rulings, not stalls.** A running plan does not wait on a human. Conflicts,
ambiguities, plan defects, a cap you would have asked to exceed — decide
them. The spec is the binding authority, the plan is its argument, and your
judgment settles what neither answers. Record every decision in the ledger
as `Ruling: <what you decided> — <why> — <what it costs if wrong>`, and keep
going. Deviating from the plan without a ledgered ruling is a decision made
in secret. A wrong ruling costs rework your human partner can see and undo;
a session parked on a question costs their whole day and buys nothing.

Four things stop you, and only these: an irreversible or destructive
operation; a security-sensitive action; a side effect outside this checkout
that norms say you ask about first (a merge, a push to a shared branch, a
publish); and a plan so broken that every path forward is a guess. For
those, stop and ask.

**Rare cases wait for approval.** Handling for a rare boundary, race or
concurrency case that the plan does not name is not built on a ruling
(Lean Code Rules in `rapidkit-conventions`). Do not stop for it either:
ledger it as `Needs approval: <case> — <how likely>` and keep going.

**Visual Check.** When the plan has a visual target, run its Visual Check
(`rapidkit-conventions`) yourself after the task that ends with it passes;
an implementer subagent may lack a browser. Do not fix the differences
during execution. Ledger each one as `Visual: <location> — <difference>`,
or the check as `Visual: blocked — <reason>`, and keep going.

## Finish

Before you delete anything, collect from the ledger, in the order you made
them:

- every line containing `Ruling:` (pre-flight rulings, parked findings,
  breaker adjudications, final-review rulings) under "Rulings I made", each
  with what it costs if wrong
- every `minor (deferred)` line under "Deferred minors"
- every `Needs approval:` line under "Needs your approval"
- every `Visual:` line under "Visual differences" (your human partner
  decides which to fix)

All four lists are exhaustive: if the ledger holds a line, the list holds
it. Open the final message with the conclusion, then what your human
partner must approve (Document Writing Rules in `rapidkit-conventions`).
That message is the only place the decisions you took on your human
partner's behalf reach them. A ruling that dies with the workspace was a
decision made in secret.

When the final review is clean and its fixes are committed, delete this
plan's workspace (`rm -rf <workspace>`) — the git history is the record
now. Sibling directories belong to other plans; leave them alone. Leave
`docs/superpowers/` (spec and plan) local and uncommitted.

Then use superpowers:finishing-a-development-branch. It reports the branch,
its commits and validation, and presents the options; merge, push or
delete happen only on your human partner's explicit choice.
