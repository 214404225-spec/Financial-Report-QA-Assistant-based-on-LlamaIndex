# 🤖 开发者与 AI 助手上下文总览 (AI Context Index)

> **致接手本项目的任何人类开发者或 AI Agent**：
> 在你修改任何代码之前，**必须**首先阅读本文档。本文档是理解整个项目架构、边界约束和当前开发进度的“主索引 (Master Index)”。

---

## 1. 项目基本身份 (Project Identity)
- **项目名称**: Insight: 金融研报分析引擎 (Financial Report Analysis Engine)
- **核心目标**: 构建一个对标 NotebookLM 体验的垂直领域 RAG 问答系统，专注于长篇幅、高密度的金融 PDF 研报分析，提供精确到页码的引用溯源。
- **算力环境**: 运行于极致的 **Apple Mac Studio (M3 Ultra, 32-core CPU, 512GB Unified Memory)**。此硬件允许我们 100% 在本地无缝拉起 `72B` 级别的重型模型和复杂的宏观摘要树 (RAPTOR)。

---

## 2. 项目核心指导原则 (The 5 Golden Rules)
为防止架构跑偏或代码不可运行，所有开发工作必须遵守以下 5 条铁律：

1. **绝对的本地化与隐私 (Local-First Execution)**：
   - 严禁在代码中引入任何依赖 OpenAI、Anthropic 等云端 API 的逻辑。
   - 所有 LLM 推理（无论是生成回答还是 RAGAS 评估裁判）**必须**通过本地的 Ollama 引擎执行（如 `qwen2.5:72b`、`qwen2.5:7b`）。
2. **严苛的框架版本约束 (LlamaIndex v0.10+)**：
   - 本项目完全基于 LlamaIndex v0.10 以上的现代模块化架构构建。
   - 绝不允许使用旧版的 `from llama_index import ...`。所有核心组件必须从 `llama_index.core` 导入，所有集成库必须使用独立的包（如 `llama-index-llms-ollama`）。
3. **数据溯源的生命线 (The Metadata Contract)**：
   - 在数据接入（Ingest）阶段切分出的任何文本块（Node），其 `metadata` 字典中**必须且永远**包含两个键：`source` (原始文件名) 和 `page_label` (物理页码)。这是前端实现“点击跳页交互”的基石。
   - “引用点击跳页交互”属于当前计划的 **P2 必做能力**，不是可有可无的 UI 装饰。
4. **配置驱动 (Config-Driven)**：
   - 绝不允许在代码中硬编码诸如“模型名称”、“切块大小(chunk_size)”、“检索 Top-K”等参数。
   - 所有这类参数必须统一从项目根目录的 `configs/config.yaml` 中读取。
5. **文档与代码的绝对同步 (Docs as Code)**：
   - **这是最重要的工程纪律**。在编写或修改任何代码（尤其是数据结构、接口定义或环境依赖）之后，**你必须同步更新 `/docs` 目录下的相关 Markdown 文档**。
   - 确保文档永远是项目的“单一真理源 (Single Source of Truth)”。如果代码的实际运行逻辑与文档描述不符，视为严重缺陷。

---

## 3. 文档地图与阅读指南 (Map of Docs)
为了让你快速了解系统的实现细节，请根据你当前接到的任务，查阅 `/docs` 目录下的相应文档：

| 文档名称 | 包含内容 | 适用场景 (When to read) |
| :--- | :--- | :--- |
| `00_course_execution_plan.md` | 总体实施计划、双阶段开发路线图、软硬件配置、架构图 (Mermaid)。 | [必读] 了解我们为什么要这么做，以及我们目前处于 Phase 1 还是 Phase 2。 |
| `01_architecture_data_flow.md` | Ingest, Retrieval, Generation 模块的具体接口定义、参数设计和 Prompt 反幻觉模板。 | [必读] 当你需要编写具体的 Python 代码（如解析 PDF 或组合多路召回）时。 |
| `02_evaluation_metrics.md` | RAGAS 本地评估系统的搭建指南、20 题标准化测试用例、性能分析记录表。 | 当你需要编写评估脚本 (`ragas_eval.py`) 或产出实验数据报告时。 |
| `03_task_tracking.md` | 阶段任务勾选与里程碑。 | 对齐小组进度与「当前该做什么」。 |
| `04_technical_debt_log.md` | 已知技术债与重构计划。 | 排期优化或重构前阅读。 |
| `05_progress_report_guide.md` | 中期报告、消融实验与评估操作规范。 | 复现实验与写进展报告时。 |
| `06_experiment_report_phase1_vs_phase2a.md` | Phase1 vs Phase2A 实验记录。 | 对照实验结论与数据。 |
| `07_frontend_backend_api.md` | Gradio 集成面、事件绑定与下游模块索引。 | 前后端对接、自定义调用 Gradio API 时。 |
| `08_frontend_backend_acceptance_checklist.md` | UI 与 handler 逐项验收清单（含 AI 协助流程）。 | 联调与发布前自检。 |
| `09_documentation_consistency.md` | 文档一致性约定与审计结论。 | 发现文档与代码冲突时优先查阅。 |
| `10_frontend_spec_for_integration.md` | 前端功能清单、控件变量名、Python 逻辑接口名；供外部 UI 设计与 Gradio 接入。 | 让其他 AI/设计师重做界面或对接时优先阅读。 |
| `archive/` | 早期 PRD、旧版技术方案与实施计划草案。 | **[仅供参考]** 路径、文件名或能力与当前仓库可能不一致；**实现以 `01`/`代码`/`config.yaml` 为准**。 |

---

## 4. AI 执行优先级协议 (Conflict-Resolution Protocol)

当多个文档描述不一致时，AI Agent 必须按以下顺序决策，禁止“自由发挥”：

1. **冲突优先级**：`00_course_execution_plan.md` > `01_architecture_data_flow.md` / `02_evaluation_metrics.md` > `README.md` > 代码注释。  
2. **运行真相优先**：若与文档冲突但代码可运行，以当前 `configs/config.yaml` 作为默认运行口径；同时在本次改动中回写文档，消除差异。  
3. **实现边界**：默认只实现 `P0/P2`；任何 `P3` 能力（如 Agent 扩展、RLHF 日志增强）必须由用户显式要求。  
4. **改动策略**：优先扩展现有模块（如 `retriever.py` / `app.py`），避免无必要新增平行文件或重复实现。  
5. **评估口径**：默认使用 20 题标准集和既定指标；新增指标/阈值必须同步写入 `02_evaluation_metrics.md`。  
6. **Docs as Code**：每次代码改动后，同步更新对应文档；若无法同步，需在提交说明中明确“文档待补项”。  

---

## 5. 当前进度声明 (Current Status)
系统正严格遵循 `00_course_execution_plan.md` 中定义的 **两阶段开发模式 (2-Phase Execution)**。

当你接到新的开发任务时，请务必确认该任务属于 Phase 1（基础跑通）还是 Phase 2（火力全开）。不要在 Phase 1 阶段去编写属于 Phase 2 的复杂高级代码。