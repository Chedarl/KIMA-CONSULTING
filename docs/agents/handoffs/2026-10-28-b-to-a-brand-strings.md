# Product-name strings in Agent A's files (rebuild of PR #8)

- **From → to:** Agent B → Agent A
- **Status:** open
- **Blocks:** nothing (the mails still send; they show the old name until applied)

## What is needed / what changed

Owner decision D8 confirmed the official KIMA CONSULTING lockups and the product
name **KIMA OS** ("yes", 27 Oct 2026). Agent B rebuilt PR #8 on
`agent-b/brand-kima-os` and left out the two files Agent B may not edit. PR #8 changed
the strings below. They are restated here against current `main` (8bb83cb). Only
the string literals change. No logic changes.

### `lib/auth-mail.ts` (`deliverOneTimeCode`)

| Line on main | Now | Becomes |
|---|---|---|
| 57 | `"Kima Consulting <onboarding@resend.dev>"` (fallback for `KIMA_MAIL_FROM`) | `"KIMA CONSULTING <onboarding@resend.dev>"` |
| 73 | `"Kima — votre code d'accès cabinet"` | `"KIMA OS — votre code d'accès cabinet"` |
| 74 | `"Kima — your firm access code"` | `"KIMA OS — your firm access code"` |
| 76 | `"Kima — votre code d'accès"` | `"KIMA OS — votre code d'accès"` |
| 77 | `"Kima — your access code"` | `"KIMA OS — your access code"` |
| 90 | `"— Kima Consulting"` | `"— KIMA CONSULTING"` |

### `app/api/inquiry/route.ts` (`POST`)

| Line on main | Now | Becomes |
|---|---|---|
| 17 | `"Kima Consulting <onboarding@resend.dev>"` (fallback for `KIMA_MAIL_FROM`) | `"KIMA CONSULTING <onboarding@resend.dev>"` |
| 102 | `` `Kima — pièces encore attendues pour ${taxpayer.legal_name}` `` | `` `KIMA OS — pièces encore attendues pour ${taxpayer.legal_name}` `` |
| 103 | `` `Kima — documents still needed for ${taxpayer.legal_name}` `` | `` `KIMA OS — documents still needed for ${taxpayer.legal_name}` `` |
| 116 | `"Vous pouvez les déposer directement dans votre espace Kima."` | `"Vous pouvez les déposer directement dans votre espace KIMA OS."` |
| 117 | `"You can upload them directly in your Kima portal."` | `"You can upload them directly in your KIMA OS portal."` |
| 119 | `"— Kima Consulting"` | `"— KIMA CONSULTING"` |

### Not in PR #8, for your judgement

`supabase/functions/auth-codes/index.ts` was added after #8 was opened and has
the same old strings: line 44, the `MAIL_FROM` fallback `"Kima Consulting
<onboarding@resend.dev>"`; line 129, the subject `"Kima — votre code d'accès"` /
`"Kima — your access code"`; and line 139, `` `— Kima Consulting (${audience})` ``.
`app/api/inquiry/route.ts` lines 152–153 (`"Kima vous a écrit…"` / `"Kima emailed
you…"`) use the short name "Kima" in an operational sentence. PR #8 left that
kind of sentence as it was, so this rebuild proposes no change there.
Changing it means redeploying the Edge Function, which needs its own owner approval.
`.claude/agents/kima-agent-a-security.md` and `kima-agent-b-journey.md` also say
"KIMA Compliance OS repository". That is the repository's description, not product
chrome, so it is left for the chief of staff.

## Why

D8 in `docs/agents/decisions/2026-10-27-owner-decisions.md`: Agent B rebuilds #8 and
"sends the string changes in `app/api/**` and `lib/auth-mail.ts` to Agent A".
The in-app chrome now says KIMA OS and KIMA CONSULTING. The mails still say
"Kima" and "Kima Consulting".

## Done when

`grep -rn "Kima Consulting\|Kima —\|espace Kima\|Kima portal" app/api lib/auth-mail.ts`
returns nothing on `main`, and the mail tests still pass.
