---
name: mattpocock-skills
description: Index of 27 engineering skills by Matt Pocock - grilling a plan, turning conversations into specs and tickets, implementing test-first, diagnosing hard bugs, two-axis code review (mattpocock-code-review), issue triage, prototypes, background research, handoffs, retros, PR bodies, domain modeling, and deep-module codebase design. Use when planning, speccing, building, diagnosing, reviewing, or writing a PR, when the user names one of these skills (for example grill-with-docs, to-spec, tdd, triage), or asks which flow fits. Open this guide first, then read the matching sub-skill's SKILL.md.
---

# Matt Pocock skills

A bundle of engineering skills. This file is the **guide**: it routes you to the right sub-skill. The sub-skills live in the folders next to this file; they are **not** registered individually, so open them with the Read tool (for example `grill-with-docs/SKILL.md`).

## How to use this guide

1. Match the situation to a sub-skill below.
2. **Read that sub-skill's `SKILL.md` in full** before acting or describing what it does. The summaries here are for orientation only.
3. Sub-skills refer to each other as slash commands (`/tdd`, `/to-spec`). Here that means: Read the sibling folder's `SKILL.md` with that name.
4. **User-initiated skills** are marked 🧑 below. Read and run them only when the user asks for that skill or flow by name (or clearly asks for what it does). Do not start them on your own. Unmarked skills may be used whenever their description fits.

For a fuller router with the reasoning behind each branch, read [ask-matt](ask-matt/SKILL.md) and [ask-matt/PHASE-BOUNDARIES.md](ask-matt/PHASE-BOUNDARIES.md).

## Precondition

🧑 [setup-matt-pocock-skills](setup-matt-pocock-skills/SKILL.md): run once per repo before the engineering flows. It configures the issue tracker, triage labels, and doc layout the other skills assume.

## The main flow: idea → ship

| Step | Skill | What it does |
|---|---|---|
| 1 | 🧑 [grill-with-docs](grill-with-docs/SKILL.md) | Interview to sharpen an idea, recording `GLOSSARY.md` and ADRs as it goes. Use whenever a repo is present. |
| 2 (optional) | [prototype](prototype/SKILL.md), bridged by 🧑 [handoff](handoff/SKILL.md) | Throwaway code to answer a design question that cannot be settled in conversation. |
| 3 | 🧑 [to-spec](to-spec/SKILL.md) | Turn the conversation into a spec and publish it to the tracker. No interview. |
| 4 | 🧑 [to-tickets](to-tickets/SKILL.md) | Split a plan or spec into tracer-bullet tickets, each declaring its blocking edges. |
| 5 | 🧑 [implement](implement/SKILL.md) | Implement one ticket, or one piece of work from a spec, in this context window. |
| 5 (alt) | 🧑 [implement-spec](implement-spec/SKILL.md) | Implement the whole spec and ticket graph in one run, with parallel implementer subagents on one integration branch. |
| during 5 | [tdd](tdd/SKILL.md) | Test-first, one red-green slice at a time. |
| end of 5 | [mattpocock-code-review](mattpocock-code-review/SKILL.md) | Review changes since a fixed point on two axes: repo Standards and Spec. |
| PR | [pr](pr/SKILL.md) | Shape a PR body: smallest useful visual, before/after evidence, one-way vs two-way door. |
| 6 | 🧑 [retro](retro/SKILL.md) | Look back over a session and suggest changes to the agent's environment, not the code. |

Keep steps 1 to 4 in one unbroken context window; each implementation step then starts fresh from its ticket.

## On-ramps

- Bugs and requests piling up: 🧑 [triage](triage/SKILL.md). For issues you did not create. Do not triage tickets that `to-tickets` made.
- Something is broken, hard, intermittent, or slow: [diagnosing-bugs](diagnosing-bugs/SKILL.md). Builds a tight feedback loop first, then fixes with a regression test.
- A huge, foggy effort too big for one session: 🧑 [wayfinder](wayfinder/SKILL.md). Charts a map of decision tickets; hands off at `to-spec`, it does not build.

## Codebase health

- 🧑 [improve-codebase-architecture](improve-codebase-architecture/SKILL.md): survey for deepening opportunities, then grill through the one you pick.

## Vocabulary underneath (read when the words are the problem)

- [domain-modeling](domain-modeling/SKILL.md): sharpen domain language, maintain `GLOSSARY.md`, record ADRs.
- [codebase-design](codebase-design/SKILL.md): deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality).
- [grilling](grilling/SKILL.md): the interview primitive that `grill-me`, `grill-with-docs`, `triage`, `wayfinder` and `improve-codebase-architecture` all run.

## Standalone

- 🧑 [grill-me](grill-me/SKILL.md): the same interview as `grill-with-docs`, stateless. For when there is no working directory.
- [research](research/SKILL.md): investigate a question against primary sources and leave a cited Markdown file in the repo.
- 🧑 [to-questionnaire](to-questionnaire/SKILL.md): write a questionnaire for someone else to fill in when the answer is in their head.
- [wizard](wizard/SKILL.md): generate an interactive bash wizard for steps only a human can perform (credentials, dashboards, cutovers).
- 🧑 [wait-what](wait-what/SKILL.md): re-pitch the last message in plain English when it did not land.
- 🧑 [teach](teach/SKILL.md): teach a concept over multiple sessions using the directory as a workspace.
- [writing-for-agents](writing-for-agents/SKILL.md): rules for writing skills, `AGENTS.md`, `CLAUDE.md`, and other documents agents consume.

## Notes on this vendored copy

- Sub-skills are read by path, not invoked as slash commands, because they sit one level below this file.
- The upstream `code-review` skill is named `mattpocock-code-review` here to avoid clashing with the built-in `code-review`.
- Licence: see [LICENSE](LICENSE).
