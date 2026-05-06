# 📊 任务追踪与进度看板 (Task Tracking Board)

> **操作规范**:
> 任何开发者（人类或 AI）在完成一个模块的开发并跑通本地测试后，**必须**回到本文档，将对应的 `[ ]` 修改为 `[x]`，并简要填写完成日期或备注。

---

## 📈 项目整体进度摘要 (Overall Progress)

- **Phase 0 (架构与规范)**: 🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 100% (5/5) - **已完成**
- **Phase 1 (核心引擎与裁判)**: 🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 100% (9/9) - **已完成**
- **Phase 2A (RAG 增强与评估闭环)**: 🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 100% (7/7) - **已完成**
- **Phase 2B (Agent 与沉浸交互收尾)**: 🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 100% (4/4) - **已完成**

**总计完成度**: 100% (25/25)

---

## 🎯 阶段 0: 架构设计与规范对齐 (Phase 0: Architecture & Alignment)
*本阶段旨在确立项目边界、消除技术歧义，为后续编码扫清障碍。*

- [x] **0.1 核心执行计划确立**: 制定对标 NotebookLM 且完美切中课程评分点的双阶段路线图 (`00_course_execution_plan.md`)。
- [x] **0.2 架构细节与数据契约**: 定义 Ingest/Retrieval 链路细节，强制规定 `source` 和 `page_label` 的元数据契约 (`01_architecture_data_flow.md`)。
- [x] **0.3 评估与实验体系设计**: 确立本地 72B RAGAS 裁判模型，固定 20 题金融测试集，并设计好性能权衡表格 (`02_evaluation_metrics.md`)。
- [x] **0.4 建立 AI 上下文总览**: 为后续接手的 AI 设定 5 条铁律（100%本地、v0.10+、配置驱动、文档同步等），防止开发跑偏 (`00_README_AI_CONTEXT.md`)。
- [x] **0.5 清理旧版干扰文档**: 将过期的技术草案移入 `archive/` 目录，确保真理源的唯一性。

---

## 🚀 阶段 1: 核心引擎与无情裁判 (Phase 1: The Engine & The Judge)
*本阶段旨在跑通最基础的 RAG 链路，证明系统能读取研报并用本地大模型完成问答与打分。*

### 1.1 基础配置锁定
- [x] 修改 `configs/config.yaml`，锁定 `strategy: fixed`，`chunk_size: 256`，关闭高级特性。

### 1.2 数据接入 (Ingest)
- [x] `src/ingest/pdf_parser.py`: 实现 `load_financial_pdfs()`，读取 PDF 并提取包含 `source` 和 `page_label` 的 Document。
- [x] `src/ingest/chunker.py`: 实现 `get_baseline_nodes()`，使用 `SentenceSplitter(256, 25)` 进行基础切块。
- [x] `src/ingest/indexer.py`: 实现 `build_vector_index()`，使用 `bge-m3` 将 Node 存入 `chroma_db/phase1_baseline`。

### 1.3 检索与生成 (Retrieval & Generation)
- [x] `src/retrieval/retriever.py`: 实现基础的单路向量检索 `VectorIndexRetriever(top_k=5)`。
- [x] `src/generation/pipeline.py`: 实现 `run_basic_qa()`，使用 `qwen2.5:7b` 根据检索片段生成回答，强制要求带页码引用。

### 1.4 评估闭环 (Evaluation) - [核心里程碑]
- [x] 准备 20 个标准化的金融测试题 (`data/test_set.json`)。
- [x] `src/evaluation/ragas_eval.py`: 将 `qwen2.5:72b` 实例化为 RAGAS 的本地裁判。
- [x] 运行评估脚本，产出 Phase 1 架构的 Context Precision 和 Faithfulness 基准得分。

---

## 🔥 阶段 2A: RAG 增强与完整评估闭环 (Phase 2A: RAG Upgrade & Full Evaluation)
*本阶段先专注于“整套 RAG 系统可量化验证”：先完成语义分块、混合检索、RAPTOR，再完成全量评估与实验记录；UI 放到下一阶段收尾。*

### 2.1 高级架构跃升 (Adaptive & Macro)
- [x] 修改 `configs/config.yaml`，开启 `semantic` 分块和 `raptor`。
- [x] `src/ingest/chunker.py`: 接入 BGE-M3，实现真正的语义分块 (`SemanticSplitterNodeParser`)。
- [x] `src/ingest/indexer.py`: 引入 `RaptorPack`，后台使用 `qwen2.5:7b` 等 7B 级小模型构建宏观树状摘要，存入 `chroma_db/phase2_raptor`。

### 2.2 多路混合召回 (Hybrid Search)
- [x] `src/retrieval/retriever.py`: 集成 BM25 和 Vector 检索，使用 `QueryFusionRetriever` 进行 RRF 融合（避免新增平行模块）。
- [x] 引入 `bge-reranker-base` 对融合后的 Top-N 进行交叉编码器精排。

### 2.3 整套 RAG 评估闭环（先完成） [阶段里程碑]
- [x] 固定 20 题测试集，在升级后的 Phase 2A 架构上跑全量评估（RAGAS + 引用核查）。
- [x] 用 72B 裁判对 Phase 2A 架构重新打分（资源不足时按文档降级策略执行并备注）。
- [x] 记录构建时间与磁盘占用，在 `02_evaluation_metrics.md` 中填写完《内存-性能权衡实验记录表》。

---

## 🧩 阶段 2B: Agent 与沉浸交互收尾 (Phase 2B: Agent & Immersive UI Finalization)
*在 2A 的 RAG 评估闭环完成后，再进行能力扩展与前端打磨，确保展示层建立在稳定可验证的底座上。*

### 2B.1 自主代理 (Autonomous Agent)
- [x] `src/generation/agent.py`: 编写 `fetch_stock_price(ticker)` 雅虎金融工具，并通过 `ReActAgent` 集成，实现研报基本面与实时股价的客观综合展示。

### 2B.2 沉浸交互 (Gradio UI & RLHF) - [终极里程碑/最后收尾]
- [x] `src/ui/app.py`: 在现有基础上完善左侧多源管理、右侧对话/产物的 NotebookLM 级工作台。
- [x] 在完成 2A 评估闭环后，实现前端引用点击联动 PDF 动态跳转的“可验证交互”。
- [x] 加入 Like/Dislike 按钮，将人类偏好反馈写入本地 `jsonl` 日志，完成 RLHF 基础建设。