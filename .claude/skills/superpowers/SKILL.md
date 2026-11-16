---
name: superpowers
description: Index of 15 engineering-workflow skills (Superpowers) - brainstorming before building, writing and executing plans, test-driven development, systematic debugging, requesting and receiving code review, git worktrees, subagent-driven development, parallel agents, finishing a branch, and verification before completion. Use when starting feature work, planning, fixing a bug or failing test, reviewing code, or about to claim work is done. Open this guide first, then read the matching sub-skill's SKILL.md.
---

# Superpowers

A bundle of workflow skills. This file is the **guide**: it tells you which sub-skill fits the situation. The sub-skills live in the folders next to this file; they are **not** registered individually, so open them with the Read tool.

## How to use this guide

1. Find the situation below that matches what you are doing.
2. **Read that sub-skill's `SKILL.md` in full** (path relative to this file) before acting. Do not work from the one-line summaries here, they are for orientation only.
3. Follow the sub-skill exactly. If it has a checklist, make a todo per item. Announce: "Using [skill] to [purpose]".
4. Where a sub-skill says to invoke another skill by name (for example "invoke brainstorming"), that means: Read the sibling folder's `SKILL.md` listed below.
5. User instructions (CLAUDE.md, direct requests) take precedence over these skills. Skip a workflow only when the user explicitly says to.

If you are a subagent dispatched for one specific task, ignore this guide and do the task.

## Which skill for which situation

| Situation | Read |
|---|---|
| About to build a feature, add behavior, or plan anything new (do this before plan mode) | [brainstorming](brainstorming/SKILL.md) |
| You have a spec or requirements for a multi-step task, before touching code | [writing-plans](writing-plans/SKILL.md) |
| Starting feature work that needs an isolated workspace | [using-git-worktrees](using-git-worktrees/SKILL.md) |
| Executing a plan with independent tasks in this session, using subagents | [subagent-driven-development](subagent-driven-development/SKILL.md) |
| Executing a plan inline yourself (no subagent tool, or the user chose inline) | [executing-plans](executing-plans/SKILL.md) |
| 2+ independent tasks that share no state or sequential dependency | [dispatching-parallel-agents](dispatching-parallel-agents/SKILL.md) |
| Implementing any feature or bugfix, before writing implementation code | [test-driven-development](test-driven-development/SKILL.md) |
| Any bug, test failure, or unexpected behavior, before proposing a fix | [systematic-debugging](systematic-debugging/SKILL.md) |
| Finished a task or major feature, or before merging | [requesting-code-review](requesting-code-review/SKILL.md) |
| Received review feedback, before implementing it | [receiving-code-review](receiving-code-review/SKILL.md) |
| About to say work is done, fixed, or passing, or about to commit or open a PR | [verification-before-completion](verification-before-completion/SKILL.md) |
| Implementation is complete and tests pass, deciding how to integrate | [finishing-a-development-branch](finishing-a-development-branch/SKILL.md) |
| Creating or editing a skill, or checking a skill works | [writing-skills](writing-skills/SKILL.md) |
| A superpowers session went wrong and the user wants to know why, or wants a bug report | [diagnosing-superpowers](diagnosing-superpowers/SKILL.md) |
| Need the underlying rules for finding and applying skills, or the per-harness tool mapping | [using-superpowers](using-superpowers/SKILL.md) (Claude Code mapping: `using-superpowers/references/claude-code-tools.md`) |

## Typical flow for a feature

1. **brainstorming**: settle what to build and the design.
2. **using-git-worktrees**: get an isolated workspace.
3. **writing-plans**: turn the design into a step-by-step plan.
4. **subagent-driven-development** or **executing-plans**: carry out the plan. **test-driven-development** applies to every implementation step; **dispatching-parallel-agents** applies when tasks are independent.
5. **requesting-code-review**, then **receiving-code-review** for the feedback.
6. **verification-before-completion**: run the checks and confirm the output before claiming success.
7. **finishing-a-development-branch**: decide how to merge, PR, or clean up.

For a bug, start at **systematic-debugging**, fix test-first with **test-driven-development**, then finish with **verification-before-completion**.

## Priority when several apply

Process skills come first because they set the approach: brainstorming for "let's build X", systematic-debugging for "fix this bug". Implementation and domain skills follow.

## Files these skills create in a project

- `docs/superpowers/specs/` and `docs/superpowers/plans/`: design docs and plans (committed).
- `.superpowers/`: session and progress state. Add it to `.gitignore` if it is not already there.

## Notes on this vendored copy

- Because the sub-skills sit one level below this file, they are read by path, not invoked as slash commands.
- Licence: see [LICENSE](LICENSE).
