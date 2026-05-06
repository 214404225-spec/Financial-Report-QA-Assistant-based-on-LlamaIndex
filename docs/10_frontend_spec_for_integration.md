# 前端功能与接口说明（供外部 UI 设计与接入）

本文档面向**产品 / UI 设计师**与**要实现独立前端的开发者**（或协助你的其他 AI），概括当前 **Insight** 工作台**已有能力**、**界面元素命名**、以及**与后端对接时**应使用的逻辑接口名。更细的 HTTP 与代码行说明见 **[07_frontend_backend_api.md](07_frontend_backend_api.md)**；数据契约见 **[01_architecture_data_flow.md](01_architecture_data_flow.md)**。

---

## 1. 技术现实（对接前必读）

| 项目 | 说明 |
|------|------|
| 实现方式 | 单一 **Gradio** 应用（`src/ui/app.py`），**无**独立 OpenAPI/FastAPI 路由。 |
| 「前端」 | 浏览器中的 Gradio 渲染页 + 同一进程内的 Python 处理函数。 |
| 自定义 Web 应用 | 可选：① **iframe** 嵌入整页 Gradio；② **`gradio_client`** 调 Gradio 暴露的端点；③ 未来在旁路增加 REST 网关（需自行开发）。 |
| 运行入口 | 项目根目录：`python src/ui/app.py`；默认 `http://127.0.0.1:7860/`（可用环境变量 `GRADIO_SERVER_NAME`、`GRADIO_SERVER_PORT` 修改）。 |

---

## 2. 布局结构（当前三栏）

| 区域 | 大致比例 | 职责 |
|------|----------|------|
| **左栏** | `scale=2` | 上传 PDF、建索引、文档列表、摘要与推荐问题、用户偏好、状态。 |
| **中栏** | `scale=4` | 引擎模式、多轮对话、主操作按钮、引用展示、跳转页码、跨文档对比、灵感库、赞踩反馈。 |
| **右栏** | `scale=4` | 原文 PDF（iframe，依赖 Gradio `/file=...`）。 |

页面主标题文案：**「📈 Insight · 机构级研报分析工作台」**（`gr.Markdown`）。

---

## 3. 功能清单（按用户任务）

设计替代 UI 时，建议至少支持下列**用户故事**（与现网能力对齐）：

| ID | 用户任务 | 左/中/右 | 说明 |
|----|----------|-----------|------|
| F1 | 选择本地 PDF 并写入工作区 | 左 | 多文件上传；写入配置中的 `data_dir`。 |
| F2 | 建立向量索引并刷新概览 | 左 | 触发解析、分块、入库、摘要与推荐问题生成。 |
| F3 | 查看/多选「当前工作区」文档 | 左 | 多选下拉，供对比表等使用。 |
| F4 | 阅读全局摘要与推荐探索维度 | 左 | 索引成功后由后端填充文本框。 |
| F5 | 设定分析偏好并注入引擎 | 左 | 文本偏好；**Agent 模式**下会参与 `get_financial_agent`；常规 RAG 路径以代码为准。 |
| F6 | 选择「常规 RAG」或「Autonomous Agent」 | 中 | 单选；取值必须为下文字符串之一，否则与后端状态不一致。 |
| F7 | 多轮对话提问并获得流式回答 | 中 | 依赖 Ollama + 检索管线。 |
| F8 | 查看结构化引用摘录 | 中 | HTML 区域，有引用时显示。 |
| F9 | 从下拉选择「文档+页码」并在 PDF 中跳转 | 中 → 右 | 选项格式：`{文件名} (页码: {页})`。 |
| F10 | 将最后一轮助手回答记入灵感库 | 中 | 追加到记事本文本框。 |
| F11 | 按维度生成跨文档 Markdown 对比表 | 中 | 依赖已选文档与已建索引。 |
| F12 | 对上一轮问答点赞/点踩并写本地日志 | 中 | 写入 `data_dir/human_feedback_log.jsonl`。 |
| F13 | 清空对话与反馈提示 | 中 | 不清索引、不删 PDF。 |
| F14 | 在右侧阅读器预览 PDF | 右 | URL 形态见 §6。 |

---

## 4. 界面控件与代码中的变量名（便于对照实现）

下列名称来自 `src/ui/app.py`，自定义前端若用 **Gradio Client** 对位组件，需以运行实例的 **`view_api()`** 为准；下表用于**与工程师/其他 AI 沟通「绑的是哪一块」**。

### 4.1 左栏

| 界面 label / 按钮文案（当前） | 代码变量名 | 类型（Gradio） |
|------------------------------|------------|----------------|
| 导入研报 (支持 PDF 深度解析) | `file_upload` | `File`（多文件） |
| 🚀 启动深度索引 (LlamaParse) | `upload_btn` | `Button` |
| 已激活的工作区 | `doc_list` | `Dropdown`（`multiselect=True`） |
| 全局摘要 (RAPTOR 树聚合) | `summary_box` | `Textbox` |
| 推荐探索维度 | `qs_box` | `Textbox` |
| 设定您的偏好 | `memory_input` | `Textbox` |
| 注入记忆偏好 | `memory_btn` | `Button` |
| （偏好结果提示） | `memory_status` | `Markdown` |
| （索引进度/状态） | `status_text` | `Markdown` |

### 4.2 中栏

