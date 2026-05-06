# 前后端对接说明（API 与集成面）

本文档描述 **Insight** 项目在「展示层 ↔ 推理与检索后端」之间的集成方式。请先阅读数据契约：[01_architecture_data_flow.md](01_architecture_data_flow.md)。**逐项验收 UI 与 handler 是否连通**时，可使用可勾选清单：[08_frontend_backend_acceptance_checklist.md](08_frontend_backend_acceptance_checklist.md)。

---

## 1. 当前架构事实

| 项目 | 说明 |
|------|------|
| 独立 REST 服务 | **无**。仓库内未使用 FastAPI / Flask 等单独 HTTP API 层。 |
| 实际对外服务 | **Gradio**（`gradio>=4.0.0`）在单进程内同时提供 **Web UI** 与 **可编程调用接口**。 |
| 实现入口 | `src/ui/app.py`：布局、事件绑定、队列与 `launch()` 均在同一文件。 |

因此「前后端连接」在本项目中主要指：

1. **浏览器** 访问 Gradio 页面（默认一体化 UI）；或  
2. **自定义前端 / 脚本** 通过 Gradio 暴露的 HTTP API 或 `gradio_client` 调用同一后端；或  
3. **iframe** 嵌入已部署的 Gradio 应用。

若未来需要标准 REST（OpenAPI、细粒度路由、鉴权网关），应在 Python 侧新增薄封装层（例如 FastAPI），将下列业务操作映射为显式路由——当前代码尚未实现。

---

## 2. 启动服务与基地址

### 2.1 启动命令

```bash
# 项目根目录，已激活虚拟环境并安装依赖
python src/ui/app.py
```

### 2.2 监听地址与端口

| 来源 | 变量名 | 默认值 | 含义 |
|------|--------|--------|------|
| 环境变量 | `GRADIO_SERVER_NAME` | `127.0.0.1` | 绑定网卡；需局域网访问时可设为 `0.0.0.0` |
| 环境变量 | `GRADIO_SERVER_PORT` | `7860` | HTTP 端口 |

代码依据（节选）：

```285:292:src/ui/app.py
if __name__ == "__main__":
    config = load_config()
    data_dir_abs = os.path.abspath(config['storage']['data_dir'])
    # 127.0.0.1: Gradio's post-launch localhost probe fails with 0.0.0.0 on many setups.
    # Use env GRADIO_SERVER_NAME=0.0.0.0 when you need LAN binding.
    _host = os.environ.get("GRADIO_SERVER_NAME", "127.0.0.1")
    _port = int(os.environ.get("GRADIO_SERVER_PORT", "7860"))
    demo.queue().launch(server_name=_host, server_port=_port, allowed_paths=[data_dir_abs])
```

### 2.3 基 URL 示例

- 本机默认：`http://127.0.0.1:7860/`  
- 局域网（需设置 `GRADIO_SERVER_NAME=0.0.0.0`）：`http://<主机局域网IP>:7860/`

---

## 3. 静态文件与 PDF 预览 URL

右侧 PDF 预览通过 **Gradio 受控文件路径** 提供：仅 `launch(..., allowed_paths=[data_dir_abs])` 中的目录可被 `/file=...` 访问。

### 3.1 数据目录

来自 `configs/config.yaml` 的 `storage.data_dir`（默认 `./data`，运行时解析为**绝对路径**）。上传的 PDF 会写入该目录。

### 3.2 iframe 使用的 URL 形态

后端生成的 HTML 模板（逻辑在 `update_pdf_viewer`）：

- **路径**：`/file=<PDF 绝对路径>`  
- **页码锚点**（若浏览器/PDF 插件支持）：`#page=<页码>`

示例（概念上）：

```text
/file=/absolute/path/to/project/data/report.pdf#page=3
```

自定义前端若需复现「右侧阅读器」，须：

1. 保证文件落在配置的 `data_dir` 下且已被 Gradio `allowed_paths` 允许；  
2. 使用与后端一致的 `source`（文件名）与 `page_label`（页码）拼装或请求同源下的 `/file=...`。

溯源元数据契约见 [01_architecture_data_flow.md §1](01_architecture_data_flow.md)。

---

## 4. 通过 Gradio 与自定义前端对接（推荐）

