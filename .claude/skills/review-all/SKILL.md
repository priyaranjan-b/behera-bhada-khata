---
name: review-all
description: Review the current change in Behera Bhada Khata with the project reviewer agents (architecture, security, database, production readiness, UI conventions) in parallel, then merge their findings into one ranked list. Use before a commit or PR, or when asked to "review my changes" / "/review-all", optionally with one area (architecture, security, database, prod, ui).
---

# Review the current change

1. **Scope.** List changed files: `git diff --name-only main...HEAD` plus
   `git diff --name-only HEAD`. If nothing changed, say so and stop.
2. **Pick reviewers.** If the user named an area, run only that agent
   (`architecture` → architecture-reviewer, `security` → security-reviewer,
   `database` → database-reviewer, `prod` → production-readiness-reviewer,
   `ui` → ui-conventions-reviewer). Otherwise run:
   - always: architecture-reviewer, security-reviewer,
     production-readiness-reviewer;
   - database-reviewer when `supabase/`, `src/lib/types.ts`,
     `src/server/ports.ts`, `src/server/adapters/drizzle/` or
     `test/schema.test.ts` changed;
   - ui-conventions-reviewer when `src/app/`, `src/components/` or
     `src/theme/` changed.
3. **Run them in parallel** (one message, one Agent call each), passing the
   changed-file list. Don't pass your own opinion of the code.
4. **Merge.** Drop duplicates (keep the most specific), drop anything
   `npm run lint` / `npm run typecheck` already enforces, and confirm each
   Critical by reading the cited line. Present one list: Critical, then
   Warning, then Nit, each `path:line — finding — fix (reviewer)`.
5. **Stop and ask** which findings to fix. Don't edit code unprompted.

For bugs in the diff, `/code-review` complements this; the user-level
`/review-generic` runs the general-purpose `my-` reviewers.
