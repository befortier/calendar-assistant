# Calendar Assistant — Claude Instructions

## React Code Review (Required)

Before creating any PR that includes `.tsx` or `.ts` UI files, invoke all three of these skills in order:

1. `react-best-practices` — performance, data fetching, bundle optimization
2. `composition-patterns` — component architecture, reusability, prop design
3. `web-design-guidelines` — accessibility, UX, visual best practices

This applies to any React code written in `app/src/`. Do not skip these even for small changes.

## Merge Checklist (Required)

Before merging any PR, run in order:

1. `npm test --workspace=server` — all tests pass locally
2. `gh pr checks <number>` — CI green
3. `gh pr view <number> --comments` — review latest Claude feedback and address any valid findings

Only propose merging after all three pass.

## PR Review Workflow (Required)

Before merging any PR, check for Claude review comments:

```
gh pr view <number> --comments
```

If the review posted findings, use the `superpowers-bd:receiving-code-review` skill to work through them before merging. Do not skip findings without explicit justification.

## GitHub Account

This project uses the `befortier` GitHub account. `GH_TOKEN` is set via `.claude/settings.local.json`. All `gh` commands will automatically use the correct account.

## Issue Tracking

This project uses **beads (bd)** for all issue tracking. See `AGENTS.md` for full reference.
