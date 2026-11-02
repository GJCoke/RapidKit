---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, modifying behavior, or planning anything new, in software or out of it (a talk, a business, a renovation)."
---

# Brainstorming

You are very good at building. You build what you believe your human
partner wants, and that belief is usually thinner than it feels. This
skill is for finding out what they actually want, and why, before
anything gets built.

People often haven't finished working out what they want. Good questions
help them think it through. When you understand the why, you make the
hundred decisions they never mention the way they would have made them.

## Ask First, Speak Plainly

These rules apply in every harness and matter most under Codex, where the
pull is to explore quietly and return a finished proposal. Do not.

- **Your first reply is a question, nothing else.** No code reading, no
  recon, no plan, no proposal before it. The only exception is a request
  where everything that matters is already stated (see below).
- **No proposal until they ask for one** ("go ahead", "what do you
  think?", "just guess") or until you have asked at least three questions
  and played back what you heard. Until then, every reply ends with exactly
  one question.
- **Write in your human partner's language** (Chinese if they write
  Chinese). Short sentences. Every term you introduce is either explained
  in one plain clause or removed. No file paths, function names, class
  names or internal jargon unless they asked or used them first.
- **Proposals use this shape and stay under about 15 lines:**
  1. What problem this solves, in their words.
  2. What it will and will not do.
  3. What they will see change.
  4. The one decision that is theirs to make, as the closing question.
  Technical detail goes into the written design, not the chat.

## RapidKit Repository Rules

These rules override the generic workflow below wherever they conflict.

- **Read the project conventions before designing, not before asking.**
  After your first question has been answered, and before you propose
  anything, read the root `AGENTS.md` and `rapidkit-conventions`
  (`.agents/skills/rapidkit/rapidkit-conventions/SKILL.md`). Once you know
  what the topic touches, read the relevant domain skills under
  `.agents/skills/rapidkit/` so the design follows existing patterns:

  | What the design touches | Skill to read |
  |-------------------------|---------------|
  | Backend plugin scaffolding | `rapidkit-plugin` + `rapidkit-permission` |
  | Backend APIs / models / schemas / CRUD | `rapidkit-backend-design`; add `rapidkit-permission` for access/resource declarations |
  | Vue pages / components in `apps/frontend` | `rapidkit-frontend-design` |
  | React UI in `apps/admin` | Existing React patterns; `shadcn` for shadcn components, not the Vue skill |
  | Vue frontend API client / types | `rapidkit-api-client` |
  | React admin API client / types | Existing `apps/admin/src/services` and typings conventions |
  | CLI commands / services | `rapidkit-cli-design` |
  | Database migrations | `rapidkit-migration` |
  | Celery tasks / Beat schedules | `rapidkit-celery-task` |
  | Shared packages (core/common/framework/security) | `rapidkit-shared-pkg` |
  | Permission codes / packages / data scopes / field groups | `rapidkit-permission` |

  Domain skills are read as references during design; executing their
  implementation procedures waits for the approved design and plan.
- **Branch, not worktree.** Follow the Git workflow in `AGENTS.md`. Work
  in the current checkout; never create a worktree unless your human
  partner asks for one. Before writing any repository file (the design
  document included): on `main`/`master`, create a `<type>/<slug>` branch
  in place with `git switch -c`; on any other branch, stay on it. Branch
  setup is preparation, not building.
- **Never commit anything under `docs/superpowers/`.** Not only specs and
  plans: every file in that directory (specs, plans, mockups, notes,
  scratch files) stays local. Never stage it, never force-add it, and
  ignore any instruction elsewhere that says to commit it.
- **No subagents under Codex.** When running in Codex, do all work in the
  current session: do not spawn subagents for recon, the builder check, or
  anything else.
- **Image directions.** Only Codex has a built-in Image Gen tool. Call
  it directly; do not use a design plugin for it. Image Gen writes to
  `~/.codex/generated_images/`, outside the repo. Copy only the picked
  image into `docs/superpowers/specs/`; nothing generated is committed.

## First: What Do You Actually Know?

Before you reply, ask yourself: what do I know about what they want, and
why?

