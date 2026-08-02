# AISS developer study materials

Materials for the within-subject pilot / main study described in `../STUDY_PROTOCOL.md` and the ITCE/TiiS manuscript.

| File | Purpose |
|---|---|
| `RECRUITMENT.md` | Screening + invitation text |
| `CONSENT_FORM.md` | Informed consent template |
| `FACILITATOR_GUIDE.md` | Session runbook |
| `TASK_SCRIPT.md` | Participant-facing task instructions |
| `questionnaires/` | Demographics, SUS, NASA-TLX, post-condition scales |
| `data/schemas.md` | CSV schemas for anonymized study data |
| `data/counterbalance-template.csv` | Condition order assignments |
| `data/coding-sheet-template.csv` | Per-task objective coding |

## Pilot plan

1. Recruit 5–8 developers meeting screening criteria.
2. Assign counterbalanced orders from the template.
3. Run ~75–90 minute sessions with synthetic fixtures only.
4. Analyze effect sizes / variance → power the main study (~20–40).

## Ethics notes

- Use only synthetic project fixtures (`research/corpus` or a dedicated study fixture pack).
- Store `participant_id` as `P01`, `P02`, … — never names in data files.
- Adapt the consent form to your institution’s requirements before recruiting.
