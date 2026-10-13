# AERA design system

The source of truth for tokens is `app/globals.css`, with primitives in `components/ui.tsx`. This file explains the intent.

## Direction

Editorial and calm, with one saturated signal. Near-black ink, an off-white canvas and a single "ledger green" brand colour carry the identity. Big display type uses heavy negative tracking and a two-tone pattern: the statement is in ink, and the qualifier in muted. System labels (eyebrows, table headers, metadata) use monospace uppercase to read as instrument readouts. Surfaces alternate between dark and light bands on the product site; the workspace is light with a floating dark sidebar.

## Tokens

| Role | Token | Value |
| --- | --- | --- |
| Ink | `--ink` / `ink` | `#0a0c10` |
| Dark surfaces | `--ink-2`, `--ink-3` | `#111419`, `#191d24` |
| Canvas | `--canvas` | `#f4f5f7` |
| Surface | `--surface` | `#ffffff` |
| Hairline | `--line`, `--line-strong` | `#e3e6eb`, `#cdd2da` |
| Muted text | `--muted` | `#5b6270` (≥ 4.5:1 on canvas and surface) |
| Brand | `--brand`, `--brand-strong`, `--brand-soft` | `#0a8f5f`, `#066f49`, `#e5f5ed` |
| Glow (accent on dark only) | `--glow` | `#3fe29d` |
| "Next move" card | `--lime`, `--lime-ink` | `#e3f3bb`, `#233512` |
| Status | success / warning / danger / info / violet | see `globals.css` |

Every colour also has an `--name-rgb` channel token so Tailwind opacity modifiers (`bg-ink/40`) work.

## Type

- **Geist** for UI and display. Display uses `.display` (weight 500, tracking −0.045em, line-height 0.98). Page titles use `.title` plus `.title-muted` for the second line.
- **Geist Mono** for `.eyebrow`, table headers, references (invoice numbers, UTRs) and timestamps.
- Use tabular numerals (`.tabular`) for all money and counts.

## Components

- `PageHeader`: mono eyebrow with a glow dot, then a two-tone title, with actions on the right.
- `panel` / `panel-dark`: 16px radius, hairline border, soft long shadow.
- Buttons: `btn-primary` (ink), `btn-light` (white on dark), `btn-outline`, `btn-ghost`, `btn-brand`; `btn-sm` modifier.
- `StatusBadge`: tinted pill with a status dot. Tone is derived from the status key.
- `Tabs`: underline tabs with mono count chips. Links, so views are shareable URLs.
- `StatTile`, `EmptyState`, `Pagination`, `SectionTitle`.
- Dark "agenda" band and lime "next move" card are reserved for the single most important action on a page.

## Motion

Subtle and purposeful: `animate-rise` (12px fade-up) for entering overlays and results, 150ms colour transitions, `active:scale-[0.98]` press feedback. All motion is disabled under `prefers-reduced-motion`.

## Rules

- No emoji icons. Use Lucide at 15–18px with a 1.8 stroke in navigation.
- Every interactive element needs a visible focus state (global brand outline, or input ring).
- Minimum touch target is 40px. Layouts are verified at 375, 768, 1024 and 1440px with no horizontal page scroll.
- Never use colour alone for status. Badges carry text.
