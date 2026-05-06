# Insight 前端 ↔ Gradio/LangGraph 后端 对接指南

> 目标：把当前这套高保真原型（HTML + JSX + CSS + mock 数据）接入到您现有的 Gradio + LangGraph 后端，实现**真实数据流转**。
>
> 本指南覆盖：导出 → 目录结构 → 改造点 → 后端代理 → 流式契约 → 联调 → 部署。

---

## 0. 快速概览

| 你将要做的 | 工具 / 文件 | 预计耗时 |
|---|---|---|
| 1. 下载 zip 项目 | 聊天右上角「下载 / Download」 | 1 分钟 |
| 2. 启动 Gradio 后端 | `python src/ui/app.py` | 5 分钟 |
| 3. 起一个 FastAPI 代理层 | `api/proxy.py`（本文档提供模板） | 30–60 分钟 |
| 4. 替换前端 mock 为 fetch | `data/mock.js` → `data/api.js` | 30 分钟 |
| 5. 改前端调用入口 | `variants/variant-c.jsx` | 60 分钟 |
| 6. 联调 LangGraph 流式 | SSE / WebSocket | 60–120 分钟 |

---

## 1. 导出与目录结构

### 1.1 导出
点击聊天框右上角的「⋯ → 下载项目（zip）」，解压后得到：

```
insight-frontend/
├── Insight 研报工作台 · 大胆版.html      # ★ 主入口（推荐）
├── Insight 研报工作台 · 三方案.html      # 三方案对比 canvas
├── variants/
│   ├── variant-a.jsx                    # 保守版
│   ├── variant-b.jsx                    # 平衡版
│   ├── variant-c.jsx                    # 大胆版（含 LangGraph 思考条）★
│   └── variant-c-charts.jsx             # 数据可视化模块
├── styles/
│   ├── tokens.css                       # 共享 CSS 变量（Claude 暖橙 + 米白）
│   ├── variant-a.css
│   ├── variant-b.css
│   └── variant-c.css                    # ★ 主样式
├── data/
│   └── mock.js                          # ★ 你要替换的 mock 数据入口
├── tweaks-panel.jsx                     # 明暗主题面板
└── INTEGRATION_GUIDE.md                 # 本文档
```

### 1.2 本地预览
随便一个静态服务器即可：
```bash
cd insight-frontend
python -m http.server 8000
# 浏览器打开 http://localhost:8000/Insight 研报工作台 · 大胆版.html
```

> ⚠️ **必须用 HTTP server，不要双击 file://** —— Babel 在线编译跨域会失败。

---

## 2. 后端（已有）现状回顾

按贵司 §1、§5 文档：

| 项 | 现状 |
|---|---|
| 实现 | 单一 Gradio Blocks（`src/ui/app.py`） |
| 端口 | 默认 `http://127.0.0.1:7860/` |
| API 形态 | **没有** OpenAPI / FastAPI；只有 Gradio 暴露的 RPC 端点 |
| 引擎模式字符串 | `常规 RAG 问答` / `Autonomous Agent (含实时数据)` —— **必须原文** |
| PDF 路径 | `/file=<绝对路径>#page=N`，仅 `allowed_paths` 列出的目录 |
| 运行时升级 | 已迁移至 LangGraph 显式状态机（§9） |

---

## 3. 推荐架构：FastAPI 代理层

```
┌─────────────────────────┐  REST / SSE  ┌──────────────────────┐  gradio_client  ┌────────────────────┐
│  Insight 前端 (本仓库)    │ ───────────▶ │  FastAPI 代理 (新写)   │ ──────────────▶ │  Gradio + LangGraph │
│  (variants/variant-c)    │ ◀─────────── │  api/proxy.py         │ ◀────────────── │  src/ui/app.py      │
└─────────────────────────┘              └──────────────────────┘                  └────────────────────┘
        :3000 (静态)                            :8000 (代理)                              :7860 (Gradio)
```

**为什么要代理层？**
- ✅ 前端调用稳定的 REST，不依赖 Gradio 端点的随机命名
- ✅ 可以把 `chat_engine.stream()` 转成标准 SSE
- ✅ CORS、鉴权、限流统一在代理层处理
- ✅ 后端要换实现（比如换成 LangServe）时前端零改动

---

## 4. 后端：FastAPI 代理层模板

### 4.1 安装依赖
```bash
pip install fastapi uvicorn gradio_client httpx sse-starlette pydantic
```

### 4.2 `api/proxy.py` 完整模板

