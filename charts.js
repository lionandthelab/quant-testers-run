'use strict';

/**
 * Steward Quant SaaS — High-DPI Institutional Charting Engine
 * - Equity Curve vs S&P 500 + Principal Step Line + Regime Bands + Crosshair Scrubber
 * - Underwater Drawdown Chart vs S&P 500 + Monthly Survival Floor
 * - Architectural Stacked Horizontal Allocation Bar (replaces cliché donut ring)
 */
(function initQuantCharts(root) {
  function setupHiDpiCanvas(canvas) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = Math.max(260, Math.floor(rect.width));
    const height = Math.max(130, Math.floor(rect.height));
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function getThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      grid: isDark ? 'rgba(238, 236, 230, 0.09)' : 'rgba(34, 31, 26, 0.09)',
      axisText: isDark ? '#9a968e' : '#6e6a61',
      sotaLine: isDark ? '#59c298' : '#1b6b4f',
      sotaGlowTop: isDark ? 'rgba(89, 194, 152, 0.16)' : 'rgba(27, 107, 79, 0.14)',
      sotaGlowBot: isDark ? 'rgba(89, 194, 152, 0.0)' : 'rgba(27, 107, 79, 0.0)',
      spyLine: isDark ? '#8c8880' : '#7b766c',
      principalLine: isDark ? 'rgba(196, 157, 88, 0.55)' : 'rgba(143, 103, 36, 0.52)',
      crosshair: isDark ? 'rgba(238, 236, 230, 0.26)' : 'rgba(34, 31, 26, 0.24)',
      calmTint: isDark ? 'rgba(89, 194, 152, 0.03)' : 'rgba(27, 107, 79, 0.03)',
      shieldTint: isDark ? 'rgba(196, 157, 88, 0.04)' : 'rgba(168, 118, 38, 0.045)',
      ddSotaFill: isDark ? 'rgba(89, 194, 152, 0.15)' : 'rgba(27, 107, 79, 0.13)',
      ddSpyLine: isDark ? 'rgba(218, 106, 88, 0.72)' : 'rgba(176, 58, 42, 0.68)',
      stopLine: isDark ? 'rgba(218, 106, 88, 0.30)' : 'rgba(176, 58, 42, 0.26)',
    };
  }

  function renderEquityChart(canvas, tooltipEl, series, options = {}) {
    if (!canvas || !Array.isArray(series) || series.length < 2) return;
    const { formatMoney = (v) => v.toLocaleString(), showPrincipal = false, onHoverPoint = null } = options;
    const colors = getThemeColors();
    const { ctx, width, height } = setupHiDpiCanvas(canvas);

    const pad = { top: 14, right: 14, bottom: 26, left: 58 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    let minY = Infinity;
    let maxY = -Infinity;
    for (const pt of series) {
      minY = Math.min(minY, pt.sotaKrw, pt.spyKrw, showPrincipal ? pt.principalKrw : pt.sotaKrw);
      maxY = Math.max(maxY, pt.sotaKrw, pt.spyKrw, showPrincipal ? pt.principalKrw : pt.sotaKrw);
    }
    const rangeY = Math.max(1, maxY - minY);
    minY = Math.max(0, minY - rangeY * 0.06);
    maxY = maxY + rangeY * 0.06;

    const xOf = (i) => pad.left + (i / (series.length - 1)) * plotW;
    const yOf = (val) => pad.top + (1 - (val - minY) / (maxY - minY)) * plotH;

    function drawBase(hoverIdx = -1) {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < series.length - 1; i += 1) {
        const reg = series[i].regime;
        if (reg === 'CALM_BULL_2X' || reg === 'SAFE_HAVEN_SHIELD') {
          ctx.fillStyle = reg === 'CALM_BULL_2X' ? colors.calmTint : colors.shieldTint;
          const x0 = xOf(i);
          const x1 = xOf(i + 1);
          ctx.fillRect(x0, pad.top, Math.max(1, x1 - x0 + 0.5), plotH);
        }
      }

      ctx.font = '500 10.5px "IBM Plex Mono", monospace';
      ctx.fillStyle = colors.axisText;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let g = 0; g <= 4; g += 1) {
        const val = minY + ((maxY - minY) * g) / 4;
        const y = yOf(val);
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
        ctx.fillText(options.compactAxis ? options.compactAxis(val) : formatMoney(val), pad.left - 8, y);
      }

      ctx.textBaseline = 'top';
      const stepCount = 4;
      for (let k = 0; k <= stepCount; k += 1) {
        const idx = Math.round(((series.length - 1) * k) / stepCount);
        const x = xOf(idx);
        ctx.textAlign = k === 0 ? 'left' : (k === stepCount ? 'right' : 'center');
        ctx.fillText(series[idx].d.slice(0, 7), x, height - pad.bottom + 8);
      }

      if (showPrincipal) {
        ctx.save();
        ctx.strokeStyle = colors.principalLine;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        series.forEach((pt, i) => {
          const x = xOf(i);
          const y = yOf(pt.principalKrw);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = colors.spyLine;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      series.forEach((pt, i) => {
        const x = xOf(i);
        const y = yOf(pt.spyKrw);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();

      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      grad.addColorStop(0, colors.sotaGlowTop);
      grad.addColorStop(1, colors.sotaGlowBot);
      ctx.beginPath();
      series.forEach((pt, i) => {
        const x = xOf(i);
        const y = yOf(pt.sotaKrw);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(xOf(series.length - 1), pad.top + plotH);
      ctx.lineTo(xOf(0), pad.top + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = colors.sotaLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.forEach((pt, i) => {
        const x = xOf(i);
        const y = yOf(pt.sotaKrw);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (hoverIdx >= 0 && hoverIdx < series.length) {
        const pt = series[hoverIdx];
        const hx = xOf(hoverIdx);
        const hySota = yOf(pt.sotaKrw);
        const hySpy = yOf(pt.spyKrw);

        ctx.strokeStyle = colors.crosshair;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, pad.top);
        ctx.lineTo(hx, pad.top + plotH);
        ctx.stroke();

        ctx.fillStyle = colors.spyLine;
        ctx.beginPath();
        ctx.arc(hx, hySpy, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = colors.sotaLine;
        ctx.beginPath();
        ctx.arc(hx, hySota, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawBase(-1);

    const handlePointer = (clientX) => {
      const rect = canvas.getBoundingClientRect();
      const relX = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, (relX - pad.left) / Math.max(1, plotW)));
      const idx = Math.round(ratio * (series.length - 1));
      const pt = series[idx];
      drawBase(idx);
      if (onHoverPoint) onHoverPoint(pt);

      if (tooltipEl && pt) {
        const alphaPct = (pt.sotaTwrPct - pt.spyTwrPct).toFixed(2);
        const regName = pt.regime === 'CALM_BULL_2X'
          ? '저변동 강세 (2x)'
          : (pt.regime === 'SAFE_HAVEN_SHIELD' ? '안전자산 피난' : '일반 강세 (1x)');
        tooltipEl.innerHTML = [
          `<div style="font-weight:700;margin-bottom:4px">${pt.d} (${regName})</div>`,
          `<div style="display:flex;justify-content:space-between;gap:12px"><span>Steward</span><strong class="mono">${formatMoney(pt.sotaKrw)} (${pt.sotaTwrPct >= 0 ? '+' : ''}${pt.sotaTwrPct}%)</strong></div>`,
          `<div style="display:flex;justify-content:space-between;gap:12px;color:var(--text-muted)"><span>S&amp;P 500</span><span class="mono">${formatMoney(pt.spyKrw)} (${pt.spyTwrPct >= 0 ? '+' : ''}${pt.spyTwrPct}%)</span></div>`,
          `<div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--border);display:flex;justify-content:space-between"><span>초과 수익</span><strong class="${Number(alphaPct) >= 0 ? 'pos' : 'neg'} mono">${Number(alphaPct) >= 0 ? '+' : ''}${alphaPct}%p</strong></div>`,
        ].join('');
        tooltipEl.style.display = 'block';
        const leftPos = Math.min(width - 208, Math.max(12, xOf(idx) - 96));
        tooltipEl.style.left = `${leftPos}px`;
        tooltipEl.style.top = '12px';
      }
    };

    canvas.onmousemove = (e) => handlePointer(e.clientX);
    canvas.ontouchmove = (e) => {
      if (e.touches?.[0]) handlePointer(e.touches[0].clientX);
    };
    canvas.onmouseleave = () => {
      drawBase(-1);
      if (tooltipEl) tooltipEl.style.display = 'none';
      if (onHoverPoint) onHoverPoint(null);
    };
  }

  function renderUnderwaterChart(canvas, series) {
    if (!canvas || !Array.isArray(series) || series.length < 2) return;
    const colors = getThemeColors();
    const { ctx, width, height } = setupHiDpiCanvas(canvas);
    const pad = { top: 10, right: 14, bottom: 22, left: 58 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    let minDd = -22;
    for (const pt of series) {
      minDd = Math.min(minDd, pt.sotaDdPct - 2, pt.spyDdPct - 2);
    }
    const xOf = (i) => pad.left + (i / (series.length - 1)) * plotW;
    const yOf = (dd) => pad.top + ((0 - dd) / (0 - minDd)) * plotH;

    ctx.clearRect(0, 0, width, height);
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = colors.axisText;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const lvl of [0, -5, -10, -15, -20]) {
      if (lvl < minDd) continue;
      const y = yOf(lvl);
      ctx.strokeStyle = lvl === -5 ? colors.stopLine : colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillText(`${lvl}%`, pad.left - 8, y);
    }

    ctx.strokeStyle = colors.ddSpyLine;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    series.forEach((pt, i) => {
      const x = xOf(i);
      const y = yOf(pt.spyDdPct);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(0));
    series.forEach((pt, i) => ctx.lineTo(xOf(i), yOf(pt.sotaDdPct)));
    ctx.lineTo(xOf(series.length - 1), yOf(0));
    ctx.closePath();
    ctx.fillStyle = colors.ddSotaFill;
    ctx.fill();

    ctx.strokeStyle = colors.sotaLine;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    series.forEach((pt, i) => {
      const x = xOf(i);
      const y = yOf(pt.sotaDdPct);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function renderAllocationDonut(containerEl, items = [], centerTop = '', centerBottom = '') {
    if (!containerEl) return;
    const total = items.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);
    const segments = total > 0
      ? items.map((it) => {
          const val = Math.max(0, Number(it.value) || 0);
          const grow = Math.max(0, Math.round((val / total) * 1000));
          return grow > 0
            ? `<div style="flex-grow:${grow};background:${it.color};min-width:2px"></div>`
            : '';
        }).join('')
      : `<div style="flex-grow:1;background:var(--border)"></div>`;

    containerEl.innerHTML = `
      <div style="width:100%">
        <div class="alloc-bar-head">
          <span>${centerTop}</span>
          <strong class="mono" style="color:var(--text)">${centerBottom}</strong>
        </div>
        <div class="alloc-bar-stack" role="img" aria-label="${centerTop} 비중 막대">${segments}</div>
      </div>
    `;
  }

  root.StewardQuantCharts = {
    renderEquityChart,
    renderUnderwaterChart,
    renderAllocationDonut,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