| 界面 label / 按钮文案（当前） | 代码变量名 | 类型（Gradio） |
|------------------------------|------------|----------------|
| 引擎模式 | `engine_mode` | `Radio` |
| （对话区） | `chatbot` | `Chatbot` |
| 提出您的分析诉求... | `msg_input` | `Textbox` |
| 生成洞察 | `submit_btn` | `Button` |
| 📌 摘录至灵感库 | `pin_btn` | `Button` |
| 清除会话 | `clear_btn` | `Button` |
| 👍 赞 (Like) | `like_btn` | `Button` |
| 👎 踩 (Dislike) | `dislike_btn` | `Button` |
| （反馈状态） | `feedback_status` | `Markdown` |
| 引用溯源 | `cite_html` | `HTML`（初始 `visible=False`） |
| 🎯 沉浸验证 (点击自动跳转右侧阅读器) | `jump_dropdown` | `Dropdown` |
| 跨文档分析维度 | `dim_input` | `Textbox` |
| 生成多维对比矩阵 | `table_btn` | `Button` |
| （对比表状态） | `table_status` | `Markdown` |
| 📌 分析师灵感库 (Notepad) | `notepad_area` | `Textbox` |

### 4.3 右栏

| 区块标题 / 说明 | 代码变量名 | 类型（Gradio） |
|----------------|------------|----------------|
| ### 📖 原文追溯视图 | `pdf_viewer` | `HTML`（内嵌 iframe） |

---

## 5. 后端逻辑接口名（Python 函数，非 REST 路径）

这些名称是**服务端真实调用的函数**；Gradio 会为每个绑定事件生成**可远程调用的 API 名称**，名称与参数顺序**以运行后 `gradio_client.Client(...).view_api()` 输出为准**，勿硬编码 HTTP path。

| 逻辑操作 | Python 函数名 | 主要输入（概念） | 主要输出（概念） |
|----------|---------------|------------------|------------------|
| 上传并建索引 | `process_upload` | 文件列表、`memory_input`、`engine_mode` | `status_text`、`doc_list`、`summary_box`、`qs_box`、`pdf_viewer` |
| 流式一轮对话 | `bot_msg` | `chatbot`、`memory_input`、`engine_mode` | 更新 `chatbot`、`cite_html`、`jump_dropdown` |
| 按引用跳转 PDF | `handle_jump_selection` | `jump_dropdown` | `pdf_viewer` |
| 应用偏好 | `update_memory_prompt` | `memory_input`、`engine_mode` | `memory_status` |
| 摘录回答 | `pin_to_notepad` | `chatbot`、`notepad_area` | `notepad_area` |
| 生成对比表 | `generate_table` | `doc_list`、`dim_input`、`notepad_area` | `notepad_area`、`table_status` |
| 赞 / 踩 | `log_feedback`（经 `lambda` 包装） | `chatbot` | `feedback_status` |
| 清空会话 | 匿名 `lambda` | — | `chatbot`、`feedback_status` |

辅助函数（通常不单独暴露为 Gradio 顶层 API，但被上述流程调用）：`initialize_system`、`chat_response`、`update_pdf_viewer`、`format_citations_to_html`。

---

## 6. 引擎模式取值（必须一致）

`engine_mode` / `Radio` 的选项字符串必须与代码完全一致：

1. **`常规 RAG 问答`** — 使用 `get_chat_engine(retriever)`。  
2. **`Autonomous Agent (含实时数据)`** — 使用 `get_financial_agent(retriever, user_memory=...)`。

自定义前端若用下拉映射，请在提交给后端前还原为上述**原文**。

---

## 7. PDF 与溯源约定

- **预览 URL**：由 `update_pdf_viewer` 生成 iframe：`/file=<PDF 绝对路径>[#page=<页码>]`。  
- **允许路径**：仅 `launch(allowed_paths=[data_dir_abs])` 包含的目录（来自 `configs/config.yaml` 的 `storage.data_dir`）。  
- **引用下拉选项格式**：`{source 文件名} (页码: {page_label})`，与 `format_citations_to_html` 一致。  
- **节点元数据**：检索片段应含 `source`、`page_label`（见 `01_architecture_data_flow.md`）。

---

## 8. 给其他 AI 的对接提示（可复制）

```text
目标：在保留现有 Python RAG 管线的前提下，重新设计 Web UI 或独立前端。

约束：
- 后端现为 Gradio Blocks（src/ui/app.py），无单独 REST。
- 功能集合以 docs/10_frontend_spec_for_integration.md §3 为准。
- 引擎模式字符串必须与 §6 完全一致。
- PDF 预览依赖同源 /file= 与 allowed_paths。

集成选项：
A) iframe 嵌入 http://<host>:7860/
B) 启动服务后用 gradio_client.Client(base_url).view_api() 获取端点名与参数，再 submit/predict
C) 新增 FastAPI 代理层，把 §5 中函数逐一映射为 REST（需开发）

设计交付物建议：组件树 + 与 §4 变量名/§5 函数名的映射表 + 关键用户流（F1–F14）。
```

---

## 9. 相关文档

| 文档 | 用途 |
|------|------|
| [07_frontend_backend_api.md](07_frontend_backend_api.md) | HTTP、启动参数、事件绑定细节、下游模块路径。 |
| [08_frontend_backend_acceptance_checklist.md](08_frontend_backend_acceptance_checklist.md) | 联调验收步骤。 |
| [01_architecture_data_flow.md](01_architecture_data_flow.md) | `source` / `page_label` 等数据契约。 |

---

*维护：若增删 Gradio 组件或重命名按钮，请同步更新本文 §3–§5，并修订 `07` 中的接口目录。*