```python
# api/proxy.py
"""
Insight 前端 ↔ Gradio 后端 适配层
约定：
  - 前端永远只调 /api/* REST 端点
  - 内部用 gradio_client 调 Gradio 端点；端点名用 view_api() 实测，不硬编码
  - LangGraph 流式以 SSE 推送
"""
import asyncio
import json
import os
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse
from gradio_client import Client
from pydantic import BaseModel

GRADIO_URL = os.getenv("GRADIO_URL", "http://127.0.0.1:7860/")
DATA_DIR   = Path(os.getenv("INSIGHT_DATA_DIR", "./data"))

app = FastAPI(title="Insight Proxy", version="0.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 启动时跑一次 view_api()，把端点名缓存成字典
GRADIO: Optional[Client] = None
ENDPOINTS: dict = {}

@app.on_event("startup")
async def boot():
    global GRADIO
    GRADIO = Client(GRADIO_URL)
    api_info = GRADIO.view_api(return_format="dict")
    print("[proxy] discovered endpoints:")
    for name, sig in api_info.get("named_endpoints", {}).items():
        print(f"  {name}  params={[p['label'] for p in sig['parameters']]}")
        ENDPOINTS[name] = sig
    # ★ 把 view_api() 输出的真实端点名填到下面常量里
    # 例如：ENDPOINT_UPLOAD = "/process_upload" 等

# ---------- 1) 上传 + 索引 ----------
@app.post("/api/upload")
async def upload(
    files: List[UploadFile] = File(...),
    memory_input: str = Form(""),
    engine_mode: str = Form("常规 RAG 问答"),
):
    saved_paths = []
    for f in files:
        dst = DATA_DIR / f.filename
        dst.write_bytes(await f.read())
        saved_paths.append(str(dst))

    # 调 Gradio process_upload
    # 端点名以 view_api() 实测为准；以下示例：
    result = GRADIO.predict(
        saved_paths,           # file_upload
        memory_input,          # memory_input
        engine_mode,           # engine_mode
        api_name="/process_upload",
    )
    # 返回结构对应前端：sources / summary / recommended
    status_text, doc_list, summary, qs, _pdf = result
    return {
        "status": status_text,
        "sources": [{"id": i, "title": d, "checked": True}
                    for i, d in enumerate(doc_list)],
        "summary": summary,
        "recommended": [q for q in (qs or "").split("\n") if q.strip()],
    }

# ---------- 2) LangGraph 流式对话 ----------
class ChatRequest(BaseModel):
    history: List[dict]    # [{role:'user'|'assistant', content:'...'}]
    memory_input: str = ""
    engine_mode: str = "常规 RAG 问答"

@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    """
    SSE 推送 LangGraph 节点状态。事件类型：
      event: node       data: {"node":"router","label":"意图判定完毕","detail":"..."}
      event: token      data: {"delta":"..."}
      event: final      data: {"final_response":"...","citations":[...],"follow_ups":[...]}
      event: done       data: {}
    """
    async def generator():
        # 真实实现里，这里直接调你 LangGraph state 的 .stream()
        # for event in state.chat_engine.stream(initial_state):
        #     for node_name, node_state in event.items():
        #         yield {"event":"node","data":json.dumps({...})}
        #         if node_name == "generation":
        #             yield {"event":"final","data":json.dumps({
        #                 "final_response": node_state.get("final_response",""),
        #                 "citations":      node_state.get("citations",[]),
        #                 "follow_ups":     node_state.get("follow_ups",[]),
        #             })}
        # 下面是骨架示意：
        nodes = [
            ("router", "意图判定完毕"),
            ("tool_extract", "已确定所需工具及参数"),
            ("tool_execute", "研报检索或外部API调用完毕"),
            ("generation", "最终结果生成完毕"),
        ]
        for n, label in nodes:
            yield {"event": "node", "data": json.dumps({"node": n, "label": label})}
            await asyncio.sleep(0.6)
        # 终态
        yield {"event": "final", "data": json.dumps({
            "final_response": "（这里是流式拼好的最终回答…）",
            "citations": [{"id": 1, "source": "...", "page": 14, "snippet": "..."}],
            "follow_ups": ["建议追问 1", "建议追问 2"],
        })}
        yield {"event": "done", "data": "{}"}
    return EventSourceResponse(generator())

# ---------- 3) PDF 跳转 ----------
@app.get("/api/pdf")
async def pdf_proxy(path: str, page: int = 1):
    p = Path(path).resolve()
    # 安全：只允许 DATA_DIR 内的文件
    if not str(p).startswith(str(DATA_DIR.resolve())):
        raise HTTPException(403, "path not allowed")
    if not p.exists():
        raise HTTPException(404, "not found")
    return FileResponse(p, media_type="application/pdf",
                        headers={"X-Page": str(page)})

# ---------- 4) 偏好 / 摘录 / 对比表 / 反馈 ----------
@app.post("/api/memory")
async def update_memory(memory_input: str = Form(...), engine_mode: str = Form(...)):
    return {"status": GRADIO.predict(memory_input, engine_mode, api_name="/update_memory_prompt")}

@app.post("/api/pin")
async def pin(chat: list, notepad: str = ""):
    return {"notepad": GRADIO.predict(chat, notepad, api_name="/pin_to_notepad")}

@app.post("/api/compare")
async def compare(doc_list: List[str], dim_input: str, notepad: str = ""):
    md, status = GRADIO.predict(doc_list, dim_input, notepad, api_name="/generate_table")
    return {"markdown": md, "status": status}

@app.post("/api/feedback")
async def feedback(chat: list, vote: str):
    return {"status": GRADIO.predict(chat, vote, api_name="/log_feedback")}
```

