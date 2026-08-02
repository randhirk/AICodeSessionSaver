# Facilitator guide

## Before the session

1. Assign `participant_id` and condition order from `data/counterbalance-template.csv`.
2. Prepare a clean study machine/VM with:
   - Node ≥ 20, cloned AISS at a tagged release
   - Synthetic project fixture + pre-seeded interrupted sessions for both conditions
   - Baseline path documented (native resume / manual paste instructions)
3. Open coding sheet row for this participant.
4. Confirm consent signed; note recording preference.

## Session timeline (~90 min)

| Minutes | Activity |
|---:|---|
| 0–10 | Consent, demographics, overview |
| 10–15 | Tooling warm-up (list sessions; one practice resume) |
| 15–45 | Condition A — Tasks 1–3 |
| 45–55 | Post-condition questionnaires (SUS, NASA-TLX, Likert) |
| 55–85 | Condition B — Tasks 4–6 (or mirrored set) |
| 85–95 | Post-condition questionnaires + short debrief |

Use the same task *types* in both conditions; counterbalance which concrete fixture maps to which condition.

## Timing rules

- Start timer when the participant first attempts recovery (not during reading).
- Mark **time_to_first_useful_action** when they issue a recovery command or paste continuation context.
- Mark **time_to_first_correct_edit** when the first accepted code change matching the success rubric lands.
- Stop on success, explicit give-up, or 12-minute task cap.

## Coding tips

- Count repeated explanations when the participant restates prior goals the AI already had in the interrupted session.
- Count incorrect AI assumptions when the assistant invents missing decisions contradicted by the fixture transcript.
- If recording is off, narrate codes aloud into notes immediately after each task.

## After the session

1. Save questionnaires under `data/raw/<participant_id>/` (local only; gitignored).
2. Do not commit participant PII.
3. Redact any accidental secrets before analysis export.