Gradio 应用在运行时会暴露 **可查询的 API**（具体路径与端点名可能随 Gradio 小版本变化）。推荐做法：

### 4.1 在运行中的应用上查看 API

浏览器打开 Gradio 页面后，使用界面提供的 **「通过 API 使用」/ API 文档入口**（Gradio 自带），可查看：

- 各可调用端点的名称；  
- 请求/响应的 JSON 结构（`data` 数组字段顺序与类型）。

### 4.2 使用官方 Python 客户端（`gradio_client`）

与 `gradio` 一并安装后，可在另一进程探测并调用：

```python
from gradio_client import Client

client = Client("http://127.0.0.1:7860/")
# 查看当前应用暴露的 API 签名（以运行实例为准）
client.view_api()
```

随后按文档生成的接口名使用 `submit` / `predict` 等（以你本机 Gradio 版本文档为准）。**端点名与参数顺序以 `view_api()` 输出为准**，不要硬编码本文档中未列出的路径——`Blocks` 中多个 `click`/`change` 会注册多个后端点。

### 4.3 使用 HTTP（curl 等）

Gradio 官方说明典型模式为：先 **POST** 提交任务取得事件 ID，再 **GET** 轮询结果。具体 URL 前缀（如 `/gradio_api/` 或 `/call/`）请以运行中应用的 API 页或官方文档为准：