### 4.3 启动
```bash
# 1) 启动 Gradio
python src/ui/app.py        # :7860

# 2) 启动代理
uvicorn api.proxy:app --reload --port 8000

# 3) 启动前端
cd insight-frontend
python -m http.server 3000
```

---

## 5. 前端：替换 mock 为真实 API

### 5.1 新建 `data/api.js`

把 `data/mock.js` 复制一份改名为 `api.js`，把每个字段从静态值改为 fetch：

```js
// data/api.js
const BASE = "http://localhost:8000/api";

window.INSIGHT_API = {
  async loadWorkspace() {
    const r = await fetch(`${BASE}/workspace`);
    return r.json();
  },

  async uploadFiles(files, memory, mode) {
    const fd = new FormData();
    files.forEach(f => fd.append("files", f));
    fd.append("memory_input", memory);
    fd.append("engine_mode", mode);
    const r = await fetch(`${BASE}/upload`, { method: "POST", body: fd });
    return r.json();
  },

  // ★ LangGraph 流式：返回一个 async iterator
  async *streamChat({ history, memory, mode }) {
    const r = await fetch(`${BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, memory_input: memory, engine_mode: mode }),
    });
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop();
      for (const ev of events) {
        const lines = ev.split("\n");
        const type = lines.find(l => l.startsWith("event:"))?.slice(6).trim();
        const data = lines.find(l => l.startsWith("data:"))?.slice(5).trim();
        if (type && data) yield { type, data: JSON.parse(data) };
      }
    }
  },

  pdfUrl(path, page) {
    return `${BASE}/pdf?path=${encodeURIComponent(path)}&page=${page}`;
  },
};
```

### 5.2 改 `variants/variant-c.jsx` 入口

把：
```js
const MC = window.INSIGHT_MOCK;        // ← 旧
```
改为：
```js
const API = window.INSIGHT_API;
const [MC, setMC] = useState(window.INSIGHT_MOCK_FALLBACK);  // 仍保留兜底
useEffect(() => {
  API.loadWorkspace().then(setMC).catch(console.error);
}, []);
```

### 5.3 接入 LangGraph 流式

把现有的 `runStream` 函数（`setTimeout` 模拟版）替换为：

```js
const runStream = async (userText) => {
  setThinkActive(0);
  setThinkExpanded(true);
  let nodeIdx = 0;
  // 维护本地节点 → label 表
  const NODE_TO_IDX = { router: 0, tool_extract: 1, hitl: 2, tool_execute: 3, generation: 4 };

  const history = [...MC.dialog, { role: "user", text: userText }];
  for await (const ev of API.streamChat({ history, memory: memoryInput, mode: engine })) {
    if (ev.type === "node") {
      nodeIdx = NODE_TO_IDX[ev.data.node] ?? nodeIdx;
      setThinkActive(nodeIdx);
    } else if (ev.type === "final") {
      // 写回最后一条 assistant 消息
      setDialog(d => [...d, {
        role: "assistant",
        text: ev.data.final_response,
        citations: ev.data.citations,
      }]);
      setFollowUps(ev.data.follow_ups || []);
    } else if (ev.type === "done") {
      setThinkActive(MC.langgraphNodes.length); // done
    }
  }
};
```

> 注意：`langgraphNodes` 数组的顺序和 `NODE_TO_IDX` 必须**严格匹配你后端 LangGraph 图的节点 id**。

### 5.4 PDF 模态接入

把模态里的硬编码内容替换成 iframe：
```jsx
<iframe
  src={API.pdfUrl(activeCitation.source_path, pdfPage)}
  className="vc-modal-iframe"
  style={{ width: "100%", height: "100%", border: 0 }}
