# Research tooling

Publication support for AI Code Session Saver (AISS).

## Layout

```
research/
  DATA_COLLECTION_PLAN.md   # experiment plan + RQs
  schemas/                  # CSV column definitions
  scripts/                  # corpus + benchmark runners
  corpus/                   # generated synthetic sessions (gitignored)
  results/                  # experiment CSVs (gitignored by default)
```

## Quick start

```bash
npm test
npm run research:generate-corpus -- --count 30 --seed 42
npm run research:discovery
npm run research:fidelity
npm run research:portability
npm run research:performance
```

Results are written to `research/results/*.csv`.
