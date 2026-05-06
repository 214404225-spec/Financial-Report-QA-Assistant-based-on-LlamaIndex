import os
import re
import json
import datetime
import sys
import gradio as gr
import gradio_client.utils as gradio_client_utils
from pathlib import Path

# `python src/ui/app.py` sets sys.path[0] to src/ui/, so `import src` fails unless root is on path.
_project_root = Path(__file__).resolve().parents[2]
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))


def _patch_gradio_client_schema():
    """Pydantic v2 can emit additionalProperties as bool; gradio_client 1.3 assumes dict."""
    _orig = gradio_client_utils._json_schema_to_python_type

    def _wrap(schema, defs):
        if not isinstance(schema, dict):
            return "Any"
        return _orig(schema, defs)

    gradio_client_utils._json_schema_to_python_type = _wrap


_patch_gradio_client_schema()
from src.utils.config import load_config, GLOBAL_CONFIG
from src.ingest.pdf_parser import load_financial_pdfs
from src.ingest.chunker import get_nodes
from src.ingest.indexer import get_index
from src.retrieval.retriever import get_hybrid_retriever
from src.retrieval.reranker import get_reranker
from src.generation.graph import build_chat_graph
# from src.generation.agent import get_financial_agent
from src.generation.overview import generate_document_overview
from src.generation.workspace import generate_comparison_table

class AppState:
    def __init__(self):
        self.chat_engine = None
        self.index = None
        self.nodes = None
        self.doc_map = {}
        self.current_mode = "常规 RAG 问答"
        self.data_dir = load_config()['storage']['data_dir']
        os.makedirs(self.data_dir, exist_ok=True)
        # 演示模式：filename → PDF 全文（PyMuPDF 抽取，秒级，不嵌入）
        self.pdf_texts = {}

state = AppState()

def initialize_system(pdf_files=None, user_memory="", mode="常规 RAG 问答"):
    if pdf_files or not state.index:
        documents = load_financial_pdfs(state.data_dir)
        state.doc_map = {doc.metadata['source']: doc.doc_id for doc in documents}
        state.nodes = get_nodes(documents)
        state.index = get_index(documents=documents, nodes=state.nodes)

    retriever = get_hybrid_retriever(state.index)
    reranker = get_reranker()

    state.current_mode = mode
    # Initialize LangGraph instead of LlamaIndex chat_engine
    state.chat_engine = build_chat_graph(retriever)

    overview = generate_document_overview(state.nodes)
    return "系统就绪", overview['summary'], overview['questions']


def warmup_system(mode="常规 RAG 问答"):
    """直接加载已持久化的 Chroma 集合，跳过 PDF 解析 / 分块 / 嵌入 / RAPTOR 摘要全流程。
    用于演示场景：之前已经索引过，本次启动只想立即问答。

    绕过 get_index 的 RAPTOR 路由（缺包时会抛 ImportError），直接走 build_vector_index 加载分支。
    """
    from src.ingest.indexer import build_vector_index
    state.index = build_vector_index(nodes=None)  # nodes=None → 走 from_vector_store 加载

    # doc_map 从 data_dir 现有 PDF 文件名重建
    state.doc_map = {p.name: p.name for p in Path(state.data_dir).glob("*.pdf")}
    state.nodes = None

    retriever = get_hybrid_retriever(state.index)
    state.current_mode = mode
    state.chat_engine = build_chat_graph(retriever)

    return "工作区已恢复（直接加载持久化向量库）"

