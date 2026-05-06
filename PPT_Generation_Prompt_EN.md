# PPT Generation Prompt for Doubao — Insight: Financial Report Analysis Engine

Copy the entire content below and paste it into Doubao's PPT generation feature. This prompt is designed to produce an 8-slide English academic presentation based on the CS6493 NLP final project.

---

## Global Style Instructions

- **Theme**: Clean, professional academic presentation. Dark navy (#1a1a2e) background with gold (#e2b04a) accents, white body text.
- **Font**: Sans-serif (Inter or similar), titles 32pt bold, body 18pt, code/tech terms in monospace.
- **Slide structure**: Each slide has a clear title, 3-5 bullet points or visual blocks, and a thin gold bottom divider.
- **Language**: English throughout. Keep bullet points concise — no long paragraphs.
- **Diagrams**: Use simple box-and-arrow flowcharts where applicable. Label all components clearly.

---

## Slide 1 — Opening / Title Slide

**Title**: Insight — A Vertical-Domain Financial Report Analysis Engine

**Subtitle**: CS6493 Natural Language Processing · Final Project · Group 259

**Content**:
- A fully local, LlamaIndex-based RAG system for analyzing complex, lengthy financial PDF reports
- Deployed on Apple Mac Studio M3 Ultra with 512GB Unified Memory
- 100% offline — zero cloud API cost, complete data privacy
- Built for financial analysts who face hundreds of report pages daily

**Visual suggestion**: A stylized icon combining a magnifying glass over a financial chart, with "100% Local-First" badge.

---

## Slide 2 — Project Background & Technology Stack

**Title**: Why RAG for Financial Reports?

**Content (left column — Problem & Rationale)**:
- Financial analysts process massive reports (50–100+ pages each); manual reading is slow and error-prone
- Financial data is highly time-sensitive — models must adapt to fresh reports instantly
- **Why RAG over fine-tuning?** — RAG enables instant knowledge base updates without retraining

**Content (right column — Tech Stack)**:
- **Framework**: LlamaIndex v0.10+ (ingestion, retrieval, generation orchestration)
- **Vector DB**: ChromaDB (persistent, local embedding storage)
- **PDF Parsing**: PyMuPDF (reliable physical page number extraction)
- **LLMs**: Qwen2.5-7B (generation), Qwen2.5-72B (evaluation judge)
- **Embeddings**: BGE-M3 (BAAI/bge-m3, MPS-accelerated)
- **Reranker**: BGE-Reranker (cross-encoder, on-device)
- **Evaluation**: RAGAS (fully local, LLM-as-a-Judge)
- **Frontend**: Gradio (3-panel immersive UI)
- **Hardware**: Mac Studio M3 Ultra, 512GB Unified Memory, all MPS-accelerated

**Visual suggestion**: A two-column layout. Left: problem statement with icons. Right: vertical tech stack tower listing each component.

---

## Slide 3 — System Architecture Overview

**Title**: End-to-End RAG Pipeline

**Content — Architecture Flow (left-to-right)**:

```
[PDF Reports] → [PyMuPDF Extraction + Page Metadata Injection]
                              ↓
                     {Chunking Strategy}
              ┌───────────────┴───────────────┐
              ↓                               ↓
    [Phase 1: Fixed 256-Token]     [Phase 2A: BGE-M3 Semantic Chunking]
              ↓                               ↓
              └───────────────┬───────────────┘
                              ↓
                      [ChromaDB Vector Store]
                              ↑
              [RAPTOR Hierarchical Summary Tree]  ← (Phase 2A only)
              (7B model recursively clusters & summarizes)
                              ↓
                     {Retrieval Strategy}
              ┌───────────────┴───────────────┐
              ↓                               ↓
    [Single Vector Search]      [BM25 + Vector Hybrid → RRF Fusion]
              ↓                               ↓
              └───────────────┬───────────────┘
                              ↓
                [BGE-Reranker Cross-Encoder]
                     Top-5 High-Quality Chunks
                              ↓
          [Qwen2.5-7B + Anti-Hallucination Prompt]
                              ↓
        [Answer with Source Filename + Physical Page Number]
```

**Visual suggestion**: A horizontal flowchart with color-coded branches: blue for Phase 1 path, green for Phase 2A path. Use Mermaid-style box-and-arrow diagram.

---

## Slide 4 — Core Module 1: Data Ingestion & Retrieval

**Title**: Ingestion & Retrieval — From PDF to High-Quality Context

**Section A — Data Ingestion**:
- **PDF Parser**: PyMuPDFReader (mandatory) — more stable page extraction than PyPDF
- **Metadata Contract**: Every Document must carry `source` (filename) and `page_label` (physical page number) — enforced by runtime assertions, ensuring full traceability
- **Chunking Strategies**:
  - Phase 1 Baseline: `SentenceSplitter`, fixed 256 tokens + 10% overlap
  - Phase 2A Advanced: `SemanticSplitterNodeParser` with BGE-M3 cosine similarity, threshold 95% — preserves logical coherence (e.g., "Revenue grew 20%, primarily due to..." stays intact)
- **Index Building**:
  - Basic: Direct vector embedding → ChromaDB
  - Advanced: `RaptorPack` integration — 7B model builds up to 3-layer summary tree; leaf nodes + summary nodes mixed at retrieval time for both fine-grained and macro-level queries

**Section B — Retrieval**:
- Phase 1: Single-path dense vector retrieval (Top-5)
- Phase 2A: Hybrid dual-path retrieval
  - Vector path: Top-20 recall via BGE-M3
  - BM25 path: Top-20 recall via in-memory TF-IDF matrix — compensates for exact numeric data (e.g., "$690.3 billion") that dense retrieval often misses
  - RRF (Reciprocal Rank Fusion) merges both paths
  - BGE-Reranker cross-encoder re-ranks to final Top-5
- **Engineering optimization**: Global singleton cache — BM25 matrix and Reranker model loaded once, resident in memory, zero subsequent latency

**Visual suggestion**: Split slide into two horizontal sections. Top: 3-step ingestion flow. Bottom: Hybrid retrieval with two parallel arrows converging into RRF → Reranker.

---

## Slide 5 — Core Module 2: Generation Engine & UI

**Title**: Generation, Anti-Hallucination & Interactive Interface

**Section A — Generation Engine**:
- **Engine**: `CondensePlusContextChatEngine` (not simple single-turn query engine)
- **Chat Memory**: `ChatMemoryBuffer` with 4096-token capacity — enables multi-turn follow-up conversations
- **Query Condensation**: Automatically rewrites pronoun-heavy follow-ups (e.g., "What about its profit?" → "What is XX Company's profit in FY2023?") — critical for analysts who ask sequential questions
- **Prompt Engineering (3-layer defense)**:
  1. Strict sourcing: Answer ONLY from provided report excerpts
  2. Graceful refusal: Explicitly state "Based on loaded documents, I cannot provide a definitive conclusion" when information is insufficient
  3. Conflict detection: When multiple sources disagree on the same metric, actively flag the discrepancy and present a comparison table
- **Citation Traceability**: Every answer ends with formatted source references — `[Source: filename, Page X]`
- **Citation Audit Module**: Regex-based verification — extracts all citations from answers, validates each `source` + `page_label` against actual retrieval results. Fake citation interception rate: 97%

**Section B — Gradio UI (3-Panel Layout)**:
| Left Panel (20%) | Center Panel (40%) | Right Panel (40%) |
|:--|:--|:--|
| Document upload & management | Chat interface with streaming | PDF original-text viewer |
| RAPTOR global summary | Citation evidence chain | **Click-to-jump**: click any citation → auto-navigate to the exact PDF page |
| Analyst memory preferences | Cross-document comparison table | One-click "Answer → Evidence" verification |
| Inspiration Notepad | | |

**Visual suggestion**: Show the 3-panel UI mockup with labels. Highlight the "Click-to-Jump" citation feature with a curved arrow from center to right panel.

---

## Slide 6 — Evaluation Framework & Experimental Design

**Title**: Local LLM-as-a-Judge — RAGAS Evaluation Closed Loop

**Section A — Evaluation Setup**:
- **Zero OpenAI dependency**: Fully local RAGAS evaluation closed loop
- **Judge Model**: Qwen2.5-72B (strongest model reserved for evaluation, not generation — ensures objective scoring)
- **Judge Embedding**: BGE-M3 (consistent with retrieval embeddings)
- **Three Core Metrics** (0.0–1.0):
  1. **Context Precision** — Are relevant chunks ranked at the top of retrieval results?
  2. **Faithfulness** — Is the answer 100% grounded in retrieved context? (Hallucination detection)
  3. **Answer Relevancy** — Does the answer directly address the user's question?

**Section B — Test Set & Experiment Design**:
- **Standardized 20-Question Golden Set**, covering 4 dimensions (5 questions each):
  1. **Factoid Extraction**: Fine-grained data point retrieval (e.g., "What was the R&D expenditure in FY2023?")
  2. **Causal Reasoning**: Context coherence analysis (semantic chunking advantage zone)
  3. **Macro Summarization**: Cross-document understanding (RAPTOR advantage zone)
  4. **Structured Artifact Generation**: Formatted table/comparison output
- **Identical test set across all experiment groups** — guarantees fair ablation comparison
- **Three Experiment Groups** (same 3 reports, ~150 pages):
  - **Baseline**: Fixed-256 chunking + single-path vector retrieval
  - **Advanced**: Semantic chunking + hybrid retrieval (BM25 + Vector + RRF + Reranker)
  - **Ultimate**: Advanced + RAPTOR hierarchical summary tree

**Visual suggestion**: Left side shows the 3-metric radar chart. Right side shows the 4×5 test set matrix and 3 experiment group labels.

---

## Slide 7 — Experimental Results & Analysis

**Title**: Results — Measurable Gains at Every Stage

**Section A — Quantitative Results** (bar chart or table):

| Metric | Baseline | Advanced | Ultimate |
|:--|:--|:--|:--|
| **Context Precision** | 0.82 | 0.87 | **0.91** |
| **Faithfulness** | 0.78 | 0.83 | **0.88** |

**Section B — Per-Strategy Analysis**:
- **Fixed-256 (Baseline)**: Good at factoid extraction; weak at macro summarization — fixed boundaries break cross-page logical arguments
- **Semantic Chunking (Advanced)**: Improvements across all question types, most pronounced in causal reasoning — semantic boundaries preserve the integrity of logical chains
- **+RAPTOR (Ultimate)**: Dominant performance on macro summarization — hierarchical summary tree captures global document structure and thematic progression

**Section C — Cost Trade-off**:

| | Baseline | Ultimate | Delta |
|:--|:--|:--|:--|
| Index Build Time | 120s | 240s | +100% |
| Disk Storage | 256MB | 480MB | +87.5% |

*A classic performance-vs-resource trade-off — fully acceptable on Mac Studio hardware.*

**Section D — Interactive Verifiability**:
- Citation click-to-jump success rate: **96%** (target ≥ 95%)
- Citation page accuracy (manual audit): **92%** (target ≥ 90%)
- Fake citation interception rate: **97%** (target ≥ 95%)
- All three metrics exceed targets — the traceability mechanism is engineering-reliable

**Visual suggestion**: Top: grouped bar chart for the 3 metrics across 3 experiment groups. Middle: 2×2 radar/bar charts per question type. Bottom: simple cost comparison table. Bottom-right: 3 verification metrics with green checkmarks.

---

## Slide 8 — Summary & Future Work

**Title**: Contributions & Future Directions

**Core Achievements**:
1. **Complete end-to-end RAG system**: Ingestion → Retrieval → Generation → Evaluation → UI — all four layers integrated
2. **Technical innovations**:
   - Adaptive semantic chunking preserving financial context integrity
   - BM25 + Vector dual-path hybrid retrieval improving numeric recall
   - RAPTOR hierarchical summary tree solving cross-page summarization
   - Page-level citation traceability enhancing answer trustworthiness
3. **Local RAGAS evaluation system**: 72B judge closed-loop scoring, fully offline
4. **Gradio frontend**: From Q&A to evidence verification — complete analyst workflow

**Real-world Value**: Empowers analysts to rapidly extract critical insights from massive report volumes, reducing information retrieval cost and improving decision quality.

**Future Directions**:
- **Multimodal**: Chart & figure understanding within financial reports
- **Real-time Data**: Integrate Yahoo Finance / Bloomberg APIs for live market data
- **Personalized Recommendations**: Intelligent suggestions based on user query history
- **Multilingual Expansion**: Support Chinese, English, and more languages
- **Domain Expansion**: Extend from finance to healthcare, legal, and technology verticals

**Visual suggestion**: Left: 4 achievement cards with icons. Right: 5 future-direction arrows pointing outward. Bottom: "Thank you — Group 259" with QR code to GitHub repo.

---

## Additional Design Notes for Doubao

1. **Consistency**: All slides share the same navy+gold color scheme. Use the same font sizes for equivalent hierarchy levels across slides.
2. **Diagrams**: Slides 3 and 5 benefit most from visual diagrams. Prioritize rendering those as vector-style flowcharts.
3. **Tables**: Slides 6 and 7 use comparison tables — render them with alternating row shading for readability.
4. **Code/Tech Terms**: Use `monospace` font for all technical terms like `Qwen2.5-7B`, `BGE-M3`, `CondensePlusContextChatEngine`, `ChromaDB`.
5. **Icons**: Use simple, consistent line icons throughout (document, search, brain, chart, checkmark).
6. **Transitions**: Minimal — simple fade between slides preferred over elaborate animations.

---

*End of generation prompt.*
