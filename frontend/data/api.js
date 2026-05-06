// frontend/data/api.js
// 后端现在和前端挂载在同一个 7860 端口下，使用相对路径即可
const BASE = "/api";

window.INSIGHT_API = {
  async loadWorkspace() {
    // 暂用 mock 作为兜底数据结构
    return window.INSIGHT_MOCK || {}; 
  },

  async uploadFiles(files, memory, mode) {
    const fd = new FormData();
    files.forEach(f => fd.append("files", f));
    fd.append("memory_input", memory);
    fd.append("engine_mode", mode);
    const r = await fetch(`${BASE}/upload`, { method: "POST", body: fd });
    return r.json();
  },

  // 跳过解析/分块/embedding，直接加载持久化向量库 → 演示用
  async warmup(mode) {
    const r = await fetch(`${BASE}/warmup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine_mode: mode }),
    });
    if (!r.ok) throw new Error(`warmup failed: ${r.status}`);
    return r.json();
  },

  // === 演示直通模式 ===
  // 上传后秒返回（仅保存 + 抽全文，不嵌入）
  async uploadDemo(files, mode) {
    const fd = new FormData();
    files.forEach(f => fd.append("files", f));
    fd.append("engine_mode", mode);
    const r = await fetch(`${BASE}/upload/demo`, { method: "POST", body: fd });
    if (!r.ok) throw new Error(`upload/demo failed: ${r.status}`);
    return r.json();
  },

  // 全文直通 DeepSeek 流式问答
  async *streamPassthrough({ history, memory, selected_sources }) {
    const r = await fetch(`${BASE}/chat/passthrough`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, memory_input: memory, selected_sources }),
    });
    if (!r.ok) throw new Error(`passthrough failed: ${r.status}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE 事件由空行分隔，但 sse-starlette 可能用 "\r\n\r\n" 或 "\n\n"，统一处理
      const normalized = buf.replace(/\r\n/g, "\n");
      const events = normalized.split("\n\n");
      buf = events.pop(); // 残余字节留到下一帧
      for (const ev of events) {
        if (!ev.trim()) continue;
        // 一条事件内可能多行 data:，要拼起来；event: 取第一条
        let type = "message";
        const dataLines = [];
        for (const line of ev.split("\n")) {
          if (line.startsWith("event:")) type = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
          // 忽略 ":"-comment / "id:" / "retry:" 等
        }
        if (!dataLines.length) continue;
        const dataStr = dataLines.join("\n");
        let data;
        try { data = JSON.parse(dataStr); }
        catch (err) {
          console.error("[SSE parse error]", err, "raw:", dataStr.slice(0, 200));
          continue;
        }
        yield { type, data };
      }
    }
  },

  // 核心！请求 LangGraph 流式数据
  async *streamChat({ history, memory, mode }) {
    const r = await fetch(`${BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, memory_input: memory, engine_mode: mode }),
    });
    
    if (!r.ok) {
        throw new Error(`API 请求失败: ${r.status}`);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE 每条消息以两个换行符分割
      const events = buf.split("\n\n");
      buf = events.pop(); // 把最后不完整的残余留在 buf 里
      
      for (const ev of events) {
        const lines = ev.split("\n");
        const typeLine = lines.find(l => l.startsWith("event:"));
        const dataLine = lines.find(l => l.startsWith("data:"));
        
        if (typeLine && dataLine) {
            const type = typeLine.slice(6).trim();
            const dataStr = dataLine.slice(5).trim();
            // 解析抛出
            yield { type, data: JSON.parse(dataStr) };
        }
      }
    }
  },

  // 拼接 PDF 访问的真实 URL；翻页/缩放走 fragment（浏览器内置 PDF viewer 解析）
  // PDF Open Parameters:
  //   page=N      跳到第 N 页
  //   zoom=Z      Z=100/150 等百分比，或 page-fit / page-width
  //   toolbar=0   隐藏 Chrome/Edge PDF viewer 顶部工具栏
  //   navpanes=0  隐藏左侧缩略图/书签面板
  //   scrollbar=0 隐藏滚动条
  pdfUrl(path, page, zoom) {
    const params = ["toolbar=0", "navpanes=0", "scrollbar=0"];
    if (page) params.push(`page=${page}`);
    if (zoom) params.push(`zoom=${zoom}`);
    return `${BASE}/pdf?path=${encodeURIComponent(path)}#${params.join("&")}`;
  },
};
