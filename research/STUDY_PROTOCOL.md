# Participant study protocol (ACM TiiS / ITCE human evaluation)

## Design

- Within-subject crossover: each participant uses **AISS** and a **baseline** (native resume / manual paste).
- Counterbalance condition order.
- Pilot: 5–8 developers. Main study: power-analyze after pilot (~20–40 typical).

## Tasks (same across conditions)

1. Resume after terminal close
2. Resume after one-day delay (simulated)
3. Move session to another machine (bundle import)
4. Cross-tool continuation (e.g., Claude → Cursor)
5. Recover an orphaned session
6. Locate an earlier architectural decision in history

## Objective measures

- time_to_first_useful_action_ms
- time_to_first_correct_edit_ms
- task_completion_time_ms
- repeated_explanations_count
- repeated_commands_count
- incorrect_ai_assumptions_count
- task_success (0/1)
- defects_introduced
- prompt_tokens_to_reestablish_context
- transcript_searches
- manual_recovery_steps

## Subjective measures

- System Usability Scale (SUS)
- NASA-TLX
- perceived_continuity (1–7)
- confidence_restored (1–7)
- trust_in_context (1–7)
- perceived_control (1–7)
- frustration (1–7)
- willingness_to_adopt (1–7)

## Privacy

- No proprietary employer code in tasks; use synthetic fixtures from `research/corpus`.
- Store only anonymized participant IDs.
- Obtain informed consent before collection.
