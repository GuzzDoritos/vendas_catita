# Catita project conventions

## Scope and stack
- Small personal app: React + TypeScript + Vite, Vercel Functions, Neon Postgres.
- Keep changes focused and dependencies minimal. Do not introduce a framework, ORM, account system, or offline sync without a concrete request.
- UI language is pt-BR. Keep the existing wine/dark-pink palette, clear typography and mobile-first layouts. Avoid redundant cards, badges and decoration.

## Data and calculations
- Money is integer centavos. Prod is nullable integer hundredths (233 means 2,33); its monthly mean uses only entered dates up to today, including explicit zero.
- Business dates use YYYY-MM-DD in America/Sao_Paulo. Never convert a date-only key through UTC.
- Goals are monthly: optional Impulso, then Gatilho, Acelera, Incrível. Preserve historical values; never shift legacy goal positions.
- Folga is shared between sales and time tracking. Sales on a folga still count; folgas never count as remaining sales days.
- New shifts have one entry and one exit within the same date, with no break deduction. No holiday-specific setting. Keep legacy two-period records and unused holiday storage fields compatible; editing a legacy shift converts it to continuous time with a visible notice. Never invent a missing clock-out or silently treat an unfinished shift as zero.
- Store time as integer minutes. Worked hours are derived from completed pairs. Extra hours are max(0, worked - expected), calculated only when the shift is complete. No negative balance or payroll rules.
- Preserve the expected duration saved with each shift when editing monthly defaults.
- Missing values differ from zero. Charts must not turn missing or future entries into zero data.

## Safety and persistence
- Never print, commit or put server secrets into the frontend. Keep .env.local and reference spreadsheets out of Git.
- Preserve password/cookie authentication, origin checks, server validation, login limits and revision-based conflict protection.
- Version backups and accept older supported formats through explicit conversion. Keep old sales and goals intact.
- Add numbered migrations; do not edit an already-applied migration. Use additive changes and versioned database functions when an older deployment could still be running.
- Database tests must roll back test mutations. Never overwrite live records to create a demo.

## Verification and delivery
- Run npm test and npm run build for domain/API changes. On Windows use npm.cmd if necessary.
- Exercise relevant database changes with rollback-only checks; report whether the migration was actually applied.
- Verify significant UI changes at mobile and desktop sizes when browser tooling is available; report limitations honestly.
- Update README/DEPLOYMENT for changed behavior and setup. Explain important decisions and remaining deployment steps briefly.
- Do not delegate architectural or visual decisions. Use sub-agents only when the user explicitly requests delegation.