- [Querying Gradio Apps With Curl](https://www.gradio.app/guides/querying-gradio-apps-with-curl)  
- [View API Page](https://www.gradio.app/guides/view-api-page)

### 4.4 跨域（CORS）

若自定义前端与 Gradio **不同源**（不同域名/端口），可能遇到浏览器 CORS 限制。常见处理方式：

- 开发：前端开发服务器 **代理** 到 `127.0.0.1:7860`；  
- 生产：同源反向代理（Nginx/Caddy）把 UI 与 API 挂在同一域名下。

当前 `app.py` 未单独配置 CORS 中间件；以 Gradio 默认行为为准。

---

## 5. 接口目录（代码位置与作用）

本节列出与本项目「前后端对接」相关的**所有对外或可被 Gradio 转发的接口面**：HTTP 入口、UI 事件绑定、Python 处理函数、以及 UI 调用的下游模块。路径均以仓库根目录为基准。

### 5.1 对外 HTTP 层（Gradio 进程）

| 接口 / 资源 | 代码位置 | 作用 |
|-------------|----------|------|
| **Web UI 根路径** `GET /`（及 Gradio 静态资源） | `src/ui/app.py`：`demo.queue().launch(...)`（文件末尾 `if __name__` 块） | 浏览器访问主工作台页面；静态资源由 Gradio 框架提供。 |
| **PDF 等受控文件** `/file=<绝对路径>` | 由 Gradio `launch(..., allowed_paths=[data_dir_abs])` 启用；iframe 的 `src` 在 `update_pdf_viewer` 中拼接 | 在「原文追溯视图」中内嵌预览 `data_dir` 下的 PDF；仅允许访问 `allowed_paths` 中的目录。 |
| **可编程 API**（端点名、路径前缀随 Gradio 版本变化） | 运行中应用在 **API 文档页** 展示；服务端注册逻辑分散在 `gr.Blocks` 与各 `.click()` / `.submit()` / `.change()`（绑定事件逻辑段） | 供 `gradio_client`、curl 等发起预测/队列任务，与浏览器点击按钮等价。 |

> **说明**：除 `/file=...` 与 Gradio 文档列出的路由外，本项目**未**自定义其它 HTTP 路径（无 `/api/v1/...` 式 REST）。

### 5.2 UI 事件绑定（Gradio → Python）— `src/ui/app.py`

下列为**用户操作**与**处理函数**的对应关系；行号以仓库中「绑定事件逻辑」段落为准（若代码变更请以函数名搜索）。

| UI 触发 | 调用的接口（函数） | 作用 |
|---------|-------------------|------|
| 点击「注入记忆偏好」 | `update_memory_prompt` | 在已有索引时按当前引擎模式重建对话引擎，并提示偏好已生效。 |
| 点击「启动深度索引」 | `process_upload` | 将上传 PDF 写入 `data_dir`，重建/加载索引与对话引擎，刷新摘要、推荐问题、文档列表与右侧预览。 |
| 点击「生成洞察」 | 链式：`lambda` → `bot_msg` → `handle_jump_selection` | 把输入框内容推入对话；流式生成回答与引用；最后按「沉浸验证」下拉刷新 PDF。 |
| 输入框回车提交 | 同上 | 与「生成洞察」相同链路。 |
| 「沉浸验证」下拉变更 | `handle_jump_selection` | 解析 `文档名 (页码: N)`，更新右侧 PDF iframe。 |
| 点击「摘录至灵感库」 | `pin_to_notepad` | 将最后一轮助手回复追加到灵感库文本框。 |
| 点击「生成多维对比矩阵」 | `generate_table` | 按所选文档与维度调用对比表生成，并追加到灵感库。 |
| 点击「赞 / 踩」 | `log_feedback` | 将上一轮问答追加写入 `data_dir/human_feedback_log.jsonl`。 |
| 点击「清除会话」 | `lambda` | 清空 `Chatbot` 与反馈状态文案。 |

**布局**：三栏——左「数据底座 / 宏观脉络 / 记忆」、中「对话与溯源 / 知识聚合」、右「原文追溯视图」。

### 5.3 服务端处理函数（逻辑接口）— `src/ui/app.py`

以下为**业务与展示逻辑**的定义位置与职责（供自定义前端或二次开发对齐语义）。它们多数会被 Gradio 自动注册为可远程调用的 API（具体名称以 `gradio_client.Client.view_api()` 为准）。

| 函数名 | 作用 |
|--------|------|
| `_patch_gradio_client_schema` | 兼容 Pydantic v2 与 `gradio_client` 的 JSON Schema 解析；模块导入时执行。 |
| `AppState` / `state` | 进程内单例状态：索引、节点、`doc_map`、`chat_engine`、`data_dir`、`current_mode` 等。 |
| `initialize_system` | 从 `data_dir` 加载 PDF、分块、构建或加载向量索引，按模式装配 Agent 或 `ChatEngine`，并生成全局摘要与推荐问题。 |
| `chat_response` | 对单条用户消息调用 `stream_chat`，流式产出文本与溯源节点（供引用展示）。 |
| `update_pdf_viewer` | 根据文档名与页码生成带 `/file=...#page=` 的 iframe HTML，供右侧阅读器使用。 |
| `format_citations_to_html` | 将检索节点格式化为溯源 HTML 与「沉浸验证」下拉选项列表。 |
| `bot_msg` | 编排一轮对话：流式更新 `Chatbot`、结束时展示引用并更新跳转下拉默认值。 |
| `process_upload` | 持久化上传文件并调用 `initialize_system`，刷新 UI 多路输出。 |
| `handle_jump_selection` | 下拉选项解析后调用 `update_pdf_viewer`。 |
| `update_memory_prompt` | 按引擎模式重建 `ChatEngine` / Agent（Agent 路径会传入 `memory_text`）。 |
| `log_feedback` | 将问答与赞踩写入 `human_feedback_log.jsonl`。 |
| `pin_to_notepad` | 摘录最后一条助手消息到灵感库。 |
| `generate_table` | 调用 `generate_comparison_table` 生成 Markdown 对比表并写入灵感库。 |
| `gr.Blocks` 布局与组件声明 | 定义三栏 UI 及全部可见控件（无独立「接口」，属界面结构）。 |
| `demo.queue().launch(...)` | 启动队列、绑定主机端口、声明 `allowed_paths`、主题与 CSS。 |

### 5.4 链式调用中的内联函数（非具名接口）

| 位置（约） | 形式 | 作用 |
|------------|------|------|
| （绑定段） | `lambda x, h: ("", h + [[x, None]])` | 将输入框文本并入会话历史占位，清空输入框，为 `bot_msg` 流式填充助手槽位。 |
| （绑定段） | `lambda: (None, "")` | 清空 `Chatbot` 与反馈状态。 |

### 5.5 下游能力模块（由 UI 间接调用，非 HTTP）

`src/ui/app.py` 顶部导入并在上述函数中使用；**无单独 Web 路由**，属于后端实现位置索引。

| 模块路径 | 被调用的入口（示例） | 作用 |
|----------|----------------------|------|
| `src/utils/config.py` | `load_config` | 读取 `configs/config.yaml`（含 `storage.data_dir` 等）。 |
| `src/ingest/pdf_parser.py` | `load_financial_pdfs` | 从数据目录加载 PDF 为 `Document` 列表（`PyMuPDFReader`）。 |
| `src/ingest/chunker.py` | `get_nodes` | 按配置策略分块并产出节点列表。 |
| `src/ingest/indexer.py` | `get_index` | 按配置构建或加载 Chroma 向量索引（含 RAPTOR 分支）。 |
| `src/retrieval/retriever.py` | `get_hybrid_retriever` | 混合检索器实例化。 |
| `src/retrieval/reranker.py` | `get_reranker` | 精排模型封装。 |
| `src/generation/pipeline.py` | `get_chat_engine` | 构建多轮对话引擎（Condense + 检索上下文）。 |
| `src/generation/overview.py` | `generate_document_overview` | 全局摘要与推荐问题（左栏展示）。 |
| `src/generation/workspace.py` | `generate_comparison_table` | 跨文档对比表 Markdown（灵感库）。 |
| `src/generation/agent.py` | `get_financial_agent` | Agent 模式下装配带工具的对话对象（与 `pipeline.get_chat_engine` 二选一）。 |

---

## 6. 嵌入整页 Gradio（iframe）

若自定义站点仅需「内嵌现有工作台」而暂不调用细粒度 API：

```html
<iframe
  src="http://127.0.0.1:7860/"
  style="width:100%; height:100vh; border:0;"
  title="Insight Gradio"
></iframe>
```

注意：目标地址须与页面 **HTTPS/HTTP 策略一致**，且若 Gradio 仅监听 `127.0.0.1`，则 iframe 仅在同机浏览器中可用；对外需绑定 `0.0.0.0` 并配置防火墙与鉴权。

---

## 7. 与 Ollama / 配置的依赖关系

- LLM 通过 `configs/config.yaml` 中 `llm.ollama_base_url`（默认 `http://localhost:11434`）访问 **Ollama**。  
- Gradio 进程 **不** 实现模型推理；前端调 Gradio → Gradio 调本地 LlamaIndex + Ollama。  
- 部署检查清单：Ollama 已启动、所需模型已拉取、`data_dir` 与 `chroma_persist_dir` 路径可写。

---

## 8. 文档修订说明

- **维护者**：当 `src/ui/app.py` 增加/删除 Gradio 组件或事件时，应同步更新本文 **§5**（尤其 **§5.2–§5.3** 的行号与函数表），并提醒集成方重新查看 `gradio_client.Client.view_api()`。  
- **版本**：文档与仓库当前结构一致；Gradio HTTP 细节以官方文档与运行实例为准。行号以当时 `src/ui/app.py` 为准，若发生漂移请以函数名为准在文件中搜索。

---

## 9. LangGraph 流式数据规范 (Phase 2+ Agent 可视化与猜你想问)

为配合前端组件开发（Agent 思考链路状态栏与“猜你想问”推荐），系统架构已从 LlamaIndex 黑盒引擎迁移至 LangGraph 显式状态机。前后端应当使用 `.stream()` 流式交互契约以捕获运行过程。

### 9.1 节点流转枚举 (Node Mapping)
前端 UI 根据流式迭代器抛出的 `node_name` 来匹配进度状态：
*   `router` -> "意图判定完毕"
*   `tool_extract` -> "已确定所需工具及参数"
*   `hitl` -> "参数缺失，等待用户澄清..."
*   `tool_execute` -> "研报检索或外部API调用完毕"
*   `generation` -> "最终结果生成完毕"

### 9.2 终态数据结构 (Payload Extraction)
当迭代器捕获到 `node_name == "generation"` 且流转结束时，前端应从当前的 `node_state` 字典中提取以下三大核心字段进行 UI 渲染：

```python
# 前端逻辑伪代码示例：
for event in state.chat_engine.stream(initial_state):
    for node_name, node_state in event.items():
        # 1. 渲染 Agent 思考状态条 (Live)
        update_thinking_bar(node_name)
        
        # 2. 提取最终数据
        if node_name == "generation":
            final_ans = node_state.get("final_response", "") # 字符串: 渲染到主聊天框
            citations = node_state.get("citations", [])      # 列表: 渲染到溯源跳转卡片
            follow_ups = node_state.get("follow_ups", [])    # 字符串列表: 渲染到输入框下方推荐按钮
```