/>
```

---

## 6. 引用契约与脚注跳转

按贵司 §7：
- 后端检索片段 metadata 必须含 `source` 与 `page_label`
- 前端脚注 `[1]` 显示什么、跳到哪一页，依据 `citations` 数组的每一项：

```ts
type Citation = {
  id: number;          // 1, 2, 3...
  source: string;      // "中芯国际(688981)深度.pdf"
  source_path: string; // 绝对路径，proxy 校验后 serve
  page: number;        // 14
  page_label?: string; // "P.14" 显示用
  snippet: string;     // hover 预览文字
};
```

前端在收到 `final` 事件后，引用脚注会自动联动右栏 PDF（已实现 hover 高亮 + 跳页）。

---

## 7. 引擎模式映射

前端 Tab 显示 → 提交给后端的字符串（**必须原文**）：

| 前端显示 | engine_mode 字段值 |
|---|---|
| 常规 RAG 问答 | `"常规 RAG 问答"` |
| Autonomous Agent | `"Autonomous Agent (含实时数据)"` |

在 `runStream` 调用前转换：
```js
const ENGINE_MAP = {
  rag:   "常规 RAG 问答",
  agent: "Autonomous Agent (含实时数据)",
};
const mode = ENGINE_MAP[engine];
```

---

## 8. 联调 Checklist

按顺序逐项打勾：

- [ ] Gradio 服务在 `:7860` 跑通，浏览器能开
- [ ] 跑 `gradio_client.Client("http://127.0.0.1:7860/").view_api()`，**记录所有 named_endpoints**
- [ ] 把 §4.2 模板里的 `api_name="/process_upload"` 等替换成你实测到的真实端点名
- [ ] FastAPI 代理 `:8000` 启动，访问 `http://localhost:8000/docs` 能看到 Swagger
- [ ] `curl -F files=@test.pdf http://localhost:8000/api/upload` 返回真实 sources
- [ ] 浏览器打开前端，右下角"询问"按钮触发流式，思考条节点按真实 LangGraph 顺序流转
- [ ] 引用脚注 `[1]` hover → 右栏 PDF 自动跳页 + 段落高亮
- [ ] 点击 PDF → 模态弹出，← / → 翻页有效
- [ ] 「猜你想问」chips 真实来自 `node_state.follow_ups`
- [ ] 点赞/点踩 → `data_dir/human_feedback_log.jsonl` 有新增

---

## 9. 部署建议

### 9.1 开发环境
- 三个进程分别本地起：Gradio、Proxy、静态 server
- 前端用 `python -m http.server` 即可

### 9.2 生产环境
- **前端**：把项目 build 成静态文件，扔到 Nginx / CDN
- **代理**：`uvicorn api.proxy:app --workers 4` + systemd
- **Gradio**：原样跑，但**仅监听 127.0.0.1**，不对外暴露
- **Nginx 配置**：
  ```nginx
  server {
    listen 443 ssl;
    server_name insight.yourcompany.com;
    location /            { root /var/www/insight-frontend; try_files $uri /index.html; }
    location /api/        { proxy_pass http://127.0.0.1:8000; proxy_buffering off; }
    location /api/pdf     { proxy_pass http://127.0.0.1:8000; }
    location /api/chat/stream {
      proxy_pass http://127.0.0.1:8000;
      proxy_buffering off;        # SSE 必须关
      proxy_read_timeout 3600s;
    }
  }
  ```

### 9.3 鉴权
代理层加一个 `Depends(verify_token)` 中间件即可；前端把 token 放 `Authorization: Bearer xxx` 头里。

---

## 10. 常见问题

**Q1: gradio_client 调用很慢？**
A: 第一次调用 `Client(url)` 会拉 schema，建议在 FastAPI 的 `startup` 钩子里只初始化一次（模板已实现）。

**Q2: SSE 在 Nginx 后被缓冲？**
A: `proxy_buffering off;` + `X-Accel-Buffering: no` 响应头，两者都加。

**Q3: 思考条节点对不上？**
A: 用真实后端跑一次，把 `node_name` 全打印出来，按顺序填到 `data/api.js` 的 `NODE_TO_IDX`，并同步更新 `data/mock.js` 里的 `langgraphNodes` 数组顺序。

**Q4: PDF 路径被代理拒绝？**
A: 检查 `INSIGHT_DATA_DIR` 环境变量是否包含原 Gradio `allowed_paths` 中的目录。

**Q5: 想保留三个方案能切换？**
A: 三个方案共享 `data/api.js`；只需在 `Insight 研报工作台 · 三方案.html` 里把 mock 引用换成 api 即可，业务逻辑无改动。

---

## 11. 下一步

完成基础接入后可以增强：

1. **WebSocket 替代 SSE**：双向通信，便于 hitl 节点用户回填
2. **流式 token-by-token**：在 `generation` 节点改用 `astream_events` 推 `token` 事件
3. **多用户会话隔离**：代理层加 `session_id`，每个用户独立 LangGraph state
4. **Citation 高亮做到 PDF 真实坐标**：后端返回 bbox，前端在 PDF.js 上画 overlay

---

如有任何字段对不上，把 `view_api()` 的输出贴给我，我可以帮您逐字段校准代理层的 `predict` 调用。
