/* 方案 B · 平衡版 */
const { useState, useRef, useEffect } = React;
const MB = window.INSIGHT_MOCK;

function VariantB() {
  const [sources, setSources] = useState(MB.sources);
  const [engine, setEngine] = useState('rag');
  const [activeCite, setActiveCite] = useState('1-1');
  const [pdfPage, setPdfPage] = useState(14);
  const [pdfDoc, setPdfDoc] = useState('中芯国际 (688981) 深度');
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, []);

  const toggleSrc = (id) => setSources(prev => prev.map(s => s.id === id ? { ...s, checked: !s.checked } : s));
  const onCite = (msgIdx, citeId) => {
    const msg = MB.dialog[msgIdx];
    const c = msg.citations?.find(x => x.id === citeId);
    if (!c) return;
    setActiveCite(`${msgIdx}-${citeId}`);
    setPdfDoc(c.source);
    setPdfPage(c.page);
  };

  const renderText = (text, citations, msgIdx) => {
    if (!citations) return text;
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[(\d+)\]$/);
      if (m) {
        const id = parseInt(m[1]);
        const isActive = activeCite === `${msgIdx}-${id}`;
        return <span key={i} className={'vb-cite-inline' + (isActive ? ' active' : '')} onClick={() => onCite(msgIdx, id)}>{id}</span>;
      }
      return <span key={i} dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />;
    });
  };

  return (
    <div className="vb-app">
      <div className="vb-topbar">
        <div className="vb-brand">
          <div className="vb-logo">I</div>
          <div className="vb-brand-text">
            <div className="vb-brand-name">Insight</div>
            <div className="vb-brand-sub">机构级研报分析工作台</div>
          </div>
        </div>
        <div className="vb-nav">
          <button className="active">工作区</button>
          <button>历史会话</button>
          <button>灵感库</button>
        </div>
        <div className="vb-search">
          <span>🔎</span>
          <input placeholder="跨工作区搜索引用、笔记、维度……" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)' }}>⌘K</span>
        </div>
        <div className="vb-topbar-spacer" />
        <button className="btn btn-sm btn-ghost">分享</button>
        <div className="vb-avatar">L</div>
      </div>

      <div className="vb-body">
        {/* 左 */}
        <aside className="vb-left scroll-fine" data-screen-label="left-sources">
          <div className="vb-left-head">
            <div className="vb-left-title">来源</div>
            <div className="vb-left-count">{sources.filter(s => s.checked).length}/{sources.length} 已选</div>
            <button className="vb-add-btn" title="新增 PDF">＋</button>
          </div>
          <div className="vb-source-actions">
            <span>全选</span>
            <span>反选</span>
            <span>仅显示已索引</span>
          </div>
          <div className="vb-source-list scroll-fine">
            {sources.map(s => (
              <div key={s.id} className={'vb-source' + (s.checked ? ' checked' : '')} onClick={() => toggleSrc(s.id)}>
                <div className="vb-source-head">
                  <div className="vb-source-icon">PDF</div>
                  <div className="vb-source-body">
                    <div className="vb-source-title">{s.title}</div>
                    <div className="vb-source-meta">{s.org} · {s.date} · {s.pages}页</div>
                  </div>
                  <div className="vb-source-check" />
                </div>
                <div className="vb-source-foot">
                  <span className="tag">{s.tag}</span>
                  <span style={{ color: s.indexed ? 'var(--ok)' : 'var(--warn)' }}>
                    {s.indexed ? '● 已索引' : '○ 待索引'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="vb-pref">
            <div className="vb-pref-title">⚙ 分析偏好</div>
            <div className="vb-pref-text">
              "关注毛利率与产能利用率拐点，控制下行风险。优先 DCF 与 PE 双重验证。"
            </div>
          </div>
        </aside>

        {/* 中 */}
        <main className="vb-center" data-screen-label="center-chat">
          <div className="vb-center-head">
            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>引擎</span>
            <div className={'vb-engine-pill' + (engine === 'agent' ? ' agent' : '')} onClick={() => setEngine(engine === 'rag' ? 'agent' : 'rag')}>
              <span className="dot" />
              {engine === 'rag' ? '常规 RAG 问答' : 'Autonomous Agent · 含实时数据'}
              <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>切换 ⇄</span>
            </div>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm btn-ghost">📌 摘录至灵感库</button>
            <button className="btn btn-sm btn-ghost">🗑 清除会话</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="scroll-fine" ref={chatRef}>
            <div className="vb-summary-card">
              <div className="vb-summary-eyebrow">全局摘要 · RAPTOR 树聚合 · 3 篇已选文档</div>
              <h2 className="vb-summary-h">AI 算力 + 半导体国产化双主线，2025H2 看 HBM 与设备</h2>
              <p className="vb-summary-text">{MB.summary}</p>
              <div className="vb-explore">
                <div className="vb-explore-label">推荐探索维度</div>
                <div className="vb-explore-chips">
                  {MB.recommended.map((q, i) => <span key={i} className="vb-explore-chip">{q}</span>)}
                </div>
              </div>
            </div>

            <div className="vb-chat">
              {MB.dialog.map((msg, idx) => (
                <div key={idx} className={'vb-msg ' + msg.role}>
                  <div className="vb-msg-avatar">{msg.role === 'user' ? 'L' : 'I'}</div>
                  <div className="vb-msg-body">
                    <div className="vb-msg-name">{msg.role === 'user' ? '李分析师' : 'Insight'}</div>
                    <div className="vb-msg-bubble">
                      {renderText(msg.text, msg.citations, idx)}
                      {msg.streaming && <span className="vb-typing" />}
                    </div>
                    {msg.citations && (
                      <div className="vb-cite-cards">
                        {msg.citations.map(c => (
                          <div key={c.id}
                            className={'vb-cite-card' + (activeCite === `${idx}-${c.id}` ? ' active' : '')}
                            onClick={() => onCite(idx, c.id)}>
                            <div className="vb-cite-card-head">
                              <div className="vb-cite-card-num">{c.id}</div>
                              <div className="vb-cite-card-source">{c.source}</div>
                              <div className="vb-cite-card-page">P.{c.page}</div>
                            </div>
                            <div className="vb-cite-card-snip">{c.snippet}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.role === 'assistant' && !msg.streaming && (
                      <div className="vb-msg-actions">
                        <button>👍</button>
                        <button>👎</button>
                        <button>📌 摘录</button>
                        <button>⎘ 复制</button>
                        <button>↻ 重答</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="vb-matrix-card">
              <div className="vb-matrix-head">
                <span className="tag tag-accent">维度对比</span>
                <span className="vb-matrix-title">中芯 · 北方华创 · 行业策略</span>
                <div style={{ flex: 1 }} />
                <button className="btn btn-sm">导出 Markdown</button>
              </div>
              <table className="vb-matrix-table">
                <thead>
                  <tr>
                    <th>文档</th>
                    {MB.matrix.dimensions.map(d => <th key={d}>{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MB.matrix.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.doc}</td>
                      {r.cells.map((c, j) => <td key={j}>{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="vb-composer">
            <div className="vb-composer-shell">
              <div className="vb-composer-row">
                <textarea className="vb-composer-input" rows={1}
                  placeholder="提出您的分析诉求……（Shift+Enter 换行 · @ 选择文档）" />
                <button className="vb-send-btn">↑</button>
              </div>
              <div className="vb-composer-tools">
                <span className="vb-composer-tool">＠ 文档</span>
                <span className="vb-composer-tool">＃ 维度</span>
                <span className="vb-composer-tool">📎 附件</span>
                <span style={{ flex: 1 }} />
                <span>3 篇文档 · Top-K 8</span>
              </div>
            </div>
          </div>
        </main>

        {/* 右 */}
        <aside className="vb-right" data-screen-label="right-pdf">
          <div className="vb-pdf-head">
            <div className="vb-pdf-eyebrow">📖 原文追溯 · 引用 [{activeCite?.split('-')[1] || '—'}]</div>
            <div className="vb-pdf-doc-title">{pdfDoc}.pdf</div>
          </div>
          <div className="vb-pdf-toolbar">
            <div className="vb-pdf-zoom">
              <button>−</button><span>100%</span><button>+</button>
            </div>
            <button className="btn btn-sm btn-ghost">⤓ 下载</button>
            <div className="vb-pdf-pager-b">
              <button className="btn btn-icon btn-ghost btn-sm">‹</button>
              <input value={pdfPage} onChange={e => setPdfPage(parseInt(e.target.value) || 1)} />
              <span>/ 52</span>
              <button className="btn btn-icon btn-ghost btn-sm">›</button>
            </div>
          </div>
          <div className="vb-pdf-canvas scroll-fine">
            <div className="vb-pdf-page">
              <span className="vb-pdf-page-num">第 {pdfPage} 页</span>
              <h3>三、先进制程进展与产能爬坡</h3>
              <p>3.1 N+2 工艺良率改善路径</p>
              <p>
                <span className="vb-pdf-hl">公司 N+2 工艺自 2024Q4 投产以来，良率从 65% 稳步提升，2025Q2 已达 82%</span>，
                达到可商用水平。结合临港新厂逐步释放，我们预计 N+2 节点 2025 全年贡献收入约 18 亿美元。
              </p>
              <div className="vb-pdf-fig">[ 图 3-1：N+2 良率与产能爬坡曲线 ]</div>
              <p>
                同时考虑设备到位节奏与下游客户验证周期，我们将 2026 年 N+2 收入指引上调至 32–36 亿美元区间。
                短期需密切跟踪光刻设备维护备件供应情况。
              </p>
              <p>3.2 12 吋整体产能展望</p>
              <p>
                截至 2025Q2，公司 12 吋等效月产能达到 78 万片，同比 +14%，主要由临港与北京 B3 厂带动。
              </p>
            </div>
            <div className="vb-pdf-page">
              <span className="vb-pdf-page-num">第 {pdfPage + 1} 页</span>
              <h3>四、风险与情景分析</h3>
              <p>若美方将出口管制范围扩大至 28nm 节点的设备维护与备件，中芯国际先进产线的稳定运行可能面临压力。</p>
              <div className="vb-pdf-fig">[ 表 4-1：三情景敏感度测算 ]</div>
            </div>
          </div>
        </aside>
      </div>

      {/* 灵感库便签 */}
      <div className="vb-notepad-fab">
        <div className="vb-notepad-head">📌 分析师灵感库 · {MB.pinned.length}</div>
        {MB.pinned.map((p, i) => (
          <div key={i} className="vb-notepad-item">
            <div className="vb-notepad-item-time">{p.time}</div>
            <div className="vb-notepad-item-title">{p.title}</div>
            <div>{p.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.VariantB = VariantB;
