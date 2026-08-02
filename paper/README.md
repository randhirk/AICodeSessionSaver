# Paper drafts

- `manuscript-itce-draft.md` — working ITCE research article draft
- `references.bib` — cleaned BibTeX bibliography
- `results-summary-itce.json` — aggregate metrics from the seeded synthetic run (safe to commit)

Human-study materials: [`../research/study/`](../research/study/).

Regenerate numbers:

```bash
npm run research:generate-corpus -- --count 100 --seed 42
npm run research:all
```
