/* 数据可视化模块 — variant C 专用 */
const VC_CHARTS = window.INSIGHT_MOCK.charts;

function VCLineChart({ data }) {
  const W = 280, H = 140, PAD_L = 30, PAD_R = 12, PAD_T = 12, PAD_B = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const ys = data.points.map(p => p.y);
  const yMin = Math.floor(Math.min(...ys) / 10) * 10;
  const yMax = Math.ceil(Math.max(...ys) / 10) * 10;
  const xStep = innerW / (data.points.length - 1);
  const yScale = (v) => PAD_T + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const px = (i) => PAD_L + i * xStep;

  // split actual vs estimated
  const actualPts = data.points.filter(p => !p.est);
  const lastActualIdx = data.points.findIndex(p => p.est) - 1;
  const splitIdx = lastActualIdx >= 0 ? lastActualIdx : data.points.length - 1;
  const actualPath = data.points.slice(0, splitIdx + 1)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i)} ${yScale(p.y)}`).join(' ');
  const estPath = data.points.slice(splitIdx)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(splitIdx + i)} ${yScale(p.y)}`).join(' ');
  const areaPath = actualPath +
    ` L ${px(splitIdx)} ${PAD_T + innerH}` +
    ` L ${px(0)} ${PAD_T + innerH} Z`;

  const gridLines = [yMin, yMin + (yMax - yMin) / 2, yMax];

  return (
    <svg className="vc-line-svg" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id="vc-area-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#d97757" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#d97757" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridLines.map((g, i) => (
        <g key={i}>
          <line className="vc-line-grid" x1={PAD_L} x2={W - PAD_R} y1={yScale(g)} y2={yScale(g)} />
          <text className="vc-line-axis" x={PAD_L - 6} y={yScale(g) + 3} textAnchor="end">{g}</text>
        </g>
      ))}
      <path className="vc-line-area" d={areaPath} />
      <path className="vc-line-path" d={actualPath} />
      <path className="vc-line-est" d={estPath} />
      {data.points.map((p, i) => {
        const isPeak = p.y === Math.max(...ys);
        return (
          <g key={i}>
            <circle className={'vc-line-dot' + (isPeak ? ' peak' : '')}
              cx={px(i)} cy={yScale(p.y)} r="3.5"
              style={{ animationDelay: `${0.8 + i * 0.08}s` }} />
            {isPeak && (
              <text className="vc-line-label" x={px(i)} y={yScale(p.y) - 8} textAnchor="middle">{p.y}{data.unit}</text>
            )}
            <text className="vc-line-axis" x={px(i)} y={H - 6} textAnchor="middle">{p.x}</text>
          </g>
        );
      })}
    </svg>
  );
}

function VCBarChart({ data }) {
  const max = Math.max(...data.bars.map(b => b.value));
  const peakIdx = data.bars.findIndex(b => b.value === max);
  return (
    <div className="vc-bars">
      {data.bars.map((b, i) => {
        const h = (b.value / max) * 100;
        const cls = ['vc-bar-fill'];
        if (b.est) cls.push('est');
        else if (i === peakIdx) cls.push('peak');
        return (
          <div className="vc-bar-col" key={i}>
            <div className={cls.join(' ')}
                 style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}>
              <div className="vc-bar-val">{b.value}</div>
              <div className="vc-bar-label">{b.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VCDonut({ data }) {
  const R = 38, C = 2 * Math.PI * R;
  const total = data.segments.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  return (
    <div className="vc-donut">
      <svg className="vc-donut-svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--paper-3)" strokeWidth="14" />
        {data.segments.map((s, i) => {
          const len = (s.value / total) * C;
          const offset = -acc;
          acc += len;
          return (
            <circle key={i}
              cx="50" cy="50" r={R} fill="none"
              stroke={s.color} strokeWidth="14"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={offset}
              transform="rotate(-90 50 50)"
              style={{
                animation: `vc-fade-in .5s ease ${i * 0.15}s backwards`
              }} />
          );
        })}
        <text x="50" y="48" className="vc-donut-center-num">{data.segments[0].value}<tspan fontSize="10" fill="var(--ink-3)">%</tspan></text>
        <text x="50" y="62" className="vc-donut-center-label">主导</text>
      </svg>
      <div className="vc-donut-legend">
        {data.segments.map((s, i) => (
          <div className="vc-legend-row" key={i}>
            <div className="vc-legend-sw" style={{ background: s.color }} />
            <div className="vc-legend-label">{s.label}</div>
            <div className="vc-legend-val">{s.value}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VCCharts() {
  return (
    <section className="vc-charts">
      <div className="vc-chart">
        <div className="vc-chart-eyebrow">数据 · 01</div>
        <div className="vc-chart-title">
          <span>{VC_CHARTS.yieldCurve.title}</span>
          <span className="unit">良率 · %</span>
        </div>
        <VCLineChart data={VC_CHARTS.yieldCurve} />
        <div className="vc-chart-source">来源 · {VC_CHARTS.yieldCurve.source}</div>
      </div>
      <div className="vc-chart">
        <div className="vc-chart-eyebrow">数据 · 02</div>
        <div className="vc-chart-title">
          <span>{VC_CHARTS.capacity.title}</span>
        </div>
        <VCBarChart data={VC_CHARTS.capacity} />
        <div className="vc-chart-source">来源 · {VC_CHARTS.capacity.source}</div>
      </div>
      <div className="vc-chart">
        <div className="vc-chart-eyebrow">数据 · 03</div>
        <div className="vc-chart-title">
          <span>{VC_CHARTS.revenue.title}</span>
        </div>
        <VCDonut data={VC_CHARTS.revenue} />
        <div className="vc-chart-source">来源 · {VC_CHARTS.revenue.source}</div>
      </div>
    </section>
  );
}

window.VCCharts = VCCharts;
