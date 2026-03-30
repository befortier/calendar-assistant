# Calendar Assistant — Claude Instructions

## Frontend Code Review (Required)

Before creating any PR that includes files in `app/src/`, invoke all three of these skills in order:

1. `react-best-practices` — performance, data fetching, bundle optimization
2. `composition-patterns` — component architecture, reusability, prop design
3. `web-design-guidelines` — accessibility, UX, visual best practices

Do not skip these even for small changes.

## Backend Code Review (Required)

Before creating any PR that includes files in `server/src/`, invoke:

1. `typescript-database-layer` — verify layering (DatabaseClient → Repository → Service), DI patterns, test seams, SQL placement
2. `express-route-handlers` — verify request body runtime validation, JWT payload validation, dependency injection in handlers

Apply both skill checklists before pushing.

## Pull Requests

Always create PRs as drafts:
```
gh pr create --draft ...
```

Only mark ready for review after the merge checklist passes.

## Merge Checklist (Required)

Before merging any PR, run in order:

1. `npm run test:unit --workspace=server` — all unit tests pass locally
2. `npm run test:integration --workspace=server` — all integration tests pass locally
3. `gh pr checks <number>` — CI green (unit + integration reported separately)
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
