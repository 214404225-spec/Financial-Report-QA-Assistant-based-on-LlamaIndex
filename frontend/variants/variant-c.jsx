/* 方案 C · 大胆版 · 杂志风（直通 DeepSeek 演示版 — 单一管线，零 toggle） */
const { useState, useRef, useEffect } = React;
const API = window.INSIGHT_API;
const MC = window.INSIGHT_MOCK;

function VariantC() {
  // 文档列表（左栏卡片）
  const [sources, setSources] = useState([]);

  // 右栏 PDF 状态
  const [pdfDoc, setPdfDoc] = useState('');
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfViewerZoom, setPdfViewerZoom] = useState(100);
  const [pdfSeq, setPdfSeq] = useState(0);
  const bumpPdfSeq = () => setPdfSeq(s => s + 1);
  const PDF_ZOOM_STEPS = [50, 75, 100, 125, 150, 200];
  const stepZoom = (delta) => {
    setPdfViewerZoom(z => {
      const idx = PDF_ZOOM_STEPS.indexOf(z);
      if (idx >= 0) {
        const next = idx + delta;
        if (next < 0) return PDF_ZOOM_STEPS[0];
        if (next >= PDF_ZOOM_STEPS.length) return PDF_ZOOM_STEPS[PDF_ZOOM_STEPS.length - 1];
        return PDF_ZOOM_STEPS[next];
      }
      return delta > 0
        ? (PDF_ZOOM_STEPS.find(v => v > z) ?? PDF_ZOOM_STEPS[PDF_ZOOM_STEPS.length - 1])
        : ([...PDF_ZOOM_STEPS].reverse().find(v => v < z) ?? PDF_ZOOM_STEPS[0]);
    });
    bumpPdfSeq();
  };

  // 高亮
  const [activeCite, setActiveCite] = useState(null);
  const [hoverCite, setHoverCite] = useState(null);

  // 对话
  const [dialog, setDialog] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const dialogRef = useRef(dialog);
  useEffect(() => { dialogRef.current = dialog; }, [dialog]);

  // 上传
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef(null);

  // 思考栏
  const [thinkActive, setThinkActive] = useState(-1);
  const [thinkExpanded, setThinkExpanded] = useState(true);
  const THINK_NODES = [
    { id: 'condense', label: '整理对话上下文', detail: '理解你的提问', icon: '◎' },
    { id: 'tool_execute', label: '阅读研报全文', detail: '把 PDF 内容载入上下文窗口', icon: '◉' },
    { id: 'generation', label: 'DeepSeek 流式生成', detail: '基于全文逐字回答', icon: '◆' },
  ];
  const NODE_TO_IDX = { condense: 0, tool_execute: 1, generation: 2 };

  // 布局
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [pdfWidth, setPdfWidth] = useState(560);
  const stageRef = useRef(null);
  const appRef = useRef(null);
  const composerRef = useRef(null);
  const dragRef = useRef(null);
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = pdfWidth;
    const appW = appRef.current?.getBoundingClientRect().width || 1400;
    document.body.classList.add('vc-resizing');
    dragRef.current?.classList.add('dragging');
    const onMove = (ev) => {
      const dx = startX - ev.clientX;
      const next = Math.max(360, Math.min(appW - 460, startW + dx));
      setPdfWidth(next);
    };
    const onUp = () => {
      document.body.classList.remove('vc-resizing');
      dragRef.current?.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ============ 上传 ============
  const onFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (!API || typeof API.uploadDemo !== 'function') {
      setUploadStatus('上传 API 不可用');
      return;
    }
    setUploading(true);
    setUploadStatus(`上传中… (${files.length} 份)`);
    try {
      const res = await API.uploadDemo(files, '常规 RAG 问答');
      const incoming = (res.sources || []).map((s, i) => ({
        org: '本地导入',
        date: new Date().toISOString().slice(0, 10),
        pages: 0,
        tag: s.is_new ? 'NEW' : '已就绪',
        indexed: true,
        ...s,
      }));
      if (incoming.length) setSources(incoming);

      const firstNew = (res.uploaded && res.uploaded[0]) || files[0]?.name;
      if (firstNew && /\.pdf$/i.test(firstNew)) {
        setPdfDoc(firstNew);
        setPdfPage(1);
        setPdfViewerZoom(100);
        bumpPdfSeq();
      }
      setUploadStatus(`✅ ${res.status || '已就绪'}`);
    } catch (err) {
      console.error(err);
      setUploadStatus(`上传失败: ${err.message || err}`);
    } finally {
      setUploading(false);
    }
  };

  // ============ 问答 ============
  const runStream = async () => {
    const userText = (composerRef.current?.value || '').trim();
    if (!userText) return;
    if (!sources.length) {
      setUploadStatus('⚠️ 请先上传 PDF 再提问');
      return;
    }
    composerRef.current.value = '';

    const prevDialog = dialogRef.current;
    // 同步把 user 消息和一个空 assistant 占位一起插入
    const userMsg = { role: 'user', text: userText };
    const placeholder = { role: 'assistant', text: '', citations: [], streaming: true };
    const initial = [...prevDialog, userMsg, placeholder];
    const placeholderIdx = initial.length - 1;
    setDialog(initial);

    setThinkActive(0);
    setThinkExpanded(true);

    const selectedSources = sources.filter(s => s.checked).map(s => s.title);
    let streaming = '';
    let finalReceived = false;

    try {
      console.log('[runStream] 发起请求', { history: prevDialog.length + 1, selectedSources });
      const iter = API.streamPassthrough({
        history: [...prevDialog, userMsg],
        memory: '',
        selected_sources: selectedSources,
      });

      for await (const ev of iter) {
        console.log('[SSE]', ev.type, typeof ev.data === 'string' ? ev.data : Object.keys(ev.data || {}));
        if (ev.type === 'node') {
          const idx = NODE_TO_IDX[ev.data.node];
          if (idx !== undefined) setThinkActive(idx);
        } else if (ev.type === 'delta') {
          streaming += ev.data.text || '';
          // 实时回填占位 — 每收一段都更新
          setDialog(d => {
            const next = [...d];
            if (next[placeholderIdx]) {
              next[placeholderIdx] = { ...next[placeholderIdx], text: streaming };
            }
            return next;
          });
        } else if (ev.type === 'final') {
          finalReceived = true;
          const finalText = ev.data.final_response || streaming || '（未收到回答）';
          const citations = ev.data.citations || [];
          console.log('[SSE final] len=', finalText.length, 'citations=', citations.length);
          setDialog(d => {
            const next = [...d];
            if (next[placeholderIdx]) {
              next[placeholderIdx] = {
                role: 'assistant',
                text: finalText,
                citations,
                streaming: false,
              };
            } else {
              next.push({ role: 'assistant', text: finalText, citations, streaming: false });
            }
            return next;
          });
          setFollowUps(ev.data.follow_ups || []);
          const firstCite = citations[0];
          if (firstCite?.source && /\.pdf$/i.test(firstCite.source)) {
            setPdfDoc(firstCite.source);
            setPdfPage(firstCite.page || 1);
            bumpPdfSeq();
          }
        } else if (ev.type === 'done') {
          setThinkActive(THINK_NODES.length);
          // 结束时把 streaming 标志关掉
          setDialog(d => {
            const next = [...d];
            if (next[placeholderIdx]) {
              next[placeholderIdx] = { ...next[placeholderIdx], streaming: false };
            }
            return next;
          });
        }
      }
      console.log('[runStream] 循环结束 finalReceived=', finalReceived, 'streaming.len=', streaming.length);
      if (!finalReceived) {
        setDialog(d => {
          const next = [...d];
          if (next[placeholderIdx]) {
            next[placeholderIdx] = {
              role: 'assistant',
              text: streaming || '（服务端未返回有效回答）',
              citations: [],
              streaming: false,
            };
          }
          return next;
        });
      }
    } catch (e) {
      console.error('[runStream]', e);
      setThinkActive(-1);
      setDialog(d => {
        const next = [...d];
        if (next[placeholderIdx]) {
          next[placeholderIdx] = {
            role: 'assistant',
            text: streaming + `\n\n[请求失败: ${e.message || e}]`,
            citations: [],
            streaming: false,
          };
        }
        return next;
      });
    }
  };

  const sendFollowUp = (q) => {
    if (composerRef.current) composerRef.current.value = q;
    void runStream();
  };

  // 自动滚到底部
  useEffect(() => {
    if (stageRef.current) stageRef.current.scrollTop = stageRef.current.scrollHeight;
  }, [dialog]);

  // 进入视口动画
  useEffect(() => {
    const els = document.querySelectorAll('.vc-reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
    }, { threshold: 0.15, root: stageRef.current });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const toggleSrc = (id) => setSources(prev => prev.map(s => s.id === id ? { ...s, checked: !s.checked } : s));

  const onCite = (msgIdx, citeId) => {
    const msg = dialog[msgIdx];
    const c = msg?.citations?.find(x => x.id === citeId);
    if (!c) return;
    setActiveCite(`${msgIdx}-${citeId}`);
    if (c.source && /\.pdf$/i.test(c.source)) {
      setPdfDoc(c.source);
      setPdfPage(c.page || 1);
      bumpPdfSeq();
    }
  };
  const onCiteHover = (msgIdx, citeId) => {
    if (citeId === null) { setHoverCite(null); return; }
    setHoverCite(`${msgIdx}-${citeId}`);
  };

  const renderText = (text, citations, msgIdx) => {
    if (!text) return null;
    if (!citations || !citations.length) {
      return <span dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />;
    }
    const parts = text.split(/(\[(?:P\.)?\d+\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[(?:P\.)?(\d+)\]$/);
      if (m) {
        const id = parseInt(m[1]);
        const key = `${msgIdx}-${id}`;
        const isActive = activeCite === key || hoverCite === key;
        return <sup key={i} className={'vc-cite-sup' + (isActive ? ' active' : '')}
          onMouseEnter={() => onCiteHover(msgIdx, id)}
          onMouseLeave={() => onCiteHover(null)}
          onClick={() => onCite(msgIdx, id)}>[{id}]</sup>;
      }
      return <span key={i} dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />;
    });
  };

  const checkedCount = sources.filter(s => s.checked).length;
  const activeKey = hoverCite || activeCite;
  const sysStatus = !API ? '⚠️ 纯 Mock 演示模式（API 不可用）' : '';

  return (
    <div className={'vc-app' + (sourcesCollapsed ? ' sources-collapsed' : '')}
      ref={appRef}
      style={{ '--vc-pdf-w': pdfWidth + 'px' }}>

      {sysStatus && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#ef4444', color: 'white', textAlign: 'center', padding: '4px',
          fontSize: '12px', fontWeight: 'bold'
        }}>
          {sysStatus}
        </div>
      )}

      {/* 极窄左侧栏 */}
      <nav className="vc-rail">
        <div className="vc-rail-logo">I</div>
        <button className="vc-rail-btn active" title="工作区">⌂</button>
        <div className="vc-rail-spacer" />
        <button className="vc-rail-collapse" title={sourcesCollapsed ? '展开来源栏' : '折叠来源栏'}
          onClick={() => setSourcesCollapsed(v => !v)}>
          {sourcesCollapsed ? '›' : '‹'}
        </button>
      </nav>

      {/* 来源 */}
      <aside className="vc-sources" data-screen-label="left-sources">
        <div className="vc-sources-head">
          <div className="vc-sources-eyebrow">Insight · 直通 DeepSeek</div>
          <h2 className="vc-sources-title">研报工作区</h2>
          <div className="vc-sources-stats">
            {sources.length === 0
              ? <span>暂无文档，点击下方按钮上传 PDF</span>
              : <><b>{checkedCount}</b> / {sources.length} 篇研报已激活</>}
          </div>
          <div className="vc-upload-row" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={fileInputRef} type="file" accept="application/pdf" multiple
              style={{ display: 'none' }} onChange={onFileSelect} />
            <button type="button"
              className="vc-engine-tab"
              disabled={uploading || !API}
              onClick={() => fileInputRef.current?.click()}
              style={{ cursor: uploading ? 'wait' : 'pointer' }}>
              {uploading ? '处理中…' : '+ 导入 PDF'}
            </button>
            {uploadStatus && (
              <span style={{ fontSize: 12, color: 'var(--ink-3)', flexBasis: '100%' }}>{uploadStatus}</span>
            )}
          </div>
        </div>
        <div className="vc-sources-list scroll-fine">
          {sources.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>这里会显示你上传的研报。</p>
              <p style={{ marginTop: 8 }}>上传后即可在右侧预览原文，并在中间区域直接向 DeepSeek 提问。</p>
            </div>
          ) : sources.map((s, i) => (
            <div key={s.id} className={'vc-source' + (s.checked ? ' checked' : '')} onClick={() => toggleSrc(s.id)}>
              <div className="vc-source-num">{String(i + 1).padStart(2, '0')}</div>
              <div className="vc-source-title">{s.title}</div>
              <div className="vc-source-meta">
                <span>{s.org}</span>
                <span>{s.date}</span>
              </div>
              <div className="vc-source-tags">
                <span className="tag" style={s.is_new ? { color: 'var(--accent-deep)', fontWeight: 600 } : undefined}>{s.tag}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* 中央舞台 */}
      <main className="vc-stage" data-screen-label="center-stage">
        <div className="vc-engine-strip">
          <span className="label">引擎</span>
          <div className="vc-engine-tabs">
            <button className="vc-engine-tab active">直通 DeepSeek</button>
          </div>
          <div style={{ flex: 1 }} />
          <span className="label" style={{ color: 'var(--ink-4)' }}>PDF 全文 → DeepSeek 流式</span>
        </div>

        <div className="vc-stage-scroll scroll-fine" ref={stageRef}>
          {/* 空态欢迎页 */}
          {dialog.length === 0 && (
            <section className="vc-cover vc-reveal">
              <div className="vc-cover-row1">
                <div className="left">
                  <strong>WELCOME</strong>
                  <span>{sources.length} 篇文档已加载</span>
                </div>
              </div>
              <h1>{sources.length === 0 ? '上传 PDF 即可开始问答' : '在下方输入你的问题'}</h1>
              <p className="vc-cover-deck">
                <span className="lead-cap">
                  {sources.length === 0
                    ? '本系统会把上传的 PDF 全文直送 DeepSeek，由模型基于完整原文流式作答；右侧会同步预览原文，便于对照。'
                    : '已加载文档：' + sources.map(s => s.title).join('、') + '。提问示例：「这份研报的核心结论是什么？」「公司的主要风险有哪些？」'}
                </span>
              </p>
            </section>
          )}

          {/* 对话 */}
          {dialog.length > 0 && (
            <section className="vc-thread vc-reveal">
              {(() => {
                const turns = [];
                for (let i = 0; i < dialog.length; i += 2) {
                  turns.push([dialog[i], dialog[i + 1]]);
                }
                const lastIdx = turns.length - 1;
                return turns.map(([q, a], ti) => (
                  <div className="vc-turn" key={ti}>
                    <div className="vc-turn-q">
                      <div className="vc-q-mark">Q.</div>
                      <div className="vc-q-text">{q?.text}</div>
                    </div>
                    {/* 即使 a 还没出现，也展示思考栏 */}
                    {(a || ti === lastIdx) && (
                      <div className="vc-turn-a">
                        <div className="vc-a-meta">
                          <div className="pill">A</div><br />
                          DeepSeek
                        </div>
                        <div>
                          {ti === lastIdx && thinkActive >= 0 && (
                            <VCThinkingBar nodes={THINK_NODES}
                              activeIdx={thinkActive}
                              expanded={thinkExpanded}
                              onToggle={() => setThinkExpanded(v => !v)} />
                          )}
                          {a ? (
                            <>
                              <div className="vc-a-body">
                                {renderText(a.text, a.citations, ti * 2 + 1)}
                              </div>
                              {a.citations && a.citations.length > 0 && (
                                <div className="vc-footnotes">
                                  {a.citations.map(c => (
                                    <div key={c.id} className="vc-footnote"
                                      onMouseEnter={() => onCiteHover(ti * 2 + 1, c.id)}
                                      onMouseLeave={() => onCiteHover(null)}
                                      onClick={() => onCite(ti * 2 + 1, c.id)}>
                                      <span className="vc-fn-num">[{c.id}]</span>
                                      <span>
                                        <span className="vc-fn-source">{c.source}</span>
                                        <span className="vc-fn-page">P.{c.page}</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {ti === lastIdx && followUps.length > 0 && (
                                <div className="vc-followups">
                                  <div className="vc-followups-eyebrow">猜你想问 · follow-ups</div>
                                  <div className="vc-followups-list">
                                    {followUps.map((q, i) => (
                                      <button key={i} type="button" className="vc-followup-chip"
                                        onClick={() => sendFollowUp(q)}>
                                        <span className="vc-followup-arrow">↗</span>
                                        <span>{q}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="vc-a-body" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>
                              正在生成…
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ));
              })()}
            </section>
          )}
        </div>

        <div className="vc-composer">
          <div className="vc-composer-shell">
            <div className="vc-composer-prefix">Q.</div>
            <textarea ref={composerRef} className="vc-composer-input" rows={1}
              placeholder={sources.length === 0 ? '请先上传 PDF 文档……' : '提出您的下一个分析诉求……'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void runStream();
                }
              }} />
            <button type="button" className="vc-send" onClick={() => void runStream()}>
              {thinkActive >= 0 && thinkActive < THINK_NODES.length ? '生成中…' : '询问'}
            </button>
          </div>
          <div className="vc-composer-hint">
            <span style={{ flex: 1 }} />
            <span>{checkedCount} 篇文档参与上下文 · DeepSeek 128K</span>
          </div>
        </div>
      </main>

      {/* 右栏 PDF dossier */}
      <aside className="vc-pdf" data-screen-label="right-pdf" style={{ position: 'relative' }}>
        <div className="vc-splitter" ref={dragRef} onMouseDown={startResize} title="拖拽调整宽度" />
        <div className="vc-pdf-head">
          <div className="vc-pdf-eyebrow">原文追溯{activeCite ? ` · 引用 [${activeCite.split('-')[1]}]` : ''}</div>
          <div className="vc-pdf-title">{pdfDoc || '尚未选择文档'}</div>
          <div className="vc-pdf-meta">
            <span style={{ color: 'var(--accent-deep)', fontFamily: 'var(--font-mono)' }}>P.{pdfPage}</span>
          </div>
        </div>
        <div className="vc-pdf-toolbar">
          <span>缩放</span>
          <button className="btn btn-icon btn-ghost btn-sm" onClick={() => stepZoom(-1)} title="缩小">−</button>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{pdfViewerZoom}%</span>
          <button className="btn btn-icon btn-ghost btn-sm" onClick={() => stepZoom(+1)} title="放大">+</button>
          <button className="btn btn-icon btn-ghost btn-sm" onClick={() => { setPdfViewerZoom(100); bumpPdfSeq(); }} title="重置">⟲</button>
          <div className="vc-pdf-pager">
            <button className="btn btn-icon btn-ghost btn-sm"
              onClick={() => { setPdfPage(p => Math.max(1, (parseInt(p) || 1) - 1)); bumpPdfSeq(); }} title="上一页">‹</button>
            <input value={pdfPage}
              onChange={e => setPdfPage(e.target.value)}
              onBlur={e => { setPdfPage(Math.max(1, parseInt(e.target.value) || 1)); bumpPdfSeq(); }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            <span>/—</span>
            <button className="btn btn-icon btn-ghost btn-sm"
              onClick={() => { setPdfPage(p => (parseInt(p) || 1) + 1); bumpPdfSeq(); }} title="下一页">›</button>
          </div>
        </div>
        <div className="vc-pdf-canvas scroll-fine">
          {API && typeof API.pdfUrl === 'function' && pdfDoc && /\.pdf$/i.test(pdfDoc) ? (
            (() => {
              const base = API.pdfUrl(pdfDoc, pdfPage, pdfViewerZoom);
              const [q, hash = ''] = base.split('#');
              const sep = q.includes('?') ? '&' : '?';
              const finalSrc = `${q}${sep}_t=${pdfSeq}` + (hash ? `#${hash}` : '');
              return (
                <iframe
                  key={`pdf-${pdfSeq}-${pdfDoc}`}
                  src={finalSrc}
                  title={pdfDoc}
                  style={{ width: '100%', height: '100%', minHeight: '600px', border: 0, background: '#fff' }}
                />
              );
            })()
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 600, color: 'var(--ink-3)', fontStyle: 'italic', flexDirection: 'column', gap: 8, padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 32 }}>📄</div>
              <div>上传 PDF 后会在此处显示</div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function VCThinkingBar({ nodes, activeIdx, expanded, onToggle }) {
  const total = nodes.length;
  const done = activeIdx >= total;
  const progress = Math.min(activeIdx + 1, total) / total;
  return (
    <div className={'vc-think' + (done ? ' done' : '') + (expanded ? '' : ' collapsed')}>
      <div className="vc-think-head" onClick={onToggle}>
        <div className="vc-think-spinner" data-done={done ? '1' : '0'} />
        <div className="vc-think-title">
          {done ? '思考链路 · 已完成' : 'DeepSeek 思考中 · ' + (nodes[activeIdx]?.label || '启动中…')}
        </div>
        <div className="vc-think-stepcount">
          {done ? total : Math.min(activeIdx + 1, total)} / {total}
        </div>
        <div className="vc-think-toggle">{expanded ? '⌃' : '⌄'}</div>
      </div>
      <div className="vc-think-progress"><div style={{ width: (progress * 100) + '%' }} /></div>
      {expanded && (
        <ol className="vc-think-list">
          {nodes.map((n, i) => {
            const state = i < activeIdx ? 'done' : i === activeIdx ? (done ? 'done' : 'running') : 'pending';
            return (
              <li key={n.id} className={'vc-think-node ' + state}>
                <div className="vc-think-glyph">
                  {state === 'done' ? '✓' : n.icon}
                </div>
                <div className="vc-think-body">
                  <div className="vc-think-label">
                    <code className="vc-think-id">{n.id}</code>
                    <span>{n.label}</span>
                  </div>
                  <div className="vc-think-detail">{n.detail}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

window.VariantC = VariantC;
