# AISS: A Unified Persistence, Portability, and Recovery Architecture for AI Coding Sessions

**Manuscript draft for** *Information Technologies and Computer Engineering* (ITCE)  
**Status:** Working draft — results from synthetic corpus (seed=42, n=100/provider)  
**Software:** [AI Code Session Saver (AISS)](https://github.com/randhirk/AICodeSessionSaver) v0.1.0  
**Prior public background:** Medium article *AI Code Session Saver* (disclose on submission)

---

## Abstract

AI coding agents such as Claude Code, Cursor Agent, and Codex CLI store conversational and tool-use context in incompatible on-disk formats and offer uneven resume capabilities. When a terminal closes, a machine changes, or a developer switches tools, prior context is often lost, forcing costly re-explanation. This paper presents **AISS** (AI Code Session Saver), a provider-agnostic architecture for discovering, normalizing, indexing, packaging, and continuing AI coding sessions. AISS contributes (1) a unified session abstraction and extensible adapters, (2) a versioned portable `.aiss` bundle format with lossless raw-source preservation and checksum validation, and (3) a provider-aware continuation model combining native restoration with generated context transfer. We evaluate AISS on a labeled synthetic corpus of **300 sessions** (100 per provider). Discovery achieves precision, recall, and F1 of **1.0** for all providers; normalization yields **0** schema failures and **0** ordering errors; clean export/import round trips succeed for **300/300** sessions with mean compression ratio **0.45**; and randomly corrupted or checksum-tampered bundles are detected in **100/100** cases. Indexing and search overhead remain sub-millisecond at the evaluated scales. We discuss limitations of synthetic evaluation, outline a developer study protocol for interaction claims, and release reproducible benchmark scripts with the open-source implementation.

**Keywords:** AI coding agents; session persistence; software tooling; interoperability; developer productivity; reproducibility

---

## 1. Introduction

Large language model (LLM) coding assistants are increasingly embedded in developer workflows through command-line and IDE-integrated agents. These systems maintain rich session state: user intents, assistant plans, tool invocations, filesystem edits, and project-specific constraints. Unlike conventional IDE undo history, this state is often conversational and provider-specific. Claude Code stores JSONL transcripts under hashed project directories with a separate history index; Cursor Agent writes agent transcripts under project-scoped directories; Codex CLI persists rollout JSONL files with session metadata and parent-thread links. Resume mechanisms likewise diverge: some tools support native session IDs, while others require developers to manually reconstruct context.

This fragmentation creates practical failures. Sessions become *orphaned* when index entries diverge from transcript files. Context is trapped on a single machine when developers change laptops. Cross-tool continuation is unsupported even when the underlying engineering task is continuous. The engineering cost appears as repeated prompts, duplicated investigation, and increased token spend—effects that are difficult to measure without a shared representation of sessions.

**Research questions.**

- **RQ1.** How accurately can a provider-agnostic layer discover and normalize heterogeneous AI coding sessions?
- **RQ2.** To what extent can portable bundles preserve session content and detect integrity failures?
- **RQ3.** What indexing and packaging overhead does unified session management introduce as corpora grow?
- **RQ4.** (Future / human study) Does session persistence reduce time, effort, and tokens required to resume interrupted AI-assisted work?

**Contributions.**

1. A provider-independent session model and adapter architecture for Claude Code, Cursor Agent, and Codex CLI.
2. A versioned `.aiss` artifact format supporting normalized transcripts, raw source embedding, compression, and SHA-256 checksum validation.
3. A continuation planner that uses native resume commands where available and generated context prompts otherwise.
4. An open evaluation methodology and synthetic corpus generator with automated discovery, fidelity, portability, and performance benchmarks.
5. Empirical results on a 300-session labeled corpus demonstrating high discovery fidelity and reliable round-trip portability under the evaluated conditions.

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

Empirical SE methods for tool evaluation include controlled tasks, telemetry, and mixed-methods studies [15–18]. Our current results focus on systems correctness and performance; Section 8 specifies a within-subject protocol for productivity claims needed by human–AI interaction venues.

*(Reference list is expanded in Section 11; finalize DOIs and page numbers before submission.)*

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

### 4.6 Reproducibility

```bash
npm ci
npm test
npm run research:generate-corpus -- --count 100 --seed 42
npm run research:all
```

Scripts write CSVs under `research/results/` (gitignored). Aggregate tables in this draft correspond to seed 42 on the host above.

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

---

## 6. Discussion

### 6.1 Answers to research questions

**RQ1.** On a controlled synthetic corpus matching adapter expectations, AISS discovers and validates sessions with perfect precision/recall and no schema failures. This establishes baseline correctness of the normalization pipeline; it does not yet prove robustness against the full diversity of production transcript versions.

**RQ2.** Lossless raw embedding plus pre-schema checksum verification yields reliable round trips and strong detection of the tested integrity faults. Compression roughly halves on-disk size for the synthetic transcripts.

**RQ3.** Unified scanning of hundreds of sessions remains interactive on a laptop-class host. Larger corpora (thousands to tens of thousands), SQLite query plans, and file-watcher overhead require additional measurement.

### 6.2 Implications

A portable session layer can decouple *developer continuity* from *vendor storage formats*. Organizations adopting multiple AI CLIs can treat sessions as first-class artifacts for backup, audit, and handoff—subject to privacy controls.

### 6.3 Relation to prior public description

The Medium article presents the product narrative. This paper adds experimental methodology, quantitative tables, limitations, and reusable scripts. Submission cover letters should disclose the prior article and emphasize the new empirical material.

---

## 7. Limitations

1. **Synthetic corpus.** Transcripts follow current adapter assumptions; real-world format drift, partial writes, and multi-file sessions may reduce accuracy.
2. **Single host OS.** Results are from macOS; Linux/Windows path and filesystem semantics need explicit multi-OS runs.
3. **No live baseline comparison yet.** Native resume UX and manual paste baselines are specified but not fully measured in this draft.
4. **No human-subject results yet.** Productivity, token savings, and usability claims (RQ4) require the protocol in `research/STUDY_PROTOCOL.md`.
5. **Security evaluation incomplete.** Network isolation, secret redaction, and adversarial import cases are not fully benchmarked.
6. **Perfect scores risk overfitting.** Near-ceiling metrics on synthetic data should be interpreted as pipeline self-consistency, not final field performance.

---

## 8. Future Work

- Expand corpus to mixed real anonymized sessions under IRB/ethics constraints.
- Add 1k–10k session scaling and persistent index benchmarks.
- Implement baseline comparisons (native resume, last-N paste, raw JSONL copy).
- Conduct pilot then powered within-subject developer study.
- Strengthen import sandboxing and optional redaction.
- Additional adapters (Aider, OpenCode, Gemini CLI) and Cursor SQLite resume.

---

## 9. Conclusion

AISS provides a practical interoperability layer for AI coding sessions across Claude Code, Cursor Agent, and Codex CLI. Controlled experiments on 300 synthetic sessions show accurate discovery, successful lossless packaging, reliable corruption detection, and low runtime overhead. These results support ITCE-oriented claims about software architecture and information processing for AI developer tooling. Completing baseline comparisons and a developer study will strengthen causal claims about productivity and prepare a longer human–AI interaction submission.

---

## 10. Data and Code Availability

- Source code: https://github.com/randhirk/AICodeSessionSaver  
- License: MIT  
- Reproduction: `research/DATA_COLLECTION_PLAN.md`, `npm run research:all`  
- Aggregate results for this draft: `paper/results-summary-itce.json`

---

## 11. References (draft set — verify before submission)

1. Chen, M., et al. Evaluating Large Language Models Trained on Code. arXiv:2107.03374, 2021.
2. Fried, D., et al. InCoder: A Generative Model for Code Infilling and Synthesis. ICLR, 2023.
3. Barke, S., et al. Grounded Copilot: How Programmers Interact with Code-Generating Models. PACMPL, 2023.
4. Vaithilingam, P., et al. Expectation vs. Experience: Evaluating the Usability of Code Generation Tools. CHI, 2022.
5. Mozannar, H., et al. Reading Between the Lines: Modeling User Behavior Improves Code Generation. NeurIPS, 2024.
6. Jimenez, C. E., et al. SWE-bench: Can Language Models Resolve Real-World GitHub Issues? ICLR, 2024.
7. Packer, C., et al. MemGPT: Towards LLMs as Operating Systems. arXiv:2310.08560, 2023.
8. Zhong, W., et al. MemoryBank: Enhancing Large Language Models with Long-Term Memory. AAAI, 2024.
9. Xu, F., et al. Retrieval-Augmented Generation for Large Language Models: A Survey. arXiv:2312.10997, 2023.
10. Park, J. S., et al. Generative Agents: Interactive Simulacra of Human Behavior. UIST, 2023.
11. Shinn, N., et al. Reflexion: Language Agents with Verbal Reinforcement Learning. NeurIPS, 2023.
12. Merkel, D. Docker: Lightweight Linux Containers for Consistent Development and Deployment. Linux Journal, 2014.
13. Kluyver, T., et al. Jupyter Notebooks—a publishing format for reproducible computational workflows. ELPUB, 2016.
14. Di Cosmo, R., Zacchiroli, S. Software Heritage: Why and How to Preserve Software Source Code. iPRES, 2017.
15. Kitchenham, B. A., et al. Preliminary Guidelines for Empirical Research in Software Engineering. IEEE TSE, 2002.
16. Wohlin, C., et al. Experimentation in Software Engineering. Springer, 2012.
17. Ko, A. J., et al. A Practical Guide to Controlled Experiments of Software Engineering Tools. IST, 2015?
18. Storey, M.-A., et al. How Software Developers Mitigate Collaboration Friction. CSCW/related SE venue — replace with exact cite.
19. Bird, C., et al. The Art and Science of Analyzing Software Data. Morgan Kaufmann, 2015.
20. Sadowski, C., Zimmermann, T. Rethinking Productivity in Software Engineering. Apress, 2019.
21. Weisz, J. D., et al. Perfection Not Required? Human-AI Partnerships in Code Translation. IUI, 2021.
22. Liang, J. T., et al. A Large-Scale Survey of Developers’ AI Assistant Usage. ICSE/FSE related — verify.
23. Ross, S. I., et al. The Programmer’s Assistant: Conversational Interaction with a Large Language Model for Software Development. IUI, 2023.
24. Nam, D., et al. Using an LLM to Help With Code Understanding. ICSE, 2024.
25. Anthropic. Claude Code documentation (session storage / resume). Retrieved 2026.
26. Cursor. Agent / project transcript documentation. Retrieved 2026.
27. OpenAI. Codex CLI documentation (resume / rollouts). Retrieved 2026.
28. Kumar, R. AI Code Session Saver (Medium article). 2026. Prior public background.

---

## Appendix A. Threat model checklist (for Methods expansion)

- [ ] Confirm no outbound network during `sync`/`export`/`import` under firewall test
- [ ] Bundle path-traversal tests on import
- [ ] Decompression bomb limits
- [ ] Secret-pattern redaction accuracy on synthetic leaks
- [ ] Filesystem permission defaults for index and bundles

## Appendix B. ITCE submission checklist

- [ ] ≥ ~4,000 words in final camera-ready prose
- [ ] Abstract 200–300 words (current draft ~180 — expand slightly in polish pass)
- [ ] ≥ 20 scholarly references with verified metadata
- [ ] ≤ 12 figures/tables
- [ ] Reproducible Materials and Methods
- [ ] Disclose Medium prior publication
- [ ] Author affiliation / ORCID
- [ ] Do not submit simultaneously to another journal
