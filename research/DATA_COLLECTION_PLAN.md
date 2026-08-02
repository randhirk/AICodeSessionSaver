# AISS Research Data Collection Plan

Target venues: **ITCE** (primary), **JET** (backup), **ACM TiiS** (after human study).

This folder holds experiment definitions, CSV schemas, synthetic corpus tooling, and result writers used to support publication claims.

## Research questions

| ID | Question | Primary scripts |
|---|---|---|
| RQ1 | Discovery + normalization accuracy across providers | `bench-discovery`, `bench-fidelity` |
| RQ2 | Bundle portability / integrity across machines & OS | `bench-portability` |
| RQ3 | Indexing and search overhead as corpus grows | `bench-performance` |
| RQ4 | Baseline continuation trade-offs (tokens, steps, integrity) | `bench-baselines` |
| RQ5 | Developer resume effectiveness (time, tokens, success) | human study (see below) |
| RQ6 | Cross-tool continuation quality | fidelity + resume prompts + baselines |
| RQ7 | Privacy / integrity risks of portable session artifacts | portability corruption tests |

## Minimum corpus targets (ITCE)

| Variable | Target |
|---|---|
| Total labeled sessions | ≥ 300 |
| Per provider (Claude / Cursor / Codex) | ≥ 100 |
| Export/import round trips | ≥ 100 |
| Machine-transfer scenarios | ≥ 50 |
| Scaling sizes | 10, 100, 1_000, 5_000 |

Current automated generator defaults to a smaller **pilot corpus** (`--count 30` per provider) so local iteration is fast. Increase for the paper:

```bash
npm run research:generate-corpus -- --count 100
npm run research:all
```

## Synthetic data policy

- Use only synthetic or fully anonymized transcripts.
- Do not commit real employer code, credentials, prompts, or PII.
- Generated files live under `research/corpus/` (gitignored).
- Aggregated CSVs under `research/results/` are safe to commit once scrubbed.

## CSV schemas

See `research/schemas/` for column definitions. Every major paper table should map to one of these files.

## Human study (required for ACM TiiS)

Pilot 5–8 developers, then ~20–40 after power analysis. Within-subject crossover: AISS vs baseline on resume-after-close, delayed resume, machine move, cross-tool, orphan recovery. Capture time-to-first-useful-action, task success, repeated explanations, tokens, SUS, NASA-TLX.

Ethics: informed consent + anonymization before any participant data is stored.

## Reproducibility checklist

- [ ] Tagged release matching manuscript version
- [ ] `npm test` green in CI
- [ ] Corpus generation seed recorded in results metadata
- [ ] Hardware / OS / Node / provider versions recorded
- [ ] Scripts regenerate tables without manual editing
- [ ] Medium article disclosed as prior public background

## Commands

```bash
npm test
npm run research:generate-corpus -- --count 30 --seed 42
npm run research:discovery
npm run research:fidelity
npm run research:portability
npm run research:performance
npm run research:all
```
