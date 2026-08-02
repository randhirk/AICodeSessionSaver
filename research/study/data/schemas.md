# Study data schemas (anonymized)

Do **not** commit files under `research/study/data/raw/`.

## participants.csv

```
participant_id,years_experience,primary_languages,ai_tools,ai_frequency,familiarity_claude,familiarity_cursor,familiarity_codex,os,recording_consent,condition_order,session_date,notes
```

## tasks.csv

```
participant_id,condition,task_id,task_type,success,time_to_first_useful_action_ms,time_to_first_correct_edit_ms,task_completion_time_ms,repeated_explanations_count,repeated_commands_count,incorrect_ai_assumptions_count,defects_introduced,prompt_tokens_to_reestablish_context,transcript_searches,manual_recovery_steps,gave_up,notes
```

`task_type` ∈ {terminal_close, delayed_resume, machine_transfer, cross_tool, orphan_recovery, locate_decision}

`condition` ∈ {aiss, baseline_native_or_paste}

## subjective.csv

```
participant_id,condition,sus_total,tlx_mental,tlx_physical,tlx_temporal,tlx_performance,tlx_effort,tlx_frustration,tlx_raw_mean,continuity,confidence,trust,control,frustration,adopt,notes
```

## Analysis notes

- Prefer paired tests (within-subject) for condition contrasts.
- Report effect sizes (e.g., Cohen’s dz) and confidence intervals.
- Pre-register pilot → main sample size after observing variance.