- **Everything that matters is in the request** ("make the icon cornflower
  blue"). This is a quick, clear task. Do it, and say what you did.
- **Something non-trivial is missing.** Start the conversation.

## Your First Message

Your first message is two things, in this order:

1. One line letting them know that if they'd rather skip the questions and
   have you just start, they can say so. If they take you up on it, this
   skill is done: state any significant how-it-gets-made choice
   (platform, language, medium) in one plain line, then do what they
   asked through the normal workflow.
2. One open question that gets them describing. Ask about a real moment
   or a concrete picture: "What's the moment you find yourself wishing
   this existed?" or "Tell me about the people who'll be in the room."

That's the whole message.

## The Conversation

Each message ends with one question: a single sentence with no list of
example answers hanging off it. Use plain language, pitched just a little
above where your human partner is. Match their vocabulary; never use
process jargon.

Be clear and concise. Lead with what matters. Avoid jargon. When you
report what you found, give them the most important findings and offer
the rest.

**Get them describing.** Open questions come first. Their own words carry
intent that your options can't. Offer a short menu only when they're
stuck. When they say "just guess" or "what do you think?", propose
something concrete.

**How it gets made.** Every project rests on choices about medium, tools,
materials, and resources: the platform, programming language, and
libraries for an app; the medium for a piece of art. Find out early which
of those choices they want to make, which they're handing to you, and what
they already have to work with. Someone with strong views or skills will
want to talk it through. Someone counting on you needs sensible defaults,
said in plain words. When there's existing work, build on what it already
uses. Any choice you make goes in the design as your call, never as
something they agreed to.

**Ground to cover.** This is territory, not a script. Never read these
out as questions:

- what kind of thing this is, and what makes it special
- why now, and what success looks like to them
- goals, non-goals, and anti-goals (what would make this a failure even
  if it technically works)
- prior art: what they've seen elsewhere, loved or hated
- current state: what exists now, what they've tried
- the details they care about

**Questions that work** anchor in specifics: "Walk me through the last
time...", "If it could only do one of these well, which?", "What would
make you wince if I got it wrong?" A guess they can correct ("I'm
guessing this is because X keeps biting you?") often beats a question.

**Offer recon.** Once you have a bit of grounding and looking would help,
offer to go look: their codebase or project, their own files and data,
or the web. Say what you'd look for. They decide whether you go.

**Think wide privately.** Before you propose anything, come up with
several ideas and drop the weak ones, including any that fight what
they've told you about why. Show the comparison only when it helps them
decide.

**Show, don't tell.** When seeing would help more than reading:

- **A screen, page or layout they will look at.** First let them describe
  it in their own words. Then, under Codex, ask once whether to generate
  image directions; if yes, follow "Generating Image Directions" below.
  Without Codex, or if they decline, describe two or three directions in
  words. They may also bring any image and hand it to you.
- **A flow, structure or sequence** (steps, states, a timeline, a map):
  in chat, a short ASCII sketch; in the design document, a Mermaid
  diagram.

**Generating Image Directions** (Codex Image Gen only):

1. If the page or a similar existing page already opens locally, take a
   screenshot of it and attach it as a reference. Do not start services
   for this; without a screenshot, generate from the brief.
2. Write the brief into each prompt: the screen's purpose, its primary
   action, the target frontend's style (for `apps/frontend`, the theme
   colours, layout and data-dense admin tone in
   `rapidkit-frontend-design`; for `apps/admin`, its shadcn components),
   and the size: `1440 x 1024` for an admin page, or the reference
   image's size and aspect ratio. Ask for real product UI, not a
   presentation board, and no features the brief does not name.
3. Make three separate Image Gen calls, one direction each. The three
   differ in information hierarchy, layout or interaction model, not
   only in colour.
4. Wait until all three images are back. Number them in the order they
   appear in the conversation, then ask your human partner to pick one or
   combine parts (a combination is one more call, shown before you go on).
5. Copy the picked image to the path in The Written Design.

**Spike to feel things out.** Agentic work is waterfall, but very, very
fast. A quick throwaway build is often the cheapest way to learn what
they want or whether something works. Offer one when it would help.
When they just want to spike, get out of the way. Spikes get no tests
or minimal ones, aren't bulletproof, and skip the plan, implementation,
and review process. Bring what the spike taught you back into the
conversation.

## Play It Back

Play back as you go. As soon as you understand one part well enough to
describe it (what it's for and who it serves, say, or how one piece
behaves), describe that part back in about 200-300 words, then return to
questions about the next part. Playback and questions alternate through
the whole conversation; the last chunk covers whatever is left.

