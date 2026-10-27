# Handoffs between agents

One file per note: `YYYY-MM-DD-<from>-to-<to>-<slug>.md`, for example
`2026-10-27-a-to-b-incident-contract.md`. `<from>` and `<to>` are `a`, `b`, `cos`
(chief of staff) or `owner`. Link the note from the PR it relates to. The chief of
staff reads every note on each triage and carries open ones on the coordination board.

```markdown
# <one-line subject>

- **From → to:** Agent A → Agent B
- **Status:** open | answered | closed
- **Blocks:** <PR, backlog item or journey step, or "nothing">

## What is needed / what changed
<plain description; file paths; for a schema request, the fields and who may write them>

## Why
<the requirement or defect it serves, with a link>

## Done when
<a checkable condition>
```
