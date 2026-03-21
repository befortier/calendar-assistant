# Calendar Assistant — Claude Instructions

## React Code Review (Required)

Before creating any PR that includes `.tsx` or `.ts` UI files, invoke all three of these skills in order:

1. `react-best-practices` — performance, data fetching, bundle optimization
2. `composition-patterns` — component architecture, reusability, prop design
3. `web-design-guidelines` — accessibility, UX, visual best practices

This applies to any React code written in `app/src/`. Do not skip these even for small changes.

## GitHub Account

This project uses the `befortier` GitHub account. `GH_TOKEN` is set via `.claude/settings.local.json`. All `gh` commands will automatically use the correct account.

## Issue Tracking

This project uses **beads (bd)** for all issue tracking. See `AGENTS.md` for full reference.
