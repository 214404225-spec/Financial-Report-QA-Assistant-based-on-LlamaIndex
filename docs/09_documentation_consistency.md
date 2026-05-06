# 文档一致性说明与审计结论

本文档说明 **活跃文档** 与 **代码 / 配置** 的优先级，并记录最近一次全库文档扫描的结论与待办。更新代码或架构后，请同步修订本节「审计日期」与表格。

---

## 1. 优先级（发生冲突时以谁为准）

| 优先级（高 → 低） | 说明 |
|-------------------|------|
| `configs/config.yaml` | 实际运行参数（与代码一致时）。 |
| `src/**/*.py` | 可执行真相；文档必须最终与此对齐（Docs as Code）。 |
| `docs/01_architecture_data_flow.md`、`docs/02_evaluation_metrics.md` | 活跃架构与评估口径。 |
| `docs/07_frontend_backend_api.md`、`docs/08_*.md` | Gradio 集成与验收。 |
| `docs/00_course_execution_plan.md` | 课程与产品路线图；**含规划项**，可能与尚未实现的代码并存。 |
| `README.md` | 入口概览；结构列表应反映真实目录。 |
| `docs/archive/**` | 历史草案；**路径、文件名、能力描述可能与当前仓库不一致**，不得作为实现依据。 |

---

## 2. 审计摘要（2026-05-06）

### 2.1 已修正的不一致

| 问题 | 处理 |
|------|------|
| `src/ui/app.py` 引用不存在的 `load_pdf_documents` | 已改为 `load_financial_pdfs`（与 `pdf_parser.py` 一致）。 |
| `docs/07_frontend_backend_api.md` 误写 `load_pdf_documents` | 已改为 `load_financial_pdfs`。 |
| `docs/01_architecture_data_flow.md` 示例使用 `is_raptor_summary`，而 UI 使用 `is_summary` | 示例已改为 `is_summary` 并注明 RAPTOR 键名以管线为准。 |
| `docs/00_README_AI_CONTEXT.md` 标题写「4 条铁律」实际列了 5 条 | 已改为「5 条铁律」。 |
| `docs/00_README_AI_CONTEXT.md` 文档地图缺 03–08、且 `archive/` 表述过绝对 | 已补全活跃文档表，并弱化 archive 为「仅供参考」。 |

### 2.2 已知差异（未改代码或保留规划表述）

| 位置 | 现象 | 建议 |
|------|------|------|
| `docs/00_course_execution_plan.md` §2.1 | 描述 **ReActAgent**、`yfinance` 等能力 | 属课程/产品规划；当前主路径以 `pipeline.py` 中 **CondensePlusContextChatEngine** 为准。若未实现 Agent，可在该节标注「规划中」或拆成独立 Phase。 |
| `docs/archive/specs/technical_specification.md` | 数据接入写 **LlamaParse** | 实现为 **`PyMuPDFReader`**（`src/ingest/pdf_parser.py`）。勿以该 archive 文档实现解析层。 |
| `docs/archive/technical_design.md` | 目录含 `ui/app.py`、`ablation.py`、Notebook 等 | 当前入口为 **`src/ui/app.py`**；仓库内**无** `ablation.py` 与所列 Notebook；以实际 `src/` 为准。 |
| `docs/archive/plan/implementation_plan.md` | `tests/`、`pyproject.toml`、Gradio **双栏**、chunk 512 tokens | 仓库以 **`requirements.txt`** 为主；当前 UI 为 **三栏** Gradio；分块参数以 **`config.yaml`** 为准。 |
| `src/ui/app.py` 按钮文案 | 「启动深度索引 (**LlamaParse**)」 | 与实现不完全一致（解析为 **PyMuPDF**）；可按需改为中性文案。 |

### 2.3 `README.md` 与仓库

- **目录结构**：已补充 `src/ui/`，与 Gradio 入口一致。  
- **文档地图**：已加入 `03`–`08` 及本文件 `09` 的链接，避免新文档在入口不可见。

---

## 3. 维护 checklist（每次发版或大改后）

- [ ] `README.md` 中目录树是否包含 `src/ui/` 与主要 `docs/` 索引？  
- [ ] `docs/00_README_AI_CONTEXT.md` 文档地图是否包含新编号文档？  
- [ ] `docs/07_frontend_backend_api.md` §5 行号是否与 `src/ui/app.py` 大致一致？  
- [ ] `docs/08_frontend_backend_acceptance_checklist.md` 中引用的事件/行号是否需更新？  
- [ ] 若仅存在于 `archive/` 的表述被误用，是否已在活跃文档中写明正确口径？

---

## 4. 审计日期

- **2026-05-06**：首次全库扫描；修正导入与元数据示例；更新 README / `00_README_AI_CONTEXT` / `07` / `01`；新增本文件。
