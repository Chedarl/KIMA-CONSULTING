# KIMA Design Language — the app-wide redesign, what to keep and what to change

Date: 3 November 2026. Scope: every dashboard and interface, not one screen.
Decision: keep the KIMA brand as the default theme (navy + indigo + the Kima
wordmark) and give every firm the four-knob brand studio to override it.

## 1. Deep-dive inventory (grounded in the code)

KEEP:
- The CSS-variable token system in app/globals.css (--navy, --teal/--teal-text,
  light + dark themes). It is already the right shape; branding becomes a
  variable override, not a rewrite.
- The owner-decided palette (navy #18243B, indigo #455DA8, bg #F7F9FC, border
  #DCE3EC, body #273248, success #15803D) as the DEFAULT theme.
- The Kima wordmark and the honest state distinction (confirmed / draft /
  estimated / needs-review) baked into cards, tables and the money row.
- FR/EN parity, 44px targets, 4.5:1 contrast and restrained motion.

CHANGE (the redesign):
- A single **theme object** (accent + logo + subdomain + sender) resolved from
  the branding table, applied as CSS variables at the root — firm, company and
  client scopes — instead of hard-coded colours scattered in classes.
- One **component system** for the work surface: Card, StatTile, AttentionRail,
  WorkDrawer, CommandPalette, PipelineBoard, FilterBar — so every screen
  (dashboard, queue, inbox, billing, KYC, clients, settings) shares the same
  visual language instead of each screen inventing its own.
- **Density and hierarchy**: a 12-column canvas, a left attention rail, a
  right work drawer, a persistent top bar (greeting · presence · ⌘K · bell),
  and a revenue strip — the command-centre topology, applied consistently.
- **Motion**: one easing curve, 160–220ms, honouring prefers-reduced-motion,
  for drawer, palette, filter and toast — never gratuitous.
- **The client mirror** keeps its four zones but inherits the firm's theme and
  logo, so the portal feels like the firm, not like KIMA.

## 2. Theming architecture

```
branding(scope=firm) ── accent ──▶ CSS variables --teal / --teal-text / --navy
                 logo_path ──▶ portal + firm header wordmark (signed URL)
                 portal_slug ──▶ custom subdomain (DNS-verified)
                 sender ──▶ Resend from address
```

Default = KIMA navy + indigo + wordmark. Firm override = accent first (the
highest-signal change), then logo, then subdomain, then sender. Derived hover
and focus states are computed from the accent so a firm picks ONE colour and
the whole app follows.

## 3. Delivery
1. Theme layer: theme.ts + ThemeRoot (accent override) — this round.
2. Component system consolidation (Card/StatTile/Rail/Drawer everywhere).
3. Brand studio UI (four knobs) writing the branding row.
4. Logo + subdomain + sender propagation.
5. Per-screen layout pass (firm + client) on the new system.
