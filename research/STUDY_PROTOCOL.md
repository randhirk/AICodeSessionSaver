# Participant study protocol (ACM TiiS / ITCE human evaluation)

Operational materials live in [`study/`](./study/).

## Design

- Within-subject crossover: each participant uses **AISS** and a **baseline** (native resume / manual paste).
- Counterbalance condition order (`study/data/counterbalance-template.csv`).
- Pilot: 5–8 developers. Main study: power-analyze after pilot (~20–40 typical).

## Tasks (same types across conditions)

See `study/TASK_SCRIPT.md`:

1. Resume after terminal close
2. Resume after one-day delay (simulated)
3. Move session / cross-tool / orphan recovery (facilitator assigns variant)

## Objective measures

Coded in `study/data/coding-sheet-template.csv` / `study/data/schemas.md`.

## Subjective measures

- System Usability Scale (`study/questionnaires/SUS.md`)
- NASA-TLX (`study/questionnaires/NASA-TLX.md`)
- Continuity / confidence / trust / control / frustration / adopt (`study/questionnaires/post-condition.md`)

## Privacy

- Synthetic fixtures only; informed consent (`study/CONSENT_FORM.md`).
- Anonymized IDs; raw responses stay local under `study/data/raw/` (gitignored).
