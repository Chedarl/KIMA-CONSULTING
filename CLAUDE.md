# KIMA CONSULTING

Marketing / brochure site for KIMA Consulting.

> **TODO (owner):** fill in what the firm actually advises on, who the buyer is, and
> any existing brand assets (logo, colours, fonts). The design direction below was
> generated from a generic "professional consulting firm" brief and should be
> re-derived once that is known.

## Design authority

`docs/design/design-system/kima-consulting/MASTER.md` is the single source of truth for
colour, typography, spacing, motion and the pre-delivery checklist. Read it before
writing any UI.

Per-page overrides live in `docs/design/design-system/kima-consulting/pages/<page>.md`.
When a page file exists it **overrides** MASTER.md; otherwise MASTER.md applies.

## Design workflow

Use the `ui-ux-pro-max` skill for all UI work (installed at user scope, available here).
Its local database answers style / palette / typography / UX / stack questions without
guessing:

```
python ~/.claude/skills/ui-ux-pro-max/scripts/search.py "<query>" -d <domain> -n 5
python ~/.claude/skills/ui-ux-pro-max/scripts/search.py "<page brief>" --design-system \
  --project-name "KIMA Consulting" --persist \
  --output-dir docs/design --format markdown
```

Domains: `style`, `color`, `typography`, `landing`, `product`, `ux`, `chart`, `icons`,
`gsap`, `react`, `web`, `google-fonts`. Add `--stack <stack>` for stack-specific rules.

Related skills: `ui-styling` (shadcn/Tailwind implementation), `design-system` (token
architecture), `brand` (voice and identity), `banner-design`, `slides`.

## Non-negotiables

- Text contrast >= 4.5:1 in light and dark mode.
- Visible focus rings (3-4px) on every interactive element; full keyboard navigation.
- Respect `prefers-reduced-motion`; no autoplaying carousel without pause/stop.
- Touch targets >= 44x44px.
- SVG icons (Heroicons / Lucide) - never emojis as icons.
- Verify at 375px, 768px, 1024px and 1440px.
- Avoid: playful styling, hidden credentials, AI purple/pink gradients.
