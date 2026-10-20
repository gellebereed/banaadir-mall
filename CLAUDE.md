# Banaadir Mall — notes for AI agents

Multi-vendor marketplace: customer storefront, seller dashboard (`/vendor`),
admin panel (`/admin`). Next.js 15 App Router + React 19 + TypeScript +
Tailwind CSS 4. Data via Supabase, with a local JSON fallback (`lib/db.ts`).

## Start here — don't explore, look it up

1. **Read `.claude/graph/CODEMAP.md` first.** One line per file: route,
   purpose, exports, client/server. It is rebuilt automatically at session
   start (see `.claude/settings.json`) and answers "where is X?" without
   opening files.
2. **Need a neighbourhood?** `npm run graph -- --query <file-or-symbol>`
   prints imports, importers and the files that use an exported symbol.
3. Only then open files — and only the ones the graph pointed at. Large
   files (`app/actions.ts` is 3,000+ lines): grep for the function, then
   read that range.

For anything beyond a lookup, load the `banaadir-mall` skill
(`.claude/skills/banaadir-mall/SKILL.md`) — conventions, design tokens and
the checks to run before committing.

## Checks

- `npx tsc --noEmit` — typecheck (there is no linter or test suite).
- `npm run build` — full production build.
- `npm run graph` after adding, moving or deleting files.