def chat_response(message, history, user_memory="", mode="常规 RAG 问答"):
    from llama_index.core.llms import ChatMessage, MessageRole
    if not state.chat_engine or state.current_mode != mode:
        initialize_system(user_memory=user_memory, mode=mode)
        
    # Build history for LangGraph
    messages = []
    for user_msg, bot_msg in history:
        if user_msg:
            messages.append(ChatMessage(role=MessageRole.USER, content=user_msg))
        if bot_msg:
            messages.append(ChatMessage(role=MessageRole.ASSISTANT, content=bot_msg))
            
    # Add system/memory prompt and latest message
    if user_memory:
        messages.insert(0, ChatMessage(role=MessageRole.SYSTEM, content=user_memory))
    messages.append(ChatMessage(role=MessageRole.USER, content=message))
    
    # Invoke LangGraph
    initial_state = {"messages": messages}
    result_state = state.chat_engine.invoke(initial_state)
    
    final_response = result_state.get("final_response", "无有效回答。")
    citations = result_state.get("citations", [])
    
    # Mocking streaming effect for Gradio UI compatibility
    import time
    partial_message = ""
    chunk_size = max(1, len(final_response) // 20)
    for i in range(0, len(final_response), chunk_size):
        partial_message += final_response[i:i+chunk_size]
        # Reconstruct nodes format for UI cite_html
        class MockNode:
            def __init__(self, metadata, content=""):
                self.metadata = metadata
                self._content = content
            def get_content(self):
                return self._content
        nodes = [MockNode({
            "source": c.get("source", "未知"), 
            "page_label": c.get("page", "未知")
        }, "来源内容提取自记忆上下文...") for c in citations]
        time.sleep(0.02)
        yield partial_message, nodes

def update_pdf_viewer(doc_name, page_num):
    if not doc_name:
        return "请在对话中点击引用来源，或在左侧选择文档以在此处预览。"
    abs_path = os.path.abspath(os.path.join(state.data_dir, doc_name))
    page_anchor = f"#page={page_num}" if page_num else ""
    html_content = f"""
    <iframe
        src="/gradio/file={abs_path}{page_anchor}"
        width="100%"
        height="800px"
        style="border: 1px solid #ccc; border-radius: 8px;">
    </iframe>
    """
    return html_content

def format_citations_to_html(source_nodes):
    if not source_nodes:
        return "无引用来源。", []
        
    html = "<div style='font-size: 0.9em;'>"
    choices = []
    for i, node in enumerate(source_nodes):
        doc = node.metadata.get("source", "未知文档")
        page = node.metadata.get("page_label", "1")
        content = node.get_content()[:150].replace('\n', ' ') + "..."
        is_summary = node.metadata.get("is_summary", False)
        badge = "<span style='background-color:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:0.8em;'>宏观摘要</span>" if is_summary else f"<span style='background-color:#fef08a; color:#b45309; padding:2px 6px; border-radius:4px; font-size:0.8em;'>第 {page} 页</span>"
        
        html += f"<div style='margin-bottom: 10px; padding: 10px; background-color: #f8fafc; border-left: 4px solid #3b82f6;'>"
        html += f"<strong>📄 {doc}</strong> {badge}<br/>"
        html += f"<span style='color: #475569;'>{content}</span>"
        html += "</div>"
        
        if not is_summary:
            choices.append(f"{doc} (页码: {page})")
            
    html += "</div>"
    return html, list(set(choices))

def bot_msg(history, user_memory="", engine_mode="常规 RAG 问答"):
    user_message = history[-1][0]
    gen = chat_response(user_message, history[:-1], user_memory=user_memory, mode=engine_mode)
    
    history[-1][1] = ""
    source_nodes = []
    for partial_resp, nodes in gen:
        history[-1][1] = partial_resp
        source_nodes = nodes
        yield history, gr.update(visible=False), gr.update(choices=[])

    citations_html, jump_choices = format_citations_to_html(source_nodes)
    
    default_viewer = "在此预览文档..."
    if jump_choices:
        first_doc, first_page = jump_choices[0].split(" (页码: ")
        first_page = first_page.rstrip(")")
        default_viewer = update_pdf_viewer(first_doc, first_page)
        
    yield history, gr.update(value=citations_html, visible=True), gr.update(choices=jump_choices, value=jump_choices[0] if jump_choices else None)

def process_upload(files, user_memory="", engine_mode="常规 RAG 问答"):
    if not files:
        return "⚠️ 请先选择 PDF 文件。", gr.update(), "", "", "请上传文档。"

    names = []
    for f in files:
        dest = Path(state.data_dir) / Path(f.name).name
        with open(f.name, "rb") as src, open(dest, "wb") as dst:
            dst.write(src.read())
        names.append(dest.name)

    status, summary, qs = initialize_system(pdf_files=names, user_memory=user_memory, mode=engine_mode)
    viewer_html = update_pdf_viewer(names[0], 1) if names else "请上传文档。"
    
    return (
        f"✅ 索引完成: {status}", 
        gr.update(choices=list(state.doc_map.keys())), 
        summary, 
        qs,
        viewer_html
    )

def handle_jump_selection(selection):
    if not selection:
        return gr.update()
    try:
        doc_name, page_str = selection.split(" (页码: ")
        page_num = page_str.rstrip(")")
        return update_pdf_viewer(doc_name, page_num)
    except:
        return gr.update()

def update_memory_prompt(memory_text, engine_mode="常规 RAG 问答"):
    """更新内存并强制重建 LangGraph。memory_text 在 chat_response 里以 SYSTEM 消息逐次注入。"""
    if state.index:
        retriever = get_hybrid_retriever(state.index)
        state.current_mode = engine_mode
        state.chat_engine = build_chat_graph(retriever)
    return "✅ 偏好已注入，新提问将遵循该指令。"

# --- 新增的 Workspace 工具函数 ---
def log_feedback(history, feedback_type):
    if not history or not history[-1][0] or not history[-1][1]:
        return "⚠️ 暂无有效对话可供反馈。"
    
    log_entry = {
        "timestamp": datetime.datetime.now().isoformat(),
        "query": history[-1][0],
        "response": history[-1][1],
        "feedback": feedback_type
    }
    log_path = os.path.join(state.data_dir, "human_feedback_log.jsonl")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
    return f"✅ 已记录您的偏好反馈: {feedback_type}"

def pin_to_notepad(history, current_notepad):

    """提取历史中最后一条系统回答，追加到记事本中。"""
    if not history or not history[-1][1]:
        return current_notepad
    
    answer = history[-1][1]
    new_entry = f"---\n\n📝 **已保存回答 (提取自对话)**:\n{answer}\n\n"
    
    if current_notepad:
        return current_notepad + new_entry
    return new_entry

def generate_table(selected_docs, dimension, current_notepad):
    """生成多篇文档对比表，并尝试直接追加到灵感库。"""
    if not state.index:
        return current_notepad, "⚠️ 错误：系统尚未构建索引。"
        
    table_md = generate_comparison_table(state.index, selected_docs, dimension)
    
    # 无论当前有没有笔记，都把对比结果放进灵感库
    new_entry = f"---\n\n{table_md}\n\n"
    if current_notepad:
        new_content = current_notepad + new_entry
    else:
        new_content = new_entry
        
    return new_content, "✅ 对比表已生成，请查看下方的【灵感库】。"


# --- 构建 Gradio 三栏 UI ---
custom_css = """
    body { background-color: #f8fafc; font-family: 'Inter', -apple-system, sans-serif; }
    .container { max-width: 95%; margin: auto; padding: 20px; }
    .chat-box { height: 50vh !important; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .notepad-box { background-color: #fffbeb !important; border: 1px solid #fde68a; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);}
    .panel-box { background-color: #ffffff; border-radius: 12px; padding: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 15px; }
    .pdf-container iframe { border-radius: 12px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
"""

_theme = gr.themes.Soft(primary_hue="indigo", neutral_hue="slate")
with gr.Blocks(title="Insight | 金融研报分析引擎") as demo:
    gr.Markdown("# 📈 **Insight** · 机构级研报分析工作台")

    with gr.Row():
        with gr.Column(scale=2, elem_classes="panel-box"):
            gr.Markdown("### 📂 数据底座")
            file_upload = gr.File(label="导入研报 (支持 PDF 深度解析)", file_count="multiple")
            upload_btn = gr.Button("🚀 启动深度索引 (LlamaParse)", variant="primary")
            doc_list = gr.Dropdown(label="已激活的工作区", multiselect=True)

            gr.Markdown("---")
            gr.Markdown("### 💡 宏观脉络")
            summary_box = gr.Textbox(label="全局摘要 (RAPTOR 树聚合)", lines=5)
            qs_box = gr.Textbox(label="推荐探索维度", lines=5)

            gr.Markdown("---")
            gr.Markdown("### 🧠 分析师记忆设定")
            memory_input = gr.Textbox(
                label="设定您的偏好",
                placeholder="例如：我重点关注现金流；请用表格输出...",
                lines=3,
            )
            memory_btn = gr.Button("注入记忆偏好")
            memory_status = gr.Markdown()

            status_text = gr.Markdown("*尚未建立连接...*")

        with gr.Column(scale=4):
            gr.Markdown("### 💬 智能洞察助手")
            engine_mode = gr.Radio(
                choices=["常规 RAG 问答", "Autonomous Agent (含实时数据)"],
                value="常规 RAG 问答",
                label="引擎模式",
            )
            chatbot = gr.Chatbot(elem_classes="chat-box")
            msg_input = gr.Textbox(
                label="提出您的分析诉求...",
                placeholder="例如：详细对比这几份报告中提到的23年毛利率波动。",
            )

            with gr.Row():
                submit_btn = gr.Button("生成洞察", variant="primary")
                pin_btn = gr.Button("📌 摘录至灵感库", variant="secondary")
                clear_btn = gr.Button("清除会话")

            with gr.Row():
                like_btn = gr.Button("👍 赞 (Like)")
                dislike_btn = gr.Button("👎 踩 (Dislike)")
                feedback_status = gr.Markdown()

            gr.Markdown("#### 🔍 溯源证据链")
            cite_html = gr.HTML(label="引用溯源", visible=False)
            jump_dropdown = gr.Dropdown(
                label="🎯 沉浸验证 (点击自动跳转右侧阅读器)",
                choices=[],
            )

            gr.Markdown("---")
            gr.Markdown("### 📝 知识聚合")
            with gr.Row():
                dim_input = gr.Textbox(
                    label="跨文档分析维度",
                    placeholder="例如：三季度营收增速...",
                    scale=3,
                )
                table_btn = gr.Button("生成多维对比矩阵", variant="secondary", scale=1)

            table_status = gr.Markdown()
            notepad_area = gr.Textbox(
                label="📌 分析师灵感库 (Notepad)",
                lines=8,
                elem_classes="notepad-box",
            )

        with gr.Column(scale=4, elem_classes="panel-box"):
            gr.Markdown("### 📖 原文追溯视图")
            pdf_viewer = gr.HTML(
                value=(
                    "<div style='text-align:center; padding:100px; color:#94a3b8; font-style: italic;'>"
                    "👈 暂无激活文档。<br/>请在左侧导入研报，或点击证据链跳转。"
                    "</div>"
                ),
                elem_classes="pdf-container",
            )

    # --- 绑定事件逻辑 ---
    memory_btn.click(update_memory_prompt, inputs=[memory_input, engine_mode], outputs=[memory_status])
    
    upload_btn.click(
        process_upload, 
        [file_upload, memory_input, engine_mode], 
        [status_text, doc_list, summary_box, qs_box, pdf_viewer]
    )
    
    submit_btn.click(lambda x, h: ("", h + [[x, None]]), [msg_input, chatbot], [msg_input, chatbot], queue=False).then(
        bot_msg, [chatbot, memory_input, engine_mode], [chatbot, cite_html, jump_dropdown]
    ).then(
        handle_jump_selection, jump_dropdown, pdf_viewer
    )
    
    msg_input.submit(lambda x, h: ("", h + [[x, None]]), [msg_input, chatbot], [msg_input, chatbot], queue=False).then(
        bot_msg, [chatbot, memory_input, engine_mode], [chatbot, cite_html, jump_dropdown]
    ).then(
        handle_jump_selection, jump_dropdown, pdf_viewer
    )
    
    jump_dropdown.change(handle_jump_selection, jump_dropdown, pdf_viewer)
    
    pin_btn.click(pin_to_notepad, inputs=[chatbot, notepad_area], outputs=[notepad_area])
    table_btn.click(generate_table, inputs=[doc_list, dim_input, notepad_area], outputs=[notepad_area, table_status])
    
    like_btn.click(lambda h: log_feedback(h, "Like"), inputs=[chatbot], outputs=[feedback_status])
    dislike_btn.click(lambda h: log_feedback(h, "Dislike"), inputs=[chatbot], outputs=[feedback_status])
    
    clear_btn.click(lambda: (None, ""), None, [chatbot, feedback_status], queue=False)

# ==========================================
# FastAPI 混合路由挂载 (前端联调核心层)
# ==========================================
import json
import threading
from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from llama_index.core.llms import ChatMessage, MessageRole
from typing import List

# 防止两个请求同时重建索引/重置 chat_engine 造成串轨
_state_lock = threading.Lock()

# 挂载 FastAPI 以暴露前后端对接指南中约定的 API
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/upload")
async def api_upload(
    files: List[UploadFile] = File(...),
    memory_input: str = Form(""),
    engine_mode: str = Form("常规 RAG 问答"),
):
    """处理前端上传的文件并触发索引构建。

    注意：当前 load_financial_pdfs 会扫描整个 data_dir 全量建索引（累积语义），
    所以本次新上传文件会与 data_dir 中已有的旧 PDF 一起进入工作区。返回结构里
    的 status / sources 会显式区分『本次新增』和『工作区累计』，前端按需展示。
    """
    import shutil

    saved_names = []
    # 1. 保存文件到 data_dir
    for f in files:
        safe_name = os.path.basename(f.filename)
        dst_path = os.path.join(state.data_dir, safe_name)
        with open(dst_path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        saved_names.append(safe_name)

    # 2. 同步建索引；丢线程池里跑，别阻塞 event loop
    def _do_init():
        with _state_lock:
            return initialize_system(
                pdf_files=saved_names,
                user_memory=memory_input,
                mode=engine_mode,
            )

    status_text, summary, qs = await run_in_threadpool(_do_init)

    new_set = set(saved_names)
    workspace_total = len(state.doc_map)
    extra = max(workspace_total - len(new_set), 0)
    status_msg = (
        f"{status_text} · 本次新增 {len(new_set)} 份"
        + (f"，工作区累计 {workspace_total} 份（含 {extra} 份历史文件）" if extra else "")
    )

    # 3. 构造符合 frontend/data/api.js 约定的返回结构
    return {
        "status": status_msg,
        "sources": [
            {
                "id": i,
                "title": name,
                "checked": True,
                # 前端可据此把"本次刚上传"高亮成 NEW、把历史文件标灰
                "is_new": name in new_set,
            }
            for i, name in enumerate(state.doc_map.keys())
        ],
        "uploaded": list(new_set),
        "workspace_total": workspace_total,
        "summary": summary,
        "recommended": [q for q in (qs or "").split("\n") if q.strip()],
    }

@app.post("/api/chat/stream")
async def api_chat_stream(request: Request):
    req_data = await request.json()
    history = req_data.get("history", [])
    memory_input = req_data.get("memory_input", "")
    engine_mode = req_data.get("engine_mode", "常规 RAG 问答")

    # 构建内存与历史消息
    messages = []
    if memory_input:
        messages.append(ChatMessage(role=MessageRole.SYSTEM, content=memory_input))
    for msg in history:
        r = msg.get("role")
        if r == "system":
            role = MessageRole.SYSTEM
        elif r == "assistant":
            role = MessageRole.ASSISTANT
        else:
            role = MessageRole.USER
        messages.append(ChatMessage(role=role, content=msg.get("text", "")))

    initial_state = {"messages": messages}

    # 在 async 上下文外把 chat_engine 抓到本地引用，避免迭代过程中被其他请求覆盖。
    # initialize_system 是同步重活，扔线程池里跑，不阻塞 event loop。
    def _ensure_chain():
        with _state_lock:
            if not state.chat_engine or state.current_mode != engine_mode:
                initialize_system(user_memory=memory_input, mode=engine_mode)
            return state.chat_engine

    chain = await run_in_threadpool(_ensure_chain)

    NODE_LABELS = {
        "condense": "正在消解对话上下文...",
        "router": "意图判定完毕",
        "tool_extract": "已确定所需工具及参数",
        "hitl": "需要用户澄清参数",
        "tool_execute": "研报检索或外部API调用完毕",
        "generation": "最终结果生成完毕",
    }

    # 同步生成器：sse_starlette 支持，并由 starlette 自动放线程池迭代，不会阻塞 event loop
    def generator():
        for event in chain.stream(initial_state):
            for node_name, node_state in event.items():
                label = NODE_LABELS.get(node_name, f"执行节点: {node_name}")
                yield {"event": "node", "data": json.dumps({"node": node_name, "label": label})}

                if node_name == "generation":
                    frontend_citations = []
                    for i, c in enumerate(node_state.get("citations", [])):
                        frontend_citations.append({
                            "id": i + 1,
                            "source": c.get("source", "未知"),
                            "page": c.get("page", 1),
                            "snippet": c.get("snippet", ""),
                        })

                    yield {"event": "final", "data": json.dumps({
                        "final_response": node_state.get("final_response", "无有效回答。"),
                        "citations": frontend_citations,
                        "follow_ups": node_state.get("follow_ups", []),
                    }, ensure_ascii=False)}

        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(generator())

@app.post("/api/warmup")
async def api_warmup(request: Request):
    """演示快捷键：直接加载持久化 Chroma 集合 + 列出 data_dir 下已有 PDF。无嵌入开销。"""
    try:
        req_data = await request.json()
    except Exception:
        req_data = {}
    engine_mode = req_data.get("engine_mode", "常规 RAG 问答")

    def _do():
        with _state_lock:
            return warmup_system(mode=engine_mode)

    try:
        status_text = await run_in_threadpool(_do)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"warmup 失败: {e}")

    return {
        "status": status_text,
        "sources": [
            {"id": i, "title": name, "checked": True, "is_new": False}
            for i, name in enumerate(state.doc_map.keys())
        ],
        "workspace_total": len(state.doc_map),
        "summary": "（已跳过摘要生成，直接进入问答）",
        "recommended": [],
    }


# =====================================================================
# 演示直通模式：跳过 RAG 全部环节，PDF 全文直接送给 DeepSeek（128K 上下文）
# =====================================================================

def _extract_pdf_text(path: str, max_chars: int = 120_000) -> str:
    """用 PyMuPDF 抽全文。max_chars 防止超长 PDF 把上下文窗撑爆。
    格式：每页前缀 [P.N] 方便 LLM 输出页码引用。"""
    import fitz  # PyMuPDF
    doc = fitz.open(path)
    parts = []
    total = 0
    for i, page in enumerate(doc):
        text = page.get_text("text") or ""
        block = f"\n\n[P.{i + 1}]\n{text}"
        if total + len(block) > max_chars:
            parts.append(f"\n\n[...后续 {len(doc) - i} 页内容因长度限制被截断...]")
            break
        parts.append(block)
        total += len(block)
    doc.close()
    return "".join(parts).strip()


@app.post("/api/upload/demo")
async def api_upload_demo(
    files: List[UploadFile] = File(...),
    engine_mode: str = Form("常规 RAG 问答"),
):
    """演示模式上传：只保存 PDF + 抽全文缓存，**不**做 embedding / 索引。秒级返回。"""
    import shutil

    saved = []
    for f in files:
        safe_name = os.path.basename(f.filename)
        dst = os.path.join(state.data_dir, safe_name)
        with open(dst, "wb") as buf:
            shutil.copyfileobj(f.file, buf)
        saved.append((safe_name, dst))

    def _do_extract():
        for name, path in saved:
            try:
                state.pdf_texts[name] = _extract_pdf_text(path)
            except Exception as e:
                state.pdf_texts[name] = f"[PDF 解析失败: {e}]"
        # 同步更新 doc_map（前端需要列表）
        for name, _ in saved:
            state.doc_map.setdefault(name, name)

    await run_in_threadpool(_do_extract)

    new_set = {name for name, _ in saved}
    return {
        "status": f"已就绪 · 本次上传 {len(saved)} 份（直通 DeepSeek，无嵌入开销）",
        "sources": [
            {"id": i, "title": name, "checked": True, "is_new": name in new_set}
            for i, name in enumerate(state.doc_map.keys())
        ],
        "uploaded": [name for name, _ in saved],
        "workspace_total": len(state.doc_map),
        "summary": "（演示模式：上传文档全文将作为上下文直接传给 DeepSeek）",
        "recommended": [],
    }


@app.post("/api/chat/passthrough")
async def api_chat_passthrough(request: Request):
    """演示直通问答：把指定 PDF 的全文塞进 system prompt，让 DeepSeek 流式回答。"""
    req = await request.json()
    history = req.get("history", [])
    selected = req.get("selected_sources") or []
    memory_input = req.get("memory_input", "")

    available = list(state.pdf_texts.keys())
    print(f"[passthrough] history_len={len(history)}, selected={selected}, available={available}")

    if not history:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="history 为空")

    # 兜底：如果前端传的文件名与缓存里的对不上（多半是大小写/空格问题），
    # 退化成"使用所有缓存文档"，避免出现"文档未提供"的尴尬。
    contexts = []
    for name in selected:
        text = state.pdf_texts.get(name)
        if text:
            contexts.append(f"=== 文档：{name} ===\n{text}")
    if not contexts and available:
        print("[passthrough] 选中文档名与缓存不匹配，回退使用全部缓存文档")
        for name in available:
            contexts.append(f"=== 文档：{name} ===\n{state.pdf_texts[name]}")

    context_block = "\n\n".join(contexts) if contexts else "（暂无可用文档全文）"
    print(f"[passthrough] 拼接 context_block 长度={len(context_block)} 字符")

    system_prompt = (
        "你是金融研报分析助手。下面是用户上传的研报全文，每页前用 [P.N] 标记页码。"
        "请严格基于以下文档内容回答用户问题；引用具体数字/结论时用 [P.N] 标注页码。"
        "如果文档中无答案，直说『文档中未找到相关信息』。\n\n"
        f"{context_block}"
    )
    if memory_input:
        system_prompt += f"\n\n[用户偏好]：{memory_input}"

    # 历史 + 最新问题
    messages = [{"role": "system", "content": system_prompt}]
    for m in history:
        r = m.get("role")
        role = "user" if r == "user" else "assistant" if r == "assistant" else "user"
        messages.append({"role": role, "content": m.get("text", "")})

    # 直接拿 OpenAI client 流式（项目里 llm_backend 已经按 DeepSeek 配置好）
    from openai import OpenAI as _OpenAI
    cfg = GLOBAL_CONFIG
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        print("[passthrough] ⚠️ 环境变量 DEEPSEEK_API_KEY 为空")
    client = _OpenAI(
        api_key=api_key or "EMPTY",
        base_url=cfg["llm"].get("api_base", "https://api.deepseek.com/v1"),
    )
    model_name = cfg["llm"].get("weak_model", "deepseek-chat")
    print(f"[passthrough] 调用 DeepSeek model={model_name}, base_url={cfg['llm'].get('api_base')}")

    def generator():
        # 节点状态条：跑个简短的"伪节点"序列让前端思考栏动起来
        yield {"event": "node", "data": json.dumps({"node": "condense", "label": "整理对话上下文"})}
        yield {"event": "node", "data": json.dumps({"node": "tool_execute", "label": "正在阅读研报全文"})}
        yield {"event": "node", "data": json.dumps({"node": "generation", "label": "DeepSeek 流式生成中"})}

        full = ""
        try:
            stream = client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=True,
                temperature=cfg["llm"].get("temperature", 0.1),
                max_tokens=cfg["llm"].get("max_tokens", 2048),
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    full += delta
                    yield {"event": "delta", "data": json.dumps({"text": delta}, ensure_ascii=False)}
            print(f"[passthrough] ✅ 流结束，总长 {len(full)} 字符")
        except Exception as e:
            import traceback
            print(f"[passthrough] ❌ DeepSeek 调用失败: {type(e).__name__}: {e}")
            traceback.print_exc()
            yield {"event": "delta", "data": json.dumps({"text": f"\n\n[LLM 调用失败: {type(e).__name__}: {e}]"}, ensure_ascii=False)}

        # 提取页码引用作为简易 citations
        page_refs = sorted({m for name in selected for m in
                            __import__("re").findall(r"\[P\.(\d+)\]", full)},
                           key=lambda x: int(x))
        primary_doc = selected[0] if selected else ""
        citations = [
            {"id": i + 1, "source": primary_doc, "page": int(p), "snippet": ""}
            for i, p in enumerate(page_refs[:6])
        ]

        yield {"event": "final", "data": json.dumps({
            "final_response": full,
            "citations": citations,
            "follow_ups": [],
        }, ensure_ascii=False)}
        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(generator())


