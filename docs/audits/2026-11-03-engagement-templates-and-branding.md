# Engagement templates and brandable workspaces — research, alternatives, blueprint

Date: 3 November 2026. Priority. Blending TaxDome, Senta, Financial Cents and
PennyLane, adapted to CEMAC accounting, without copying any of them.

## 1. What the four peers actually do (the reusable parts)

| System | Template capability | Branding capability | The transferable idea |
|---|---|---|---|
| TaxDome | pipeline templates per service; engagement letters; recurring jobs | white-label client portal, one branded app | a template is a *shaped job*, not a document; branding is a first-class asset, not a logo pasted on |
| Senta | CRM-driven onboarding checklists; automated job templates per client type | branded portal and client communications | the client *type* picks the template, so onboarding never starts blank |
| Financial Cents | workflow/request templates | custom portal URL + logo + button/link colours + branded notifications | branding has exactly four knobs and they are enough: URL, logo, accent colour, notification sender |
| PennyLane (GrowthCompta pattern) | structured client journey: KYC → lettre de mission (e-sign) → mandates → handoff to a production-ready dossier | white-label portal at a firm subdomain | the onboarding *is* a template instance: identity, engagement letter, access mandates, then production-ready |

The GrowthCompta pattern is the closest to the KIMA market: it runs KYC →
engagement letter → mandates → handoff. KIMA already has the KYC intake, the NIU
validation and the DSF pipeline; what it lacks is the *template* that strings
those into a reusable engagement, and the *branding* that makes each firm see its
own identity in the portal.

## 2. Critical thinking — adopt, adapt, reject

ADOPT:
- A template is a **reusable shape of an engagement**, not a letter. It owns the
  service set, the stage flow, the task checklist, the document requests and the
  engagement-letter text — instantiating it creates all of those at once.
- **Inbuilt templates** (the starter library) live beside firm-created templates,
  so a new firm is productive on day one and can diverge from day two.
- **Branding as a small typed object** (logo, accent colour, portal subdomain,
  notification sender) with three scopes: firm default, company/group, per-client
  override. Four knobs are enough.
- **The onboarding journey is a template instance** (GrowthCompta): KYC → lettre de
  mission with e-signature → mandates/access → handoff to the workspace.

ADAPT:
- Multi-tenant white-label for *firms* (each firm brands its own portal) is the
  core; company-level branding is a thin override for firms that run several
  practices under one roof.

REJECT:
- A WYSIWYG page builder (drag-and-drop HTML) — too much surface for too little
  gain; a constrained template editor with a live preview is enough.
- Per-client bespoke layouts — one responsive layout, branded by colour and logo,
  keeps the four-question client mirror intact.
- Billing/feature-gating by template (Scale-plan paywalls) — everything ships in
  the product, not as an upsell.

## 3. The UX/UI blueprint

### 3.1 The template editor (firm side)

One screen, three panes:
1. **Shape** — name, service set, stage flow (reuse STAGE_FLOW), default relative
   deadlines (+30, +60 days), owner role.
2. **Checklist & requests** — ordered tasks per stage and the document requests
   the client must fulfil (reuse the existing request model), bilingual labels.
3. **Engagement letter** — a structured letter (parties, scope, fees, forfait,
   OHADA references) rendered from fields with a live preview, not a raw HTML
   editor. French first, English available.

A **live preview** shows the client-facing side under the selected branding.
Save = a new immutable version; editing a template in use prompts apply-to-new-
engagements-only (existing engagements keep their shape).

### 3.2 The brand studio (firm side)

Four knobs, mirroring Financial Cents:
- **Logo** (upload → Storage, no external URL dependency).
- **Accent colour** (one primary + derived hover; the picker warns when contrast
  drops below 4.5:1).
- **Portal subdomain** (e.g. firmname.kima.cm), verified like the Resend DNS we
  already run.
- **Notification sender** (name + no-reply address) — flows into the Resend sender.

Scopes: firm (default) → company/group (override) → client (final override).

### 3.3 The client journey (the mirror, branded)

The existing four-question mirror stays; branding recolours and re-signs it. The
onboarding run becomes a template instance: KYC (identity, NIU, structure) →
lettre de mission (rendered from the template, e-signed) → mandates/access → the
workspace with the service progress trail.

## 4. Backend model (one migration, forward-only)

engagement_templates
  id, organization_id (RLS: firm reads/writes its own), name, kind (inbuilt|firm),
  services jsonb, stage_flow jsonb, letter jsonb, version, is_active, created_by

engagement_template_steps
  template_id, seq, stage, tasks jsonb[], requests jsonb[]

branding
  id, organization_id, scope (firm|company|client), subject_id,
  logo_path, accent, portal_slug, sender_name, sender_email, updated_at

engagements (existing) gains template_id + template_version

Everything RLS-scoped; templates and branding are records, not code, so the
frontend and backend share one source of truth. No government claims, no invented
OHADA references — the letter only surfaces what the corpus already verifies.

## 5. Alternative ways to arrive here (weighed)

| Option | Verdict | Why |
|---|---|---|
| Config-in-code (a TypeScript file per template) | ADOPT for the inbuilt starter library | reviewable, typed, ships with the repo |
| DB-driven templates for firm-created ones | ADOPT | users edit without a deploy; the inbuilt library seeds the table |
| CSS variables for branding | ADOPT | one theme object, propagated to the shell, portal and emails |
| A separate white-label app per firm | REJECT | multi-tenant subdomains + branding scope do the same with one deploy |
| React email templates for notifications | ADAPT | reuse the Resend text path now, upgrade to branded HTML later |

## 6. Delivery order (priority)

1. engagement_templates + branding schema + RLS (Agent A).
2. Inbuilt starter templates (config-in-code seed) + template editor UI.
3. Brand studio UI + CSS-variable theme propagation to the firm shell, client
   portal and notification sender.
4. Template instantiation on new engagement + the branded onboarding run
   (KYC → lettre de mission → mandates → handoff).
5. Playwright: create a template, brand the firm, onboard a client, see the
   branding and the instantiated checklist on the client side.

Each step a small, gated PR; schema first so both sides build against one model.