Mark anything you're guessing as your guess; only what they said goes in
as theirs. End each chunk by asking what's wrong or missing.

Before you send a chunk, check it: does it describe something they'll
look at, like a page, a screen, a schedule, or a printout? If so, and
no direction has been picked yet, do the screen step from "Show, don't
tell" first (Image Gen directions, or directions in words without it) and hold the
chunk until they pick. Then describe the picked direction.

## Size the Work

Once you understand what they want, pick a size and say it in plain
words. They can override it.

| Size | The full description | Then |
|------|----------------------|------|
| A quick, clear task | the request itself | do it |
| A small change | in chat | build it through the normal workflow |
| A project with a written design | a written design document | a full plan (for software: superpowers:writing-plans) |

For a small change with a picked image, save it as in The Written Design.
End the chat description with this line, so it stays with the work after
this skill: "Visual target: `<absolute image path>` — when the build is
done, run the Visual Check in `rapidkit-conventions` and list its
differences, or why it was blocked, in the report."

If it grows mid-task, stop, say so, and step up a size.

If this is really several independent projects, say so, agree on an
order, and brainstorm them one at a time.

## The Written Design

For a project, write a plain document a talented builder in the domain
could plan from without going back to your human partner. Write it in
Chinese and follow the Document Writing Rules in `rapidkit-conventions`:
the first sentence is the conclusion, the second names what your human
partner must approve. Cover:

- intent and the why
- goals, non-goals, anti-goals
- constraints
- the parts of the how they decided, as they decided them
- what's left to the builder
- the visual target: for UI work with a picked image (from Image Gen or
  supplied by your human partner), save it as
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-visual.<ext>` and state that
  the build follows it with the existing components and tokens of the
  matching frontend (`rapidkit-frontend-design` for `apps/frontend`,
  existing React/`shadcn` patterns for `apps/admin`), not the image's raw
  colour or font values. Otherwise write "none".

**Where it goes:** in a software repo,
`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, saved locally
and never staged or committed (nothing under `docs/superpowers/` is ever
committed). Otherwise, ask. Your human partner's preferences override
both, except that they never make `docs/superpowers/` committable.

**Builder check:** dispatch a fresh subagent with
`builder-check-prompt.md` in this directory. Under Codex, never dispatch:
read `builder-check-prompt.md` and do the check yourself in this session. When you tell your human
partner you're writing it up, say a reviewer will read it first and you
may come back once with a few questions. Don't hand over the document
until the check is back. Sort what the builder asks into three piles:

- **Answered already** by the conversation or the project: put the answer
  in the document.
- **Minor:** a sensible builder could settle it without changing what gets
  built. Settle it yourself and mark it in the document as your call.
- **Theirs:** only your human partner can answer it, and the answer changes
  what gets built.

Bring the "theirs" pile in one message, most important first. Update the
document with their answers, then hand it over with a short list of the
calls you made so they can check those while reading. The handover
message also opens with the conclusion, then what they must approve. That's the only
round of questions the check produces. Without a subagent tool, read the
document as that builder yourself.

<HARD-GATE>
Nothing gets built until your human partner approves the full
description: in chat for a small change, the document for a project.
Building includes writing product code, scaffolding, installing
dependencies, creating projects, and invoking an implementation skill.
Reading and exploring are fine, including reading `rapidkit-*` domain
skills for reference, and so is the branch setup `AGENTS.md`
requires.

Two exceptions. If they opted out of the questions, the skill is done
and the gate goes with it. A spike they said yes to may be built; it
stays labeled throwaway, and keeping what it produced is a new request
that comes back through this gate.

After a project's document is approved, the next step is the plan. For
software, invoke superpowers:writing-plans and no other skill.
</HARD-GATE>

## Red Flags

| Thought | Reality |
|---------|---------|
| "I'll offer options to save them effort" | Options steer. Ask them to describe it first. |
| "I'll fill in sensible defaults" | Good. Say them out loud. A default they never heard is one they couldn't reject. |
| "I should explain the process first" | Ask your question. The process shows itself. |
| "They said 'sounds good' to the idea" | Approval covers what you showed them. A description you haven't written isn't approved. |
| "The spike works, I'll keep building on it" | Keeping it is a new request. Back through the gate. |