# 供前端调用读取 PDF 文件的便捷代理。翻页由前端用 URL fragment (#page=N) 完成。
@app.get("/api/pdf")
async def api_pdf(path: str):
    # os.path.basename 防止目录穿越
    safe_filename = os.path.basename(path)
    p = Path(state.data_dir).resolve() / safe_filename

    if not p.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="PDF 文件不存在")

    return FileResponse(p, media_type="application/pdf")


_FRONTEND_DIR = _project_root / "frontend"
_INSIGHT_MAIN_HTML = _FRONTEND_DIR / "Insight 研报工作台 · 大胆版.html"


@app.get("/")
async def serve_insight_main_ui():
    """主入口：Insight 研报工作台 · 大胆版（HTML 内 styles/、data/、variants/ 等相对路径）。"""
    if not _INSIGHT_MAIN_HTML.is_file():
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(
            f"未找到主前端: {_INSIGHT_MAIN_HTML}",
            status_code=404,
        )
    return FileResponse(_INSIGHT_MAIN_HTML, media_type="text/html; charset=utf-8")


app = gr.mount_gradio_app(app, demo, path="/gradio")

if _FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIR), html=False), name="frontend")
else:
    print("⚠️ 未找到 frontend/ 目录：主页面所需的 CSS/JS 将无法加载。")


if __name__ == "__main__":
    import uvicorn
    config = load_config()
    _host = os.environ.get("GRADIO_SERVER_NAME", "127.0.0.1")
    _port = int(os.environ.get("GRADIO_SERVER_PORT", "7860"))
    
    print(f"🚀 Insight 服务已启动！")
    print(f"🌐 主前端（大胆版）: http://{_host}:{_port}/")
    print(f"🛠 Gradio 管理台: http://{_host}:{_port}/gradio")
    print(f"🔌 API: http://{_host}:{_port}/api/*")
    
    uvicorn.run(app, host=_host, port=_port)

