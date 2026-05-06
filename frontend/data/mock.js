// 金融研报 mock 数据 — 共享给三个方案
window.INSIGHT_MOCK = (() => {
  const sources = [
    {
      id: 's1',
      title: '半导体行业 2025 中期策略：周期回暖与 AI 算力共振',
      org: '中信证券',
      date: '2025·06·12',
      pages: 38,
      tag: '行业',
      checked: true,
      indexed: true,
    },
    {
      id: 's2',
      title: '中芯国际 (688981) 深度：先进制程产能爬坡兑现',
      org: '华泰证券',
      date: '2025·07·03',
      pages: 52,
      tag: '公司',
      checked: true,
      indexed: true,
    },
    {
      id: 's3',
      title: '北方华创 (002371) Q2 跟踪：设备国产化加速',
      org: '中金公司',
      date: '2025·07·18',
      pages: 24,
      tag: '公司',
      checked: true,
      indexed: true,
    },
    {
      id: 's4',
      title: '存储芯片价格周期与 HBM 供需测算',
      org: '招商证券',
      date: '2025·07·22',
      pages: 41,
      tag: '专题',
      checked: false,
      indexed: true,
    },
    {
      id: 's5',
      title: '消费电子复苏路径与零部件机遇',
      org: '海通国际',
      date: '2025·05·30',
      pages: 33,
      tag: '行业',
      checked: false,
      indexed: true,
    },
    {
      id: 's6',
      title: '寒武纪 (688256) 业绩预告点评',
      org: '国信证券',
      date: '2025·07·25',
      pages: 12,
      tag: '点评',
      checked: false,
      indexed: false,
    },
  ];

  const summary =
    '近三个月覆盖的 6 篇研报围绕「AI 算力 + 半导体国产化」两条主线展开。' +
    '行业层面，库存周期已基本出清，2025H2 价格弹性主要来自 HBM 与存储；' +
    '公司层面，中芯国际 N+2 工艺良率突破推动毛利率回升，北方华创订单可见度延伸至 2026Q1。' +
    '风险点集中在地缘政策与下游消费需求复苏不及预期。';

  const recommended = [
    'HBM 需求测算与供给瓶颈在哪一环节？',
    '中芯国际先进制程毛利拐点的关键假设？',
    '设备国产化率从 2024 到 2026 的演进路径？',
    '存储芯片本轮涨价能持续几个季度？',
    '消费电子复苏对零部件订单的传导节奏？',
    '若美国进一步收紧出口管制，最受影响的标的？',
  ];

  const dialog = [
    {
      role: 'user',
      text: '帮我对比一下中芯国际和北方华创近期的核心增长驱动，重点说毛利率的差异。',
    },
    {
      role: 'assistant',
      text:
        '两家公司虽同处半导体国产化主线，但驱动逻辑差异明显：\n\n' +
        '**中芯国际** 的核心驱动是 N+2 制程良率从 2024Q4 的 65% 提升至 2025Q2 的 82%[1]，' +
        '叠加 12 吋月产能增至 78 万片[2]，预计 2025 全年综合毛利率回升至 22.4%，环比改善约 5.8pct。\n\n' +
        '**北方华创** 的驱动来自设备出货结构升级：刻蚀与薄膜设备占比从 2024 年的 58% 提升至 2025H1 的 71%[3]，' +
        '高端设备 ASP 同比 +18%。但因研发与人员扩张，毛利率仅微升至 43.1%。\n\n' +
        '一句话：**中芯靠产能爬坡 × 良率提升的非线性兑现，北方华创靠产品结构 × 国产替代深度。**',
      citations: [
        { id: 1, source: '中芯国际 (688981) 深度', page: 14, snippet: '公司 N+2 工艺自 2024Q4 投产以来，良率从 65% 稳步提升，2025Q2 已达 82%，达到可商用水平。' },
        { id: 2, source: '中芯国际 (688981) 深度', page: 22, snippet: '截至 2025Q2，公司 12 吋等效月产能达到 78 万片，同比 +14%，主要由临港与北京 B3 厂带动。' },
        { id: 3, source: '北方华创 (002371) Q2 跟踪', page: 8, snippet: '2025H1 公司刻蚀及薄膜沉积设备收入占比达 71%，较 2024 年 58% 提升 13pct。' },
      ],
    },
    {
      role: 'user',
      text: '那如果出口管制再收紧，这两家受影响的程度？',
    },
    {
      role: 'assistant',
      streaming: true,
      text:
        '从供应链暴露度看：\n\n' +
        '**中芯国际** 在 EUV 光刻、部分高端零部件上仍依赖海外供应商，若管制升级至 28nm 以下设备维护，对其先进制程扩产节奏冲击较大[1]。\n\n' +
        '**北方华创** 反而是受益方——下游晶圆厂会加速国产替代采购，但其自身关键零部件（射频电源、',
      citations: [
        { id: 1, source: '半导体行业 2025 中期策略', page: 19, snippet: '若美方将出口管制范围扩大至 28nm 节点的设备维护与备件，中芯国际先进产线的稳定运行可能面临压力。' },
      ],
    },
  ];

  const matrix = {
    dimensions: ['核心驱动', '2025 毛利率', '产能/订单', '主要风险', '估值（PE 25E）'],
    rows: [
      {
        doc: '中芯国际 (688981)',
        cells: [
          'N+2 良率突破 + 产能扩张',
          '22.4%（+5.8pct）',
          '12 吋月产能 78 万片',
          '出口管制升级',
          '38×',
        ],
      },
      {
        doc: '北方华创 (002371)',
        cells: [
          '设备国产化 + 高端化',
          '43.1%（+0.9pct）',
          '在手订单覆盖至 2026Q1',
          '客户集中度风险',
          '32×',
        ],
      },
      {
        doc: '半导体行业 (策略)',
        cells: [
          'AI 算力 + 周期回暖',
          '行业均值 18.6%',
          'HBM 紧供需延续',
          '消费复苏不及预期',
          '—',
        ],
      },
    ],
  };

  const charts = {
    yieldCurve: {
      title: 'N+2 制程良率爬坡',
      unit: '%',
      source: '中芯国际 (688981) 深度 · P.14',
      points: [
        { x: '24Q1', y: 48 },
        { x: '24Q2', y: 55 },
        { x: '24Q3', y: 60 },
        { x: '24Q4', y: 65 },
        { x: '25Q1', y: 74 },
        { x: '25Q2', y: 82 },
        { x: '25Q3E', y: 86, est: true },
        { x: '25Q4E', y: 89, est: true },
      ],
    },
    capacity: {
      title: '12 吋月产能 · 万片',
      source: '中芯国际 (688981) 深度 · P.22',
      bars: [
        { label: '24Q2', value: 68 },
        { label: '24Q4', value: 72 },
        { label: '25Q1', value: 75 },
        { label: '25Q2', value: 78 },
        { label: '25Q4E', value: 81, est: true },
      ],
    },
    revenue: {
      title: '北方华创 · 设备结构占比',
      source: '北方华创 (002371) Q2 跟踪 · P.8',
      segments: [
        { label: '刻蚀', value: 38, color: '#d97757' },
        { label: '薄膜沉积', value: 33, color: '#c25e3e' },
        { label: '清洗', value: 16, color: '#e8a888' },
        { label: '其他', value: 13, color: '#c8c2b3' },
      ],
    },
  };

  const pinned = [
    {
      time: '今天 14:32',
      title: '中芯 vs 北方华创 增长驱动差异',
      text: '中芯靠产能爬坡 × 良率提升的非线性兑现；北方华创靠产品结构 × 国产替代深度。',
    },
    {
      time: '昨天 19:08',
      title: 'HBM 供需缺口',
      text: 'HBM3e 在 2025H2 仍有约 12% 的供给缺口，主要受制于 SK 海力士 TSV 产能。',
    },
  ];

  // LangGraph 节点流转规范（与 src/generation/graph.py 节点顺序一致，含 condense）
  const langgraphNodes = [
    { id: 'condense', label: '正在消解对话上下文…', detail: '压缩多轮对话为检索友好查询', icon: '◎' },
    { id: 'router', label: '意图判定完毕', detail: '识别为「跨标的财务对比 + 数据检索」复合任务', icon: '◇' },
    { id: 'tool_extract', label: '已确定所需工具及参数', detail: 'rag_search(top_k=8) + finance_api(quote=688981.SH)', icon: '◈' },
    { id: 'hitl', label: '参数缺失，等待用户澄清', detail: '可选：是否锁定 2025H1 时间窗口？', icon: '?', skippable: true },
    { id: 'tool_execute', label: '研报检索或外部API调用完毕', detail: '命中 11 个片段 · 行情数据已就绪', icon: '◉' },
    { id: 'generation', label: '最终结果生成完毕', detail: '附 3 条引用 + 4 个建议追问', icon: '◆' },
  ];

  // 猜你想问 — Phase 2+ follow_ups
  const followUps = [
    '若美方扩大出口管制至 28nm，对中芯收入影响多大？',
    '北方华创 2026 年订单能见度如何？',
    'HBM3e 国产替代的最快窗口期？',
    '三标的中谁的现金流安全边际更高？',
  ];

  return { sources, summary, recommended, dialog, matrix, charts, pinned, langgraphNodes, followUps };
})();
