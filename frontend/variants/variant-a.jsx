/* 方案 A · 保守版 */
const { useState, useEffect, useRef } = React;

const M = window.INSIGHT_MOCK;

function VariantA() {
  const [sources, setSources] = useState(M.sources);
  const [engine, setEngine] = useState('rag');
  const [activeCite, setActiveCite] = useState(null);
  const [pdfPage, setPdfPage] = useState(14);
  const [pdfDoc, setPdfDoc] = useState('中芯国际 (688981) 深度');
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, []);

  const toggleSrc = (id) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, checked: !s.checked } : s));
  };

  const onCite = (msgIdx, citeId) => {
    const msg = M.dialog[msgIdx];
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
        return (
          <span key={i} className="va-cite" onClick={() => onCite(msgIdx, id)}>{id}</span>
        );
      }
      return <span key={i} dangerouslySetInnerHTML={{
        __html: p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
      }} />;
    });
  };

  return (
    <div className="va-app">
      <div className="va-topbar">
        <div className="va-brand">
          <div className="va-logo">I</div>
          <div>
            <div className="va-brand-name">Insight</div>
          </div>
          <div className="va-brand-sub">机构级研报分析工作台</div>
        </div>
        <div className="va-topbar-spacer" />
        <div className="va-topbar-actions">
          <button className="btn btn-sm btn-ghost">分享</button>
          <button className="btn btn-sm btn-ghost">设置</button>
        </div>
      </div>

      <div className="va-body">
        {/* 左栏 */}
        <aside className="va-left scroll-fine" data-screen-label="left-sources">
          <div className="va-section">
            <div className="va-section-title">导入研报</div>
            <div className="va-upload">
              <div className="va-upload-icon">⬆</div>
              <div className="va-upload-text">拖入或选择 PDF</div>
              <div className="va-upload-hint">支持 LlamaParse 深度解析</div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 8 }}>
              🚀 启动深度索引
            </button>
          </div>

          <div className="va-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '14px 8px 0' }}>
            <div className="va-section-title" style={{ padding: '0 8px' }}>
              已激活的工作区 · {sources.filter(s => s.checked).length}/{sources.length}
            </div>
            <div className="va-doc-list scroll-fine">
              {sources.map(s => (
                <div key={s.id} className={'va-doc' + (s.checked ? ' selected' : '')} onClick={() => toggleSrc(s.id)}>
                  <div className="va-doc-check" />
                  <div className="va-doc-info">
                    <div className="va-doc-title">{s.title}</div>
                    <div className="va-doc-meta">
                      <span>{s.org}</span>
                      <span>·</span>
                      <span>{s.date}</span>
                      <span>·</span>
                      <span>{s.pages}页</span>
                    </div>
                    <div className="va-doc-meta">
                      <span className="tag">{s.tag}</span>
                      <span className={'va-doc-status' + (s.indexed ? '' : ' pending')}>
                        {s.indexed ? '● 已索引' : '○ 待索引'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="va-section" style={{ borderBottom: 0 }}>
            <div className="va-section-title">分析偏好</div>
            <textarea className="field" rows={2} placeholder="例如：以 PE 估值为主，注重风险点……" defaultValue="关注毛利率与产能利用率拐点，控制下行风险。" />
            <button className="btn btn-sm" style={{ marginTop: 8, width: '100%' }}>注入记忆偏好</button>
          </div>
        </aside>

        {/* 中栏 */}
        <main className="va-center" data-screen-label="center-chat">
          <div className="va-engine-bar">
            <span className="va-engine-label">引擎模式</span>
            <div className="va-segment">
              <button className={'va-segment-btn' + (engine === 'rag' ? ' active' : '')} onClick={() => setEngine('rag')}>常规 RAG 问答</button>
              <button className={'va-segment-btn' + (engine === 'agent' ? ' active' : '')} onClick={() => setEngine('agent')}>Autonomous Agent · 含实时数据</button>
            </div>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm btn-ghost">📌 摘录至灵感库</button>
            <button className="btn btn-sm btn-ghost">清除会话</button>
          </div>

          <div className="va-summary-block">
            <div className="va-summary-head">
              <div className="va-summary-title">全局摘要 · RAPTOR 树聚合</div>
              <span className="tag tag-accent">3 篇文档已聚合</span>
            </div>
            <div className="va-summary-text">{M.summary}</div>
            <div className="va-section-title" style={{ margin: '14px 0 6px', padding: 0 }}>推荐探索维度</div>
            <div className="va-chips">
              {M.recommended.map((q, i) => (
                <span key={i} className="va-chip">{q}</span>
              ))}
            </div>
          </div>

          <div className="va-chat scroll-fine" ref={chatRef}>
            {M.dialog.map((msg, idx) => (
              <div key={idx} className={'va-msg ' + msg.role}>
                <div className="va-msg-role">
                  {msg.role === 'user' ? (
                    <><span className="va-msg-avatar user">U</span>分析师</>
                  ) : (
                    <><span className="va-msg-avatar assistant">I</span>Insight</>
                  )}
                </div>
                <div className="va-msg-bubble">
                  {renderText(msg.text, msg.citations, idx)}
                  {msg.streaming && <span className="va-typing" />}
                </div>
                {msg.citations && (
                  <div className="va-msg-cites">
                    {msg.citations.map(c => (
                      <div key={c.id} className="va-msg-cite-row">
                        <div className="va-msg-cite-num">{c.id}</div>
                        <div className="va-msg-cite-body">
                          <div className="va-msg-cite-meta" onClick={() => onCite(idx, c.id)}>
                            {c.source} · 第 {c.page} 页 →
                          </div>
                          <div className="va-msg-cite-snip">"{c.snippet}"</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {msg.role === 'assistant' && !msg.streaming && (
                  <div className="va-msg-actions">
                    <span className="va-msg-action">👍 赞</span>
                    <span className="va-msg-action">👎 踩</span>
                    <span className="va-msg-action">📌 摘录</span>
                    <span className="va-msg-action">⎘ 复制</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="va-composer">
            <div className="va-composer-box">
              <textarea className="va-composer-input" rows={1} placeholder="提出您的分析诉求……（Shift+Enter 换行）" />
              <div className="va-composer-actions">
                <button className="btn btn-icon btn-ghost" title="附加文档">＋</button>
                <button className="va-send">→</button>
              </div>
            </div>
            <div className="va-composer-hint">
              <span>3 篇文档已纳入检索</span>
              <span>常规 RAG · Top-K 8 · 流式</span>
            </div>
          </div>
        </main>

        {/* 右栏 */}
        <aside className="va-right" data-screen-label="right-pdf">
          <div className="va-pdf-bar">
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>📖 原文追溯</span>
            <div className="va-pdf-title">{pdfDoc}.pdf</div>
            <div className="va-pdf-pager">
              <button className="btn btn-icon btn-ghost btn-sm">‹</button>
              <input value={pdfPage} onChange={e => setPdfPage(parseInt(e.target.value) || 1)} />
              <span style={{ color: 'var(--ink-4)' }}>/ 52</span>
              <button className="btn btn-icon btn-ghost btn-sm">›</button>
            </div>
          </div>
          <div className="va-pdf-canvas scroll-fine">
            <div className="va-pdf-page">
              <span className="va-pdf-page-num">第 {pdfPage} 页</span>
              <h3>三、先进制程进展与产能爬坡</h3>
              <p>3.1 N+2 工艺良率改善路径</p>
              <p>
                <span className="va-pdf-highlight">公司 N+2 工艺自 2024Q4 投产以来，良率从 65% 稳步提升，2025Q2 已达 82%，达到可商用水平</span>。
                结合临港新厂逐步释放，我们预计 N+2 节点 2025 全年贡献收入约 18 亿美元，较 2024 年同比增长 142%。
              </p>
              <div className="va-pdf-fig">[ 图 3-1：N+2 良率与产能爬坡曲线 ]</div>
              <p>
                同时考虑设备到位节奏与下游客户验证周期，我们将 2026 年 N+2 收入指引上调至 32–36 亿美元区间，
                对应公司整体毛利率有望站上 24%。短期需密切跟踪光刻设备维护备件供应情况。
              </p>
              <p>3.2 12 吋整体产能展望</p>
              <p>
                截至 2025Q2，公司 12 吋等效月产能达到 78 万片，同比 +14%，主要由临港与北京 B3 厂带动。
                2025H2 计划继续投产约 3 万片月产能。
              </p>
            </div>
            <div className="va-pdf-page">
              <span className="va-pdf-page-num">第 {pdfPage + 1} 页</span>
              <h3>四、风险与情景分析</h3>
              <p>
                若美方将出口管制范围扩大至 28nm 节点的设备维护与备件，中芯国际先进产线的稳定运行可能面临压力。
                我们以悲观/中性/乐观三种情景测算……
              </p>
              <div className="va-pdf-fig">[ 表 4-1：三情景敏感度测算 ]</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

window.VariantA = VariantA;
