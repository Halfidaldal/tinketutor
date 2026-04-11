# TinkeTutor Web

Next.js frontend for the TinkeTutor study workspace. The app provides the Phase 1 shell for Danish-first authentication, dashboard, sources, knowledge maps, tutoring, evidence review, quizzes, and gap analysis.

## Development

```bash
npm run dev
```

Set the required `NEXT_PUBLIC_*` Firebase and API variables before starting the app locally.

## Validation

Run the same checks used in the Phase 1 validation gate:

```bash
npm run lint
npm run build
```

## Locale Layer

User-visible strings live in:

- `lib/i18n/da.json`
- `lib/i18n/en.json`

The app shell is wrapped in `I18nProvider` from `lib/i18n/index.tsx`, and client components should read translated strings through `useI18n()`.

## Scope Notes

Phase 1 intentionally rebrands the visible shell to TinkeTutor and Knowledge Map without renaming internal `canvas_*`, notebook, or route symbols.
