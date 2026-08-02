# AISS: A Unified Persistence, Portability, and Recovery Architecture for AI Coding Sessions

**Manuscript draft for** *Information Technologies and Computer Engineering* (ITCE)  
**Status:** Working draft v2 — synthetic corpus + baseline comparisons (seed=42, n=100/provider)  
**Software:** [AI Code Session Saver (AISS)](https://github.com/randhirk/AICodeSessionSaver) v0.1.0  
**Prior public background:** Medium article *AI Code Session Saver* (disclose on submission)

---

## Abstract

AI coding agents such as Claude Code, Cursor Agent, and Codex CLI store conversational and tool-use context in incompatible on-disk formats and offer uneven resume capabilities. When a terminal closes, a machine changes, or a developer switches tools, prior context is often lost, forcing costly re-explanation. This paper presents **AISS** (AI Code Session Saver), a provider-agnostic architecture for discovering, normalizing, indexing, packaging, and continuing AI coding sessions. AISS contributes (1) a unified session abstraction and extensible adapters, (2) a versioned portable `.aiss` bundle format with lossless raw-source preservation and checksum validation, and (3) a provider-aware continuation model combining native restoration with generated context transfer. We evaluate AISS on a labeled synthetic corpus of **300 sessions** (100 per provider) and compare continuation baselines including full transcript paste, last-10 messages, heuristic summaries, raw JSONL copy, and AISS context prompts/bundles. Discovery achieves precision, recall, and F1 of **1.0** for all providers; normalization yields **0** schema failures; clean export/import round trips succeed for **300/300** sessions with mean compression ratio **0.45**; and corrupted bundles are detected in **100/100** cases. Relative to full transcript paste, AISS context prompts reduce estimated tokens by **16.3%** while retaining high probe completeness (**0.92**) and fewer mean manual steps (**1.33** vs **3**). Raw JSONL backups preserve bytes but are not cross-tool resume prompts and lack integrity checks. We discuss synthetic-evaluation limits, outline a developer study protocol for causal productivity claims, and release reproducible benchmarks with the open-source implementation.

**Keywords:** AI coding agents; session persistence; software tooling; interoperability; developer productivity; reproducibility

---

## 1. Introduction

Large language model (LLM) coding assistants are increasingly embedded in developer workflows through command-line and IDE-integrated agents. These systems maintain rich session state: user intents, assistant plans, tool invocations, filesystem edits, and project-specific constraints. Unlike conventional IDE undo history, this state is often conversational and provider-specific. Claude Code stores JSONL transcripts under hashed project directories with a separate history index; Cursor Agent writes agent transcripts under project-scoped directories; Codex CLI persists rollout JSONL files with session metadata and parent-thread links. Resume mechanisms likewise diverge: some tools support native session IDs, while others require developers to manually reconstruct context.

This fragmentation creates practical failures. Sessions become *orphaned* when index entries diverge from transcript files. Context is trapped on a single machine when developers change laptops. Cross-tool continuation is unsupported even when the underlying engineering task is continuous. The engineering cost appears as repeated prompts, duplicated investigation, and increased token spend—effects that are difficult to measure without a shared representation of sessions.

**Research questions.**

- **RQ1.** How accurately can a provider-agnostic layer discover and normalize heterogeneous AI coding sessions?
- **RQ2.** To what extent can portable bundles preserve session content and detect integrity failures?
- **RQ3.** What indexing and packaging overhead does unified session management introduce as corpora grow?
- **RQ4.** How do AISS continuation artifacts compare with common baselines (full paste, last-N, heuristic summary, raw JSONL copy) on tokens, completeness probes, manual steps, cross-tool capability, and integrity?
- **RQ5.** (Future / human study) Does session persistence reduce wall-clock time and developer effort when resuming interrupted AI-assisted work?

**Contributions.**

1. A provider-independent session model and adapter architecture for Claude Code, Cursor Agent, and Codex CLI.
2. A versioned `.aiss` artifact format supporting normalized transcripts, raw source embedding, compression, and SHA-256 checksum validation.
3. A continuation planner that uses native resume commands where available and generated context prompts otherwise.
4. An open evaluation methodology with synthetic corpus generation plus automated discovery, fidelity, portability, performance, and **baseline** benchmarks.
5. Empirical results on a 300-session labeled corpus showing accurate discovery, reliable portability, and favorable baseline trade-offs for AISS prompts/bundles under the evaluated conditions.

A prior Medium article describes the engineering motivation of AISS for a general audience. This manuscript extends that background with formal research questions, controlled experiments, quantitative results, limitations, and reproducibility artifacts.

---

## 2. Related Work

### 2.1 AI-assisted programming systems

Research on LLM-based coding assistants spans code completion, conversational repair, agentic tool use, and IDE integration [1–6]. Systems such as Copilot, Claude Code, Cursor, and Codex illustrate production deployments where the assistant operates over repositories with tool access. Prior work emphasizes generation quality, trust, and productivity, but comparatively less attention has been paid to *long-lived session continuity* across process boundaries and tools.

### 2.2 Conversation and context management

Context window limits motivate summarization, retrieval-augmented memory, and hierarchical memory architectures for agents [7–11]. Distilled project memory in AISS is related to these ideas but is specialized to coding-agent transcripts and local-first storage rather than remote memory services.

### 2.3 Interoperability and portable artifacts

Software engineering has long used portable formats for build artifacts, containers, and notebooks [12–14]. AISS applies a similar philosophy to AI coding sessions: normalize for interchange, retain originals for lossless recovery, and validate integrity on import.

### 2.4 Developer tooling evaluation

Empirical SE methods for tool evaluation include controlled tasks, telemetry, and mixed-methods studies [15–17,21]. Our current results focus on systems correctness, performance, and automated baselines; human workload/usability instruments (SUS, NASA-TLX) and the developer protocol are prepared in `research/study/` for RQ5 [24,25].

Machine-readable bibliography: `paper/references.bib`.

---

## 3. System Design

### 3.1 Architecture overview

AISS is implemented as a Node.js CLI (`aiss`) with:

1. **Adapters** that discover provider-specific transcripts and normalize them into a unified session schema.
2. **Index** storage for searchable session metadata.
3. **Encoder/decoder** for gzip-compressed `.aiss` bundles with checksums.
4. **Resume planner** that emits native commands or continuation prompts.
5. **Optional distilled memory** that summarizes project-level decisions and per-session outcomes for reuse in new chats.

### 3.2 Unified session model

A session record includes provider, identifiers, project/cwd paths, model (when available), timestamps, ordered messages (user/assistant/system/tool), parent/child connections, resume hints, and source path fingerprints. The schema is validated with Zod to enforce structural invariants used by packaging and resume logic.

### 3.3 Adapters

| Provider | Discovery roots | Resume strategy |
|---|---|---|
| Claude Code | `CLAUDE_CONFIG_DIR/projects/**/*.jsonl` | Native `claude --resume` (+ optional transcript restore) |
| Cursor Agent | `CURSOR_PROJECTS_DIR/*/agent-transcripts/**` | Generated context prompt |
| Codex CLI | `CODEX_HOME/sessions/**/rollout-*.jsonl` | Native `codex resume` |

Environment overrides (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `CURSOR_PROJECTS_DIR`) enable hermetic evaluation without touching a developer’s live home directory.

### 3.4 Portable `.aiss` bundles

A bundle (format `aiss`, version 1) stores:

- normalized `session` object;
- optional `raw` map of original transcript files (utf8/base64);
- `encodedAt` timestamp;
- SHA-256 `checksum` over the JSON payload with an empty checksum field.

On-disk encoding is gzip. Decode verifies the checksum against the **raw parsed JSON** before schema normalization, avoiding false mismatches from key reordering during validation.

### 3.5 Threat model (summary)

Transcripts may contain source code, secrets, and proprietary prompts. AISS is local-first: indexing and packaging do not require network access. Bundles can be exported explicitly; checksums detect accidental corruption and simple tampering. Full adversarial analysis (zip bombs, path traversal on import, secret redaction accuracy) is future work and is partially specified in the research plan.

---

## 4. Materials and Methods

### 4.1 Synthetic corpus

We generated a labeled corpus with the open script `research/scripts/generate-corpus.ts`:

| Parameter | Value |
|---|---|
| Sessions per provider | 100 |
| Total sessions | 300 |
| Providers | Claude Code, Cursor, Codex |
| Projects / languages | 5 synthetic projects (TypeScript, Python, Swift, Java, Go) |
| Size buckets | short / medium / long |
| Seed | 42 |
| OS (generation host) | macOS (`darwin`) |
| Node.js | v25.8.2 |

Claude fixtures include orphaned sessions (missing `sessionId` in some lines). Codex fixtures include parent-thread links. Cursor fixtures include XML-wrapped user queries. Empty and malformed JSONL files are added as negatives for discovery robustness.

**Ethics / privacy.** Only synthetic content is used. No employer code, credentials, or personal data are included.

### 4.2 Discovery experiment (RQ1)

Ground-truth session IDs from `sessions.csv` were compared to adapter discovery output. We report precision, recall, F1, orphan recovery rate, duplicate rate, and incorrect project-association rate per provider.

### 4.3 Normalization fidelity (RQ1)

Each discovered session was validated against `UnifiedSessionSchema`. We measured timestamp presence rate, ordering errors, metadata field coverage (projectPath, cwd, model, resumeHint), parent/child link accuracy, and schema failure count.

### 4.4 Portability and integrity (RQ2)

For each discovered session we:

1. read raw transcript bytes;
2. encoded a `.aiss` bundle;
3. decoded and verified checksum;
4. compared hashes of embedded raw files.

Additionally, for 50 sessions we injected random byte corruption and incorrect checksums and recorded whether decode rejected the bundle.

### 4.5 Performance (RQ3)

Using the discovered corpus, we measured full scan time and, for subset sizes 10 / 100 / 300, in-memory index construction, search latency percentiles, and median export/import times, along with process RSS.

### 4.6 Baseline comparisons (RQ4)

For every discovered session we compared six continuation/backup strategies:

| Baseline | Description |
|---|---|
| `full_transcript_paste` | Concatenate all normalized messages into a pasteable prompt |
| `last_10_messages` | Paste only the last 10 messages |
| `heuristic_summary` | Compact summary from first user, last assistant, and recent tools |
| `raw_jsonl_copy` | Copy original provider transcript files |
| `aiss_context_prompt` | AISS `buildContextPrompt` (last 30 messages + headers) |
| `aiss_bundle` | Encoded `.aiss` artifact (integrity + portability) |

**Metrics.** Estimated tokens (`ceil(chars/4)`), probe-based information completeness (fraction of session id / project path / first-user / last-assistant snippets retained), coded manual steps, cross-tool capability, integrity validation, and portability. Token estimates are tokenizer-agnostic approximations suitable for relative comparison; absolute counts may differ by provider tokenizer.

### 4.7 Reproducibility

```bash
npm ci
npm test
npm run research:generate-corpus -- --count 100 --seed 42
npm run research:all
```

Scripts write CSVs under `research/results/` (gitignored). Aggregate tables in this draft correspond to seed 42; see `paper/results-summary-itce.json`.

---

## 5. Results

### 5.1 Discovery accuracy (RQ1)

**Table 1. Discovery metrics on the synthetic corpus (n=100/provider).**

| Provider | Expected | Found | Precision | Recall | F1 | Orphan recovery | Duplicates |
|---|---:|---:|---:|---:|---:|---:|---:|
| Claude Code | 100 | 100 | 1.00 | 1.00 | 1.00 | 1.00 | 0.00 |
| Cursor | 100 | 100 | 1.00 | 1.00 | 1.00 | 1.00 | 0.00 |
| Codex | 100 | 100 | 1.00 | 1.00 | 1.00 | 1.00 | 0.00 |

Empty/malformed files were not counted as valid sessions (false-positive rate 0 in this setup).

### 5.2 Normalization fidelity (RQ1)

**Table 2. Fidelity summary (n=300 discovered sessions).**

| Metric | Value |
|---|---|
| Schema validation failures | 0 |
| Ordering errors | 0 |
| Mean timestamp accuracy | 1.00 |
| Mean metadata field coverage | 0.92 |
| Parent/child link accuracy | 1.00 |

Metadata coverage is below 1.0 primarily because Cursor sessions do not expose a model field in the transcript format used by the adapter.

### 5.3 Portability and integrity (RQ2)

**Table 3. Bundle round-trip and corruption detection.**

| Scenario | Outcome |
|---|---|
| Clean round trips | **300/300** success (session ID + raw hash match) |
| Mean compression ratio (bundle/original) | **0.45** |
| Mean export latency | **0.16 ms** |
| Mean import/verify latency | **0.16 ms** |
| Random corruption / bad checksum detection | **100/100** rejected |

### 5.4 Performance (RQ3)

**Table 4. Scaling snapshot (full scan ≈ 143 ms for 300 sessions).**

| Sessions | Index (ms) | Search p50 (ms) | Search p95 (ms) | Export p50 (ms) | Import p50 (ms) | RSS (MB) |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 0.04 | 0.0007 | 0.0020 | 0.17 | 0.23 | 87 |
| 100 | 0.02 | 0.0007 | 0.0013 | 0.14 | 0.14 | 94 |
| 300 | 0.05 | 0.0006 | 0.0012 | 0.13 | 0.12 | 99 |

At these scales, packaging and lookup overhead is negligible relative to interactive AI-agent latency.

### 5.5 Baseline comparisons (RQ4)

**Table 5. Mean continuation/backup trade-offs (n=300 sessions).**

| Baseline | Mean tokens | vs full paste | Completeness | Manual steps | Cross-tool | Integrity | Portable |
|---|---:|---:|---:|---:|---|---|---|
| full_transcript_paste | 307.2 | 0% | 0.75 | 3.00 | yes | no | no |
| last_10_messages | 95.9 | −68.8% | 0.59 | 3.00 | yes | no | no |
| heuristic_summary | 44.5 | −85.5% | 1.00* | 2.00 | yes | no | no |
| aiss_context_prompt | 257.2 | −16.3% | 0.92 | 1.33 | yes | no | no |
| raw_jsonl_copy | 1112.3 | +262.1% | 1.00 | 3.00 | no | no | yes |
| aiss_bundle | 257.2 | −16.3% | 1.00 | 1.33 | yes | **yes** | **yes** |

\*Heuristic summaries score highly on the short probe set (id/path/first-user/last-assistant) but can omit mid-session tool traces that AISS context retains via the last-30 window. Last-10 paste achieves the largest token cut but the lowest probe completeness (**0.59**), illustrating the risk of aggressive truncation. Only **AISS bundles** combine cross-tool continuation support with checksum integrity validation; raw JSONL copies preserve provider files but are not a normalized, cross-tool resume interface.

---

## 6. Discussion

### 6.1 Answers to research questions

**RQ1.** On a controlled synthetic corpus matching adapter expectations, AISS discovers and validates sessions with perfect precision/recall and no schema failures. This establishes baseline correctness of the normalization pipeline; it does not yet prove robustness against the full diversity of production transcript versions.

**RQ2.** Lossless raw embedding plus pre-schema checksum verification yields reliable round trips and strong detection of the tested integrity faults. Compression roughly halves on-disk size for the synthetic transcripts.

**RQ3.** Unified scanning of hundreds of sessions remains interactive on a laptop-class host. Larger corpora (thousands to tens of thousands), SQLite query plans, and file-watcher overhead require additional measurement.

**RQ4.** Compared with full paste, AISS context prompts cut estimated tokens by 16.3% while keeping high probe completeness and reducing coded manual steps. Aggressive last-10 truncation saves more tokens but loses completeness. Heuristic summaries are cheapest but are not integrity-checked portable artifacts. Raw JSONL backups are portable at the filesystem level yet provider-locked and larger when measured as text. **AISS bundles uniquely combine portability, integrity validation, and cross-tool continuation support** in this comparison.

### 6.2 Implications

A portable session layer can decouple *developer continuity* from *vendor storage formats*. Organizations adopting multiple AI CLIs can treat sessions as first-class artifacts for backup, audit, and handoff—subject to privacy controls.

### 6.3 Relation to prior public description

The Medium article presents the product narrative. This paper adds experimental methodology, quantitative tables, limitations, and reusable scripts. Submission cover letters should disclose the prior article and emphasize the new empirical material.

---

## 7. Limitations

1. **Synthetic corpus.** Transcripts follow current adapter assumptions; real-world format drift, partial writes, and multi-file sessions may reduce accuracy.
2. **Single host OS.** Results are from macOS; Linux/Windows path and filesystem semantics need explicit multi-OS runs.
3. **Token estimator.** `chars/4` enables relative comparisons but is not a provider tokenizer.
4. **Completeness probes.** The probe set is intentionally simple; human-rated information adequacy remains future work (especially for heuristic summaries).
5. **Manual-step coding.** Step counts are structured estimates from resume plans, not measured stopwatch times.
6. **No human-subject results yet.** Wall-clock productivity claims (RQ5) require running `research/study/` (consent, tasks, SUS/NASA-TLX).
7. **Security evaluation incomplete.** Network isolation, secret redaction, and adversarial import cases are not fully benchmarked.
8. **Ceiling effects.** Near-perfect discovery scores on synthetic data should be read as pipeline self-consistency, not final field performance.

---

## 8. Future Work

- Expand corpus to mixed real anonymized sessions under ethics constraints.
- Add 1k–10k session scaling and persistent index benchmarks.
- Multi-OS machine-transfer experiments.
- Replace token estimates with provider tokenizers; add human completeness ratings.
- Conduct pilot then powered within-subject developer study (RQ5).
- Strengthen import sandboxing and optional redaction.
- Additional adapters (Aider, OpenCode, Gemini CLI) and Cursor SQLite resume.

---

## 9. Conclusion

AISS provides a practical interoperability layer for AI coding sessions across Claude Code, Cursor Agent, and Codex CLI. Controlled experiments on 300 synthetic sessions show accurate discovery, successful lossless packaging, reliable corruption detection, low runtime overhead, and baseline trade-offs that favor AISS prompts/bundles when integrity, cross-tool continuation, and reduced manual steps matter. These results support ITCE-oriented claims about software architecture and information processing for AI developer tooling. Completing multi-OS transfers and a developer study will strengthen causal claims about productivity and prepare a longer human–AI interaction submission.

---

## 10. Data and Code Availability

- Source code: https://github.com/randhirk/AICodeSessionSaver  
- License: MIT  
- Reproduction: `research/DATA_COLLECTION_PLAN.md`, `npm run research:all`  
- Human-study packet: `research/study/`  
- Aggregate results for this draft: `paper/results-summary-itce.json`  
- Bibliography: `paper/references.bib`

---

## 11. References

1. Chen, M., Tworek, J., Jun, H., Yuan, Q., et al. (2021). Evaluating large language models trained on code. *arXiv:2107.03374*.
2. Fried, D., Aghajanyan, A., Lin, J., Wang, S., et al. (2023). InCoder: A generative model for code infilling and synthesis. *ICLR*.
3. Barke, S., James, M. B., & Polikarpova, N. (2023). Grounded Copilot: How programmers interact with code-generating models. *PACMPL*, 7(OOPSLA1). https://doi.org/10.1145/3586030
4. Vaithilingam, P., Zhang, T., & Glassman, E. L. (2022). Expectation vs. experience: Evaluating the usability of code generation tools powered by large language models. *CHI EA ’22*. https://doi.org/10.1145/3491101.3519665
5. Mozannar, H., Bansal, G., Fourney, A., & Horvitz, E. (2024). Reading between the lines: Modeling user behavior and costs in AI-assisted programming. *CHI ’24*. https://doi.org/10.1145/3613904.3641936
6. Jimenez, C. E., Yang, J., Wettig, A., Yao, S., Pei, K., Press, O., & Narasimhan, K. R. (2024). SWE-bench: Can language models resolve real-world GitHub issues? *ICLR*.
7. Packer, C., Wooders, S., Lin, K., Fang, V., et al. (2023). MemGPT: Towards LLMs as operating systems. *arXiv:2310.08560*.
8. Zhong, W., Guo, L., Gao, Q., Ye, H., & Wang, Y. (2024). MemoryBank: Enhancing large language models with long-term memory. *AAAI*.
9. Gao, Y., Xiong, Y., Gao, X., Jia, K., et al. (2023). Retrieval-augmented generation for large language models: A survey. *arXiv:2312.10997*.
10. Park, J. S., O’Brien, J., Cai, C. J., Morris, M. R., Liang, P., & Bernstein, M. S. (2023). Generative agents: Interactive simulacra of human behavior. *UIST ’23*. https://doi.org/10.1145/3586183.3606763
11. Shinn, N., Cassano, F., Gopinath, A., Narasimhan, K., & Yao, S. (2023). Reflexion: Language agents with verbal reinforcement learning. *NeurIPS*.
12. Merkel, D. (2014). Docker: Lightweight Linux containers for consistent development and deployment. *Linux Journal*, 2014(239).
13. Kluyver, T., Ragan-Kelley, B., Pérez, F., Granger, B., et al. (2016). Jupyter Notebooks—a publishing format for reproducible computational workflows. In *Positioning and Power in Academic Publishing*.
14. Di Cosmo, R., & Zacchiroli, S. (2017). Software Heritage: Why and how to preserve software source code. *iPRES*.
15. Kitchenham, B. A., Pfleeger, S. L., Pickard, L. M., Jones, P. W., Hoaglin, D. C., El Emam, K., & Rosenberg, J. (2002). Preliminary guidelines for empirical research in software engineering. *IEEE TSE*, 28(8), 721–734. https://doi.org/10.1109/TSE.2002.1027796
16. Wohlin, C., Runeson, P., Höst, M., Ohlsson, M. C., Regnell, B., & Wesslén, A. (2012). *Experimentation in Software Engineering*. Springer.
17. Ko, A. J., LaToza, T. D., & Burnett, M. M. (2015). A practical guide to controlled experiments of software engineering tools with human participants. *Empirical Software Engineering*, 20(1), 110–141. https://doi.org/10.1007/s10664-013-9279-3
18. Bird, C., Menzies, T., & Zimmermann, T. (2015). *The Art and Science of Analyzing Software Data*. Morgan Kaufmann.
19. Sadowski, C., & Zimmermann, T. (Eds.). (2019). *Rethinking Productivity in Software Engineering*. Apress.
20. Weisz, J. D., Muller, M., Houde, S., Richards, J., Ross, S. I., Martinez, F., Agarwal, M., & Talamadupula, K. (2021). Perfection not required? Human–AI partnerships in code translation. *IUI ’21*, 402–412. https://doi.org/10.1145/3397481.3450656
21. Liang, J. T., Yang, C., & Myers, B. A. (2024). A large-scale survey on the usability of AI programming assistants: Successes and challenges. *ICSE ’24*. https://doi.org/10.1145/3597503.3608128
22. Ross, S. I., Martinez, F., Houde, S., Muller, M., & Weisz, J. D. (2023). The Programmer’s Assistant: Conversational interaction with a large language model for software development. *IUI ’23*. https://doi.org/10.1145/3581641.3584037
23. Nam, D., Macvean, A., Hellendoorn, V., Vasilescu, B., & Myers, B. (2024). Using an LLM to help with code understanding. *ICSE ’24*. https://doi.org/10.1145/3597503.3639187
24. Brooke, J. (1996). SUS: A “quick and dirty” usability scale. In *Usability Evaluation in Industry*. Taylor & Francis.
25. Hart, S. G., & Staveland, L. E. (1988). Development of NASA-TLX (Task Load Index). *Advances in Psychology*, 52, 139–183.
26. Anthropic. (2026). Claude Code documentation (session storage / resume). Accessed 2026-08-01.
27. Cursor. (2026). Cursor documentation (agent transcripts / projects). Accessed 2026-08-01.
28. OpenAI. (2026). Codex CLI documentation (resume / rollouts). Accessed 2026-08-01.
29. Kumar, R. (2026). AI Code Session Saver. *Medium*. Prior public background. https://medium.com/@randhirkr_34313/ai-code-session-saver-hero-4b6ca8bc35ea
30. Kumar, R. (2026). AI Code Session Saver (AISS) [Computer software]. https://github.com/randhirk/AICodeSessionSaver

Machine-readable BibTeX: `paper/references.bib`.

---

## Appendix A. Threat model checklist (for Methods expansion)

- [ ] Confirm no outbound network during `sync`/`export`/`import` under firewall test
- [ ] Bundle path-traversal tests on import
- [ ] Decompression bomb limits
- [ ] Secret-pattern redaction accuracy on synthetic leaks
- [ ] Filesystem permission defaults for index and bundles

## Appendix B. ITCE submission checklist

- [ ] ≥ ~4,000 words in final camera-ready prose
- [x] Abstract 200–300 words
- [x] Baseline comparison table
- [x] ≥ 20 scholarly references with verified metadata (BibTeX + DOIs where available)
- [x] Developer study materials packet (`research/study/`)
- [ ] ≤ 12 figures/tables
- [x] Reproducible Materials and Methods
- [ ] Disclose Medium prior publication in cover letter
- [ ] Author affiliation / ORCID
- [ ] Do not submit simultaneously to another journal
