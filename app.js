'use strict';

/**
 * STEWARD QUANT (quant.testers.run) — Commercial Multi-Asset SaaS Controller
 */
(function initStewardQuantApp() {
  const Engine = window.StewardQuantEngine;
  const Charts = window.StewardQuantCharts;
  const Cloud = window.StewardCloudSync;

  const VIEW_TITLES = {
    overview: '통합 자산 홈',
    portfolio: '내 자산 및 리밸런서',
    signals: '시그널 및 131팩터 레이더',
    lab: '적립식 백테스트 연구소',
    connect: '클라우드 및 실계좌 검증',
  };

  const BOOK_META = {
    KR_STOCK: { label: '국내주식 · KRX', icon: '[KRX]', swatch: 'swatch-kr', cls: 'book-kr', color: 'var(--kr-color)' },
    US_STOCK: { label: '미국주식 · US', icon: '[US]', swatch: 'swatch-us', cls: 'book-us', color: 'var(--us-color)' },
    CRYPTO: { label: '디지털자산 · Crypto', icon: '[CRYPTO]', swatch: 'swatch-cr', cls: 'book-cr', color: 'var(--cr-color)' },
  };

  const FAMILY_LABELS = {
    trend: '추세 (Trend)',
    momentum: '모멘텀 (TSM)',
    oscillator: '눌림목/과열',
    volatility: '변동성 안정성',
    liquidity: '유동성/수급',
    equity_flow: '기관/외인 수급',
    crypto_derivs: '크립토 미시구조',
    macro: '글로벌 매크로',
    evolved: '자기진화 DSL',
    semantic: 'AI 뉴스/공시',
  };

  let appState = Cloud.loadLocalState();
  let currentView = 'overview';
  let liveFeed = null;
  let currentUser = null;
  let cloudSyncTimer = null;

  let signalFilterBook = 'ALL';
  let signalOnlyEligible = false;
  let signalSearch = '';
  let signalSortKey = 'rankScore';
  let signalSortDir = -1;

  let labState = {
    initialKrw: 10000000,
    monthlyDcaKrw: 500000,
    wKr: 43,
    wUs: 32,
    wCr: 25,
    volManaged: true,
    safeHavenShield: true,
    cashParkSweep: true,
    extraFeeBps: 0,
  };

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const wrap = document.getElementById('toastContainer');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s';
      setTimeout(() => el.remove(), 260);
    }, 2800);
  }

  function getActiveWorkspace() {
    let ws = appState.workspaces.find((w) => w.id === appState.activeWorkspaceId);
    if (!ws) {
      ws = appState.workspaces[0];
      appState.activeWorkspaceId = ws.id;
    }
    return ws;
  }

  function fxRate() {
    return Number(liveFeed?.fxRateUsdKrw) > 0 ? Number(liveFeed.fxRateUsdKrw) : 1345;
  }

  function fmtMoneyFromKrw(krwVal, compact = false) {
    const n = Number(krwVal) || 0;
    if (appState.currencyMode === 'USD') {
      const usd = n / fxRate();
      if (compact && Math.abs(usd) >= 1000) return `$${(usd / 1000).toFixed(1)}k`;
      return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (compact) {
      if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(2)}억`;
      if (Math.abs(n) >= 10000) return `${Math.round(n / 10000).toLocaleString()}만`;
    }
    return `₩${Math.round(n).toLocaleString('ko-KR')}`;
  }

  function fmtNative(val, currency = 'KRW') {
    const n = Number(val) || 0;
    if (currency === 'USD') {
      return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${Math.round(n).toLocaleString('ko-KR')}원`;
  }

  function persistAndScheduleSync() {
    Cloud.saveLocalState(appState);
    renderShellChrome();
    if (currentUser) {
      const badge = document.getElementById('cloudBadge');
      if (badge) badge.textContent = '클라우드 저장 중...';
      clearTimeout(cloudSyncTimer);
      cloudSyncTimer = setTimeout(async () => {
        try {
          await Cloud.pushStateToCloud(appState);
          const b2 = document.getElementById('cloudBadge');
          if (b2) b2.textContent = '동기화 완료';
        } catch {
          const b2 = document.getElementById('cloudBadge');
          if (b2) b2.textContent = '로컬 저장됨';
        }
      }, 900);
    }
  }

  async function loadFeed(forceNetwork = false) {
    const cfg = window.STEWARD_QUANT_CONFIG || {};
    const feedUrl = cfg.publicFeedUrl || 'https://hqfcpvszxkvtlabulbec.supabase.co/storage/v1/object/public/steward-crypto-public/quant-saas-feed.json';
    const syncEl = document.getElementById('feedSyncText');
    if (syncEl && forceNetwork) syncEl.textContent = '실시간 시세 갱신 중...';

    // 1) Instant fallback-feed load if first boot
    if (!liveFeed) {
      try {
        const fb = await fetch('./fallback-feed.json').then((r) => (r.ok ? r.json() : null));
        if (fb && fb.ok) {
          liveFeed = fb;
          renderAll();
        }
      } catch {}
    }

    // 2) Live Supabase feed fetch
    try {
      const res = await fetch(`${feedUrl}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const remote = await res.json();
        if (remote && remote.ok) {
          liveFeed = remote;
          renderAll();
          if (forceNetwork) showToast('실시간 3대 시장 SOTA 시그널이 최신화되었습니다.');
        }
      }
    } catch {
      // fallback already rendered
    }
  }

  function applyTheme(theme) {
    appState.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', appState.theme);
    try { localStorage.setItem('steward_theme_grade', appState.theme); } catch {}
    const btn = document.getElementById('btnThemeToggle');
    if (btn) btn.textContent = appState.theme === 'dark' ? '라이트' : '다크';
  }

  function renderShellChrome() {
    const ws = getActiveWorkspace();
    const plan = Engine.computePortfolioPlan(ws, liveFeed || {});

    // Workspace dropdown
    const sel = document.getElementById('wsSelect');
    if (sel) {
      sel.innerHTML = appState.workspaces.map((w) => (
        `<option value="${esc(w.id)}" ${w.id === ws.id ? 'selected' : ''}>${esc(w.name)}</option>`
      )).join('');
    }
    const nwMini = document.getElementById('wsNetWorthMini');
    if (nwMini) nwMini.textContent = fmtMoneyFromKrw(plan.totals.netWorthKrw);

    const cloudBadge = document.getElementById('cloudBadge');
    const authBtn = document.getElementById('btnOpenAuth');
    if (currentUser) {
      if (cloudBadge && !cloudBadge.textContent.includes('저장 중')) cloudBadge.textContent = '클라우드 연동됨';
      if (authBtn) authBtn.textContent = `${(currentUser.email || '내 계정').split('@')[0]}`;
    } else {
      if (cloudBadge) cloudBadge.textContent = '로컬 즉시저장';
      if (authBtn) authBtn.textContent = '클라우드 동기화';
    }

    // Action badge count
    const badge = document.getElementById('navActionBadge');
    if (badge) {
      const cnt = plan.orderTickets.length;
      badge.textContent = String(cnt);
      badge.style.display = cnt > 0 ? 'inline-block' : 'none';
    }

    // Currency buttons
    document.querySelectorAll('[data-currency]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-currency') === appState.currencyMode);
    });

    // Nav active
    document.querySelectorAll('[data-view]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-view') === currentView);
    });
    const heading = document.getElementById('pageHeading');
    if (heading) heading.textContent = VIEW_TITLES[currentView] || 'STEWARD QUANT';

    // Market sessions & FX
    const fxEl = document.getElementById('fxReadout');
    if (fxEl) fxEl.textContent = `₩${fxRate().toLocaleString('ko-KR', { maximumFractionDigits: 1 })}/$`;

    const ms = liveFeed?.marketSessions;
    if (ms) {
      const setSess = (id, open, openTxt, closedTxt) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = `status-pill ${open ? 'status-open' : 'status-closed'}`;
        el.textContent = open ? openTxt : closedTxt;
      };
      setSess('sessKr', ms.KR_STOCK?.isOpen, '정규장 운영 중', '장마감 (09:08 개장)');
      setSess('sessUs', ms.US_STOCK?.isOpen, '정규장 운영 중', '장마감 (09:38 ET)');
      setSess('sessCr', true, '24/7 실시간', '24/7');
    }

    const syncEl = document.getElementById('feedSyncText');
    if (syncEl && liveFeed?.updatedAt) {
      const d = new Date(liveFeed.updatedAt);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      syncEl.textContent = `37종목·131팩터 동기화 (${hh}:${mm} KST)`;
    }
  }

  function renderAll() {
    renderShellChrome();
    const container = document.getElementById('viewContainer');
    if (!container) return;

    if (currentView === 'overview') renderOverview(container);
    else if (currentView === 'portfolio') renderPortfolio(container);
    else if (currentView === 'signals') renderSignals(container);
    else if (currentView === 'lab') renderLab(container);
    else if (currentView === 'connect') renderConnect(container);
  }

  /* ── VIEW 1: OVERVIEW (통합 자산 홈) ───────────────────────────────────── */
  function renderOverview(container) {
    const ws = getActiveWorkspace();
    const plan = Engine.computePortfolioPlan(ws, liveFeed || {});
    const sim = Engine.runCustomBacktest({
      initialKrw: Math.max(1000000, plan.totals.netWorthKrw || 10000000),
      monthlyDcaKrw: 0,
      weights: plan.targetWeights,
    }, liveFeed?.oosBenchmark);

    const shield = plan.survivalShield;
    const hs = plan.healthScore || { score: 0, projectedScore: 98, grade: '—', headline: '', pillars: {} };
    const shieldBarPct = Math.max(4, Math.min(100, ((shield.monthlyPnlPct - shield.hardStopFloorPct) / Math.abs(shield.hardStopFloorPct * 2)) * 100));

    container.innerHTML = `
      <!-- Top Onboarding Quick Banner if Net Worth == 0 -->
      ${plan.totals.netWorthKrw <= 0 ? `
        <div class="card" style="border-color:var(--accent-border);background:var(--accent-soft);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-weight:800;font-size:14.5px">환영합니다! 30초 만에 내 3대 자산을 입력하고 SOTA 리밸런싱 주문서를 받아보세요.</div>
            <div style="font-size:12.5px;color:var(--text-secondary)">API 키 없이 보유 현금과 종목만 넣으면 온주 단위·수수료·변동성까지 반영한 정확한 매수/매도 수량을 계산해 드립니다.</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" data-action="go-portfolio">내 자산 입력하기 →</button>
            <button class="btn" data-action="open-presets">샘플 템플릿 불러오기</button>
          </div>
        </div>
      ` : ''}

      <!-- Hero Grid: Total Net Worth + Allocation & Survival Shield -->
      <div class="hero-grid">
        <section class="card" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
            <div>
              <div class="networth-label">
                <span>총 운용자산 (${esc(ws.name)})</span>
                <span class="tag tag-buy">${esc(plan.profile.label)}</span>
              </div>
              <div class="networth-value mono">${fmtMoneyFromKrw(plan.totals.netWorthKrw)}</div>
            </div>
            <div style="display:flex;gap:7px">
              <button class="btn btn-sm" data-action="open-presets">템플릿 변경</button>
              <button class="btn btn-primary btn-sm" data-action="go-portfolio">자산 수정 · 입력</button>
            </div>
          </div>

          ${plan.totals.netWorthKrw > 0 ? `
            <div class="health-well">
              <div style="display:flex;align-items:center;gap:12px;min-width:0">
                <div class="mono health-score-box ${hs.score >= 85 ? '' : 'is-warn'}">
                  <span style="font-size:15px;line-height:1">${hs.score}</span>
                  <span style="font-size:10px">${hs.grade}등급</span>
                </div>
                <div style="min-width:0">
                  <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <span>포트폴리오 건강 진단</span>
                    ${plan.orderTickets.length > 0 && hs.projectedScore > hs.score ? `<span class="tag tag-buy mono">리밸런싱 시 ${hs.score} → ${hs.projectedScore}점</span>` : '<span class="tag tag-buy">최적 상태</span>'}
                  </div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${esc(hs.headline)}</div>
                </div>
              </div>
              <div class="mono" style="display:flex;gap:12px;font-size:11.5px;color:var(--text-secondary);flex-wrap:wrap">
                <span>분산 <strong>${hs.pillars.balance}/25</strong></span>
                <span>복리효율 <strong>${hs.pillars.cashEfficiency}/25</strong></span>
                <span>팩터정합 <strong>${hs.pillars.factorAlignment}/25</strong></span>
                <span>방어수수료 <strong>${hs.pillars.shieldAndFee}/25</strong></span>
              </div>
            </div>
          ` : ''}

          <div class="kpi-strip">
            <div class="kpi-item">
              <span class="kpi-lbl">자율 운용 가능액</span>
              <span class="kpi-val mono">${fmtMoneyFromKrw(plan.totals.tradableKrw)}</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-lbl">장기보유 보호액</span>
              <span class="kpi-val mono warn">${fmtMoneyFromKrw(plan.totals.lockedKrw)}</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-lbl">현금 비중</span>
              <span class="kpi-val mono">${plan.totals.cashRatioPct}%</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-lbl">4년 OOS 연평균(CAGR)</span>
              <span class="kpi-val mono pos">+${sim.ok ? sim.sotaStats.cagrPct : '23.97'}% <span style="font-weight:500;color:var(--text-muted);font-size:11px">(SPY +17.62%)</span></span>
            </div>
            <div class="kpi-item">
              <span class="kpi-lbl">최대낙폭 방어(MaxDD)</span>
              <span class="kpi-val mono">${sim.ok ? sim.sotaStats.maxDdPct : '-15.60'}% <span style="font-weight:500;color:var(--text-muted);font-size:11px">(SPY -19.00%)</span></span>
            </div>
          </div>
        </section>

        <section class="card" style="display:flex;flex-direction:column;justify-content:space-between;gap:16px">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div id="overviewDonut"></div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
              <div style="display:flex;justify-content:space-between">
                <span><span class="swatch-dot swatch-kr"></span>국내주식</span>
                <strong class="mono">${plan.bookDrift.KR_STOCK.currentWeightPct}% <span style="color:var(--text-muted);font-weight:500">/ 목표 ${plan.targetWeights.KR_STOCK}%</span></strong>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span><span class="swatch-dot swatch-us"></span>미국주식</span>
                <strong class="mono">${plan.bookDrift.US_STOCK.currentWeightPct}% <span style="color:var(--text-muted);font-weight:500">/ 목표 ${plan.targetWeights.US_STOCK}%</span></strong>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span><span class="swatch-dot swatch-cr"></span>디지털자산</span>
                <strong class="mono">${plan.bookDrift.CRYPTO.currentWeightPct}% <span style="color:var(--text-muted);font-weight:500">/ 목표 ${plan.targetWeights.CRYPTO}%</span></strong>
              </div>
            </div>
          </div>

          <div style="padding-top:12px;border-top:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600">
              <span>월간 생존 방패 (하드 스탑 ${shield.hardStopFloorPct}%)</span>
              <span class="mono ${shield.shieldTripped ? 'neg' : 'pos'}">월간 ${shield.monthlyPnlPct >= 0 ? '+' : ''}${shield.monthlyPnlPct}% (여유 +${shield.bufferToStopPct}%p)</span>
            </div>
            <div class="shield-meter-track">
              <div class="shield-meter-fill" style="transform:scaleX(${(shieldBarPct / 100).toFixed(3)})"></div>
            </div>
          </div>
        </section>
      </div>

      <!-- 3 Asset Books Ledger Strip -->
      <div class="book-ledger-strip">
        ${['KR_STOCK', 'US_STOCK', 'CRYPTO'].map((bk) => {
          const meta = BOOK_META[bk];
          const bSum = plan.books[bk];
          const bFeed = liveFeed?.books?.[bk];
          const canary = bFeed?.canary || {};
          const topPick = (bFeed?.assets || [])[0];
          return `
            <div class="book-ledger-cell ${meta.cls}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <strong style="font-size:13.5px"><span class="swatch-dot ${meta.swatch}"></span>${meta.label}</strong>
                <span class="tag ${canary.gear === 'CALM_BULL_2X' ? 'tag-buy' : (canary.gear === 'NORMAL_BULL_1X' ? 'tag-park' : '')}">${esc(canary.gear === 'CALM_BULL_2X' ? '저변동 2x ON' : (canary.gear === 'NORMAL_BULL_1X' ? '1x 우량 코어' : '방어/단기채'))}</span>
              </div>
              <div class="mono" style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">${fmtMoneyFromKrw(bSum.totalKrw)}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">
                가용현금 <strong class="mono" style="color:var(--text-secondary)">${fmtNative(bSum.cashNative, bSum.currency)}</strong> · 보유 ${bSum.holdings.length}종목
              </div>
              <div style="padding-top:10px;border-top:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text-muted)">1순위 SOTA 타깃</span>
                ${topPick ? `<button type="button" class="tag tag-buy" data-open-dossier="${bk}:${esc(topPick.symbol)}">${esc(topPick.name.slice(0, 14))} (${esc(topPick.symbol)}) ›</button>` : '<span>—</span>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Two-Column: Today's Actionable Order Tickets + 4Y OOS Performance Comparison -->
      <div class="two-grid">
        <section class="card">
          <div class="card-header">
            <div>
              <div class="card-title">오늘의 리밸런싱 주문서 (${plan.orderTickets.length}건)</div>
              <div class="card-subtitle">내 현재 자산, 온주 제약, 호가 단위, 수수료 허들을 모두 반영한 실행 티켓입니다.</div>
            </div>
            ${plan.orderTickets.length > 0 ? `
              <div style="display:flex;gap:8px">
                <button class="btn btn-sm" id="btnCopyAllTickets">전체 복사</button>
                <button class="btn btn-primary btn-sm" id="btnExecAllTickets">전체 체결 반영</button>
              </div>
            ` : ''}
          </div>

          ${plan.orderTickets.length === 0 ? `
            <div style="padding:24px 16px;text-align:center;background:var(--bg-sub);border-radius:8px;border:1px dashed var(--border-strong)">
              <div style="font-weight:700;margin-bottom:4px">추가 매매 없이 현재 포지션 및 현금 방어를 유지합니다</div>
              <div style="font-size:12.5px;color:var(--text-muted)">현재 목표 포트폴리오와 일치하거나 진입 문턱(수수료 허들, 변동성 게이트) 미달 구간입니다.</div>
            </div>
          ` : `
            <div class="ticket-list">
              ${plan.orderTickets.map((t, idx) => `
                <div class="ticket-card">
                  <div>
                    <div class="ticket-top">
                      <span class="tag ${t.side === 'SELL' ? 'tag-sell' : (t.isCashPark ? 'tag-park' : 'tag-buy')}">${t.side === 'SELL' ? '매도 (교체)' : (t.isCashPark ? '매수 (단기채 파킹)' : '매수 (신규 진입)')}</span>
                      <span class="tag">${BOOK_META[t.book].label.split(' ')[0]}</span>
                      <button class="ticket-sym" data-open-dossier="${t.book}:${esc(t.symbol)}">${esc(t.name)} <span class="mono" style="color:var(--text-muted);font-weight:500">(${esc(t.symbol)})</span></button>
                    </div>
                    <div class="ticket-reason">${esc(t.reason)}</div>
                    <div class="ticket-meta mono">
                      <span>수량: <strong>${t.qty}${t.book === 'CRYPTO' ? '개' : '주'}</strong></span>
                      <span>지정가: <strong>${fmtNative(t.limitPrice, t.currency)}</strong></span>
                      ${t.stopLossPrice ? `<span class="neg">하드손절(-${t.stopLossPct}%): ${fmtNative(t.stopLossPrice, t.currency)}</span>` : ''}
                    </div>
                  </div>
                  <div class="ticket-actions">
                    <div class="ticket-amt mono">${fmtNative(t.amountNative, t.currency)}</div>
                    <div style="display:flex;gap:8px">
                      <button class="btn btn-sm" data-copy-ticket="${idx}">주문 복사</button>
                      <button class="btn btn-primary btn-sm" data-exec-ticket="${idx}">체결 반영</button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}

          ${ws.monthlyDcaKrw > 0 ? `
            <div style="margin-top:16px;padding:12px;background:var(--bg-sub);border-radius:8px;font-size:12.5px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <span style="color:var(--text-muted)"><strong>이번 달 적립금(${fmtMoneyFromKrw(ws.monthlyDcaKrw)}) 무매도 배분 추천:</strong></span>
              <span class="mono">국내 <strong>${fmtMoneyFromKrw(plan.bookDrift.KR_STOCK.recommendedDcaKrw)}</strong> / 미국 <strong>${fmtMoneyFromKrw(plan.bookDrift.US_STOCK.recommendedDcaKrw)}</strong> / 코인 <strong>${fmtMoneyFromKrw(plan.bookDrift.CRYPTO.recommendedDcaKrw)}</strong></span>
            </div>
          ` : ''}
        </section>

        <section class="card">
          <div class="card-header">
            <div>
              <div class="card-title">내 비중 SOTA vs S&amp;P 500 실전 검증 (4년 Walk-Forward OOS)</div>
              <div class="card-subtitle">마우스를 올리면 시기별 국면 기어와 누적 초과수익률을 확인할 수 있습니다.</div>
            </div>
            <button class="btn btn-sm" data-action="go-lab">적립식 시뮬레이터</button>
          </div>
          <div class="chart-wrap">
            <canvas id="overviewEquityCanvas"></canvas>
            <div id="overviewEquityTooltip" class="chart-tooltip"></div>
          </div>
          ${sim.ok ? `
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:12px">
              <span>4년 원금 대비 최종자산: <strong class="pos mono">${fmtMoneyFromKrw(sim.wealth.finalSotaKrw)} (+${sim.sotaStats.totalRetPct}%)</strong></span>
              <span>S&amp;P 500 단순보유 대비: <strong class="pos mono">+${fmtMoneyFromKrw(sim.wealth.excessVsSpyKrw)} 우위</strong></span>
            </div>
          ` : ''}
        </section>
      </div>
    `;

    // Render Donut + Equity Chart
    Charts.renderAllocationDonut(
      document.getElementById('overviewDonut'),
      [
        { value: plan.books.KR_STOCK.totalKrw, color: 'var(--kr-color)' },
        { value: plan.books.US_STOCK.totalKrw, color: 'var(--us-color)' },
        { value: plan.books.CRYPTO.totalKrw, color: 'var(--cr-color)' },
      ],
      '3대 자산',
      `${plan.orderTickets.length}건 액션`,
    );

    if (sim.ok) {
      Charts.renderEquityChart(
        document.getElementById('overviewEquityCanvas'),
        document.getElementById('overviewEquityTooltip'),
        sim.series,
        {
          formatMoney: (v) => fmtMoneyFromKrw(v, false),
          compactAxis: (v) => fmtMoneyFromKrw(v, true),
        },
      );
    }

    // Bind Ticket buttons
    container.querySelectorAll('[data-copy-ticket]').forEach((btn) => {
      btn.onclick = () => {
        const t = plan.orderTickets[Number(btn.getAttribute('data-copy-ticket'))];
        if (!t) return;
        const txt = `[STEWARD QUANT] ${t.side} ${t.name}(${t.symbol}) ${t.qty}${t.book === 'CRYPTO' ? '개' : '주'} @ ${fmtNative(t.limitPrice, t.currency)}${t.stopLossPrice ? ` | 손절가 ${fmtNative(t.stopLossPrice, t.currency)}` : ''}`;
        navigator.clipboard?.writeText(txt);
        showToast(`주문 티켓 복사됨: ${t.symbol} ${t.qty}${t.book === 'CRYPTO' ? '개' : '주'}`);
      };
    });

    const copyAllBtn = document.getElementById('btnCopyAllTickets');
    if (copyAllBtn) {
      copyAllBtn.onclick = () => {
        const lines = plan.orderTickets.map((t, i) => (
          `${i + 1}. [${BOOK_META[t.book].label}] ${t.side} ${t.name}(${t.symbol}) ${t.qty}${t.book === 'CRYPTO' ? '개' : '주'} @ ${fmtNative(t.limitPrice, t.currency)}`
        ));
        navigator.clipboard?.writeText(lines.join('\n'));
        showToast(`전체 주문서(${lines.length}건)가 클립보드에 복사되었습니다.`);
      };
    }

    const execAllBtn = document.getElementById('btnExecAllTickets');
    if (execAllBtn) {
      execAllBtn.onclick = () => {
        const idx = appState.workspaces.findIndex((w) => w.id === ws.id);
        appState.workspaces[idx] = Engine.applyAllTicketsToWorkspace(ws, plan.orderTickets);
        persistAndScheduleSync();
        renderAll();
        showToast(`전체 주문서(${plan.orderTickets.length}건) 체결이 원장에 일괄 반영되었습니다.`);
      };
    }

    container.querySelectorAll('[data-exec-ticket]').forEach((btn) => {
      btn.onclick = () => {
        const t = plan.orderTickets[Number(btn.getAttribute('data-exec-ticket'))];
        if (!t) return;
        const idx = appState.workspaces.findIndex((w) => w.id === ws.id);
        appState.workspaces[idx] = Engine.applyOrderTicketToWorkspace(ws, t);
        persistAndScheduleSync();
        renderAll();
        showToast(`체결 완료 반영됨: ${t.side} ${t.symbol} ${t.qty}${t.book === 'CRYPTO' ? '개' : '주'}`);
      };
    });

    bindCommonViewTriggers(container);
  }

  /* ── VIEW 2: PORTFOLIO & SMART REBALANCER (내 자산 입력 & 잠금 관리) ───── */
  function renderPortfolio(container) {
    const ws = getActiveWorkspace();
    const plan = Engine.computePortfolioPlan(ws, liveFeed || {});
    const allUniverseOptions = [];
    for (const bk of ['KR_STOCK', 'US_STOCK', 'CRYPTO']) {
      for (const a of liveFeed?.books?.[bk]?.assets || []) {
        allUniverseOptions.push({ book: bk, symbol: a.symbol, name: a.name, price: a.price });
      }
    }

    container.innerHTML = `
      <!-- Profile & Target Allocation Card -->
      <section class="card">
        <div class="card-header">
          <div>
            <div class="card-title">1. 투자 성향 &amp; 3대 자산 목표 비중 설정</div>
            <div class="card-subtitle">성향을 고르거나 슬라이더를 움직이면 즉시 내 계좌에 맞는 온주 단위 리밸런싱 주문서가 재계산됩니다.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${appState.workspaces.length > 1 ? `<button class="btn btn-danger btn-sm" id="btnDeleteWs">워크스페이스 삭제</button>` : ''}
            <button class="btn btn-sm" data-action="open-presets">샘플 프리셋 불러오기</button>
            <button class="btn btn-primary btn-sm" data-action="go-overview">산출된 주문서 보기 (${plan.orderTickets.length}건) ›</button>
          </div>
        </div>

        <div class="profile-grid" style="margin-bottom:16px">
          ${['CONSERVATIVE', 'BALANCED_SOTA', 'AGGRESSIVE'].map((pid) => {
            const p = Engine.RISK_PROFILES[pid];
            return `
              <button class="profile-option ${ws.profileId === pid ? 'active' : ''}" data-select-profile="${pid}">
                <div style="font-weight:800;font-size:13.5px;margin-bottom:3px">${esc(p.label)}</div>
                <div style="font-size:11.5px;color:var(--text-muted)">${esc(p.subtitle)}</div>
                <div class="mono" style="font-size:11px;margin-top:6px;color:var(--accent)">국내 ${p.weights.KR_STOCK}% · 미국 ${p.weights.US_STOCK}% · 코인 ${p.weights.CRYPTO}%</div>
              </button>
            `;
          }).join('')}
        </div>

        <div class="form-row">
          <div class="field">
            <label>포트폴리오 이름</label>
            <input id="inpWsName" class="input" type="text" value="${esc(ws.name)}" />
          </div>
          <div class="field">
            <label>국내주식 목표 비중 (<span id="lblWKr" class="mono">${plan.targetWeights.KR_STOCK}%</span>)</label>
            <input id="rngWKr" type="range" min="0" max="100" value="${plan.targetWeights.KR_STOCK}" />
          </div>
          <div class="field">
            <label>미국주식 목표 비중 (<span id="lblWUs" class="mono">${plan.targetWeights.US_STOCK}%</span>)</label>
            <input id="rngWUs" type="range" min="0" max="100" value="${plan.targetWeights.US_STOCK}" />
          </div>
          <div class="field">
            <label>가상자산 목표 비중 (<span id="lblWCr" class="mono">${plan.targetWeights.CRYPTO}%</span>)</label>
            <input id="rngWCr" type="range" min="0" max="100" value="${plan.targetWeights.CRYPTO}" />
          </div>
          <div class="field">
            <label>월 정기 적립금 (원)</label>
            <input id="inpMonthlyDca" class="input mono" type="number" step="50000" min="0" value="${Number(ws.monthlyDcaKrw || 0)}" />
          </div>
          <div class="field">
            <label>유휴현금 단기채 파킹(272580·USFR)</label>
            <select id="selAutoPark" class="input">
              <option value="1" ${ws.autoCashPark !== false ? 'selected' : ''}>자동 복리 파킹 ON (권장)</option>
              <option value="0" ${ws.autoCashPark === false ? 'selected' : ''}>현금 그대로 보유</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 3 Asset Books Detailed Cash & Holdings CRUD -->
      <div class="three-grid">
        ${['KR_STOCK', 'US_STOCK', 'CRYPTO'].map((bk) => {
          const meta = BOOK_META[bk];
          const isUsd = bk === 'US_STOCK';
          const rawBook = ws.books[bk] || {};
          const bSum = plan.books[bk];
          const datalistId = `dl_${bk}`;
          const bkOptions = allUniverseOptions.filter((o) => o.book === bk);

          return `
            <section class="card book-card ${meta.cls}" style="display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong style="font-size:14px"><span class="swatch-dot ${meta.swatch}"></span>${meta.label}</strong>
                <span class="mono" style="font-weight:700">${fmtMoneyFromKrw(bSum.totalKrw)}</span>
              </div>

              <div class="form-row">
                <div class="field">
                  <label>주문가능 현금 (${isUsd ? 'USD $' : 'KRW 원'})</label>
                  <input class="input mono" type="number" step="${isUsd ? '1' : '10000'}" min="0" data-cash-book="${bk}" value="${isUsd ? Number(rawBook.cashUsd || 0) : Number(rawBook.cashKrw || 0)}" />
                </div>
                ${bk === 'CRYPTO' ? `
                  <div class="field">
                    <label>거래소 왕복 수수료</label>
                    <select class="input mono" data-fee-book="CRYPTO">
                      <option value="8" ${Number(rawBook.feeBps || 8) === 8 ? 'selected' : ''}>빗썸 쿠폰 (8bps)</option>
                      <option value="10" ${Number(rawBook.feeBps) === 10 ? 'selected' : ''}>업비트 원화 (10bps)</option>
                      <option value="50" ${Number(rawBook.feeBps) === 50 ? 'selected' : ''}>빗썸 일반 (50bps)</option>
                    </select>
                  </div>
                ` : ''}
              </div>

              <!-- Holdings List -->
              <div style="display:flex;flex-direction:column;gap:6px">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--text-muted);font-weight:600">
                  <span>보유 종목 (${bSum.holdings.length}개, 보호 설정 시 매도 제외)</span>
                  <button class="btn btn-sm" data-bulk-paste="${bk}">텍스트 일괄입력</button>
                </div>

                ${bSum.holdings.length === 0 ? `
                  <div style="font-size:12px;color:var(--text-muted);padding:12px;background:var(--bg-sub);border-radius:8px;text-align:center">보유 종목 없음 (전액 현금 대기)</div>
                ` : bSum.holdings.map((h, hIdx) => `
                  <div class="holding-row ${h.locked ? 'is-locked' : ''}">
                    <div style="min-width:0">
                      <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${h.locked ? '<span class="tag tag-lock">보호</span> ' : ''}${esc(h.name)} <span class="mono" style="color:var(--text-muted)">(${esc(h.symbol)})</span>
                      </div>
                      <div class="mono" style="font-size:11px;color:var(--text-muted)">
                        ${h.qty}${bk === 'CRYPTO' ? '개' : '주'} / 평가 ${fmtNative(h.evalNative, h.currency)} (<span class="${h.pnlPct >= 0 ? 'pos' : 'neg'}">${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct}%</span>)
                      </div>
                    </div>
                    <div style="display:flex;gap:4px;flex-shrink:0">
                      <button class="btn btn-sm" title="수량 및 평단가 수정" data-edit-holding="${bk}:${hIdx}">수정</button>
                      <button class="btn btn-sm" title="장기보유 보호 잠금 토글" data-toggle-lock="${bk}:${hIdx}">${h.locked ? '보호중' : '자율'}</button>
                      <button class="btn btn-danger btn-sm" title="삭제" data-del-holding="${bk}:${hIdx}">삭제</button>
                    </div>
                  </div>
                `).join('')}
              </div>

              <!-- Add Holding Mini Form -->
              <datalist id="${datalistId}">
                ${bkOptions.map((o) => `<option value="${esc(o.symbol)}">${esc(o.name)} (${fmtNative(o.price, isUsd ? 'USD' : 'KRW')})</option>`).join('')}
              </datalist>
              <form data-add-holding="${bk}" style="margin-top:auto;padding-top:10px;border-top:1px solid var(--border);display:grid;grid-template-columns:1fr 0.78fr 0.95fr auto;gap:6px">
                <input class="input mono" name="symbol" list="${datalistId}" placeholder="티커/코드" required />
                <input class="input mono" name="qty" type="number" step="any" min="0.000001" placeholder="수량" required />
                <input class="input mono" name="avgPrice" type="number" step="any" min="0" placeholder="평단가" />
                <button type="submit" class="btn btn-primary btn-sm">추가</button>
              </form>
            </section>
          `;
        }).join('')}
      </div>

      <!-- Composer.trade-style SOTA Target Portfolio Blueprint -->
      <section class="card">
        <div class="card-header">
          <div>
            <div class="card-title">2. SOTA 목표 포트폴리오 청사진 (리밸런싱 완료 시 목표 보유 구성)</div>
            <div class="card-subtitle">보호 잠금 종목은 원형 보존되며, 자율 운용 자본만 각 시장 상위 SOTA 타깃 및 무위험 단기채로 온주 최적 배치됩니다.</div>
          </div>
          <button class="btn btn-primary btn-sm" data-action="go-overview">주문서 실행 화면으로 이동 (${plan.orderTickets.length}건)</button>
        </div>
        <div class="three-grid">
          ${['KR_STOCK', 'US_STOCK', 'CRYPTO'].map((bk) => {
            const meta = BOOK_META[bk];
            const targets = plan.targetAllocations[bk] || [];
            const currency = bk === 'US_STOCK' ? 'USD' : 'KRW';
            return `
              <div style="background:var(--bg-sub);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px">
                  <strong>${meta.label} 목표안</strong>
                  <span class="mono" style="color:var(--text-muted)">목표 ${plan.targetWeights[bk]}% (현재 ${plan.bookDrift[bk].currentWeightPct}%)</span>
                </div>
                ${targets.length === 0 ? `
                  <div style="font-size:12px;color:var(--text-muted);padding:8px 0">진입 조건 충족 전 현금 실드 대기 (수수료 및 변동성 보호)</div>
                ` : targets.map((t) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding-top:8px;border-top:1px solid var(--border)">
                    <div>
                      <div style="font-weight:700">${t.locked ? '[보호] ' : ''}${esc(t.name)} <span class="mono" style="color:var(--text-muted)">(${esc(t.symbol)})</span></div>
                      <div style="font-size:10.8px;color:var(--text-muted)">${esc(t.role === 'CASH_PARK' ? '무위험 복리 파킹' : (t.locked ? '장기보유 원형 보존' : t.role))}</div>
                    </div>
                    <div class="mono" style="text-align:right">
                      <div style="font-weight:800">${t.targetQty}${bk === 'CRYPTO' ? '개' : '주'}</div>
                      <div style="font-size:10.8px;color:var(--text-muted)">${fmtNative(t.amountNative, currency)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;

    // Event bindings for Portfolio Editor
    container.querySelectorAll('[data-select-profile]').forEach((btn) => {
      btn.onclick = () => {
        const pid = btn.getAttribute('data-select-profile');
        const prof = Engine.RISK_PROFILES[pid];
        if (!prof) return;
        ws.profileId = pid;
        ws.weights = { ...prof.weights };
        ws.monthlyStopPct = prof.monthlyStopPct;
        persistAndScheduleSync();
        renderAll();
        showToast(`투자 성향이 '${prof.label}'으로 적용되었습니다.`);
      };
    });

    const inpName = document.getElementById('inpWsName');
    if (inpName) {
      inpName.onchange = () => {
        ws.name = inpName.value.trim() || '내 포트폴리오';
        persistAndScheduleSync();
      };
    }

    const delWsBtn = document.getElementById('btnDeleteWs');
    if (delWsBtn) {
      delWsBtn.onclick = () => {
        if (appState.workspaces.length <= 1) return;
        const removedName = ws.name;
        appState.workspaces = appState.workspaces.filter((w) => w.id !== ws.id);
        appState.activeWorkspaceId = appState.workspaces[0].id;
        persistAndScheduleSync();
        renderAll();
        showToast(`'${removedName}' 워크스페이스가 삭제되었습니다.`);
      };
    }

    const bindWeightSliders = () => {
      const rKr = document.getElementById('rngWKr');
      const rUs = document.getElementById('rngWUs');
      const rCr = document.getElementById('rngWCr');
      [rKr, rUs, rCr].forEach((el) => {
        if (!el) return;
        el.oninput = () => {
          const norm = Engine.normalizeWeights({
            KR_STOCK: Number(rKr.value),
            US_STOCK: Number(rUs.value),
            CRYPTO: Number(rCr.value),
          });
          const lKr = document.getElementById('lblWKr');
          const lUs = document.getElementById('lblWUs');
          const lCr = document.getElementById('lblWCr');
          if (lKr) lKr.textContent = `${norm.KR_STOCK}%`;
          if (lUs) lUs.textContent = `${norm.US_STOCK}%`;
          if (lCr) lCr.textContent = `${norm.CRYPTO}%`;
        };
        el.onchange = () => {
          ws.profileId = 'CUSTOM';
          ws.weights = Engine.normalizeWeights({
            KR_STOCK: Number(rKr.value),
            US_STOCK: Number(rUs.value),
            CRYPTO: Number(rCr.value),
          });
          persistAndScheduleSync();
          renderAll();
        };
      });
    };
    bindWeightSliders();

    const inpDca = document.getElementById('inpMonthlyDca');
    if (inpDca) {
      inpDca.onchange = () => {
        ws.monthlyDcaKrw = Math.max(0, Number(inpDca.value) || 0);
        persistAndScheduleSync();
        renderAll();
      };
    }

    const selPark = document.getElementById('selAutoPark');
    if (selPark) {
      selPark.onchange = () => {
        ws.autoCashPark = selPark.value === '1';
        persistAndScheduleSync();
        renderAll();
      };
    }

    container.querySelectorAll('[data-cash-book]').forEach((inp) => {
      inp.onchange = () => {
        const bk = inp.getAttribute('data-cash-book');
        const val = Math.max(0, Number(inp.value) || 0);
        if (bk === 'US_STOCK') ws.books.US_STOCK.cashUsd = val;
        else ws.books[bk].cashKrw = val;
        ws.monthlyBaselineKrw = 0; // auto-sync baseline when user edits capital
        persistAndScheduleSync();
        renderAll();
      };
    });

    container.querySelectorAll('[data-fee-book]').forEach((sel) => {
      sel.onchange = () => {
        ws.books.CRYPTO.feeBps = Number(sel.value) || 8;
        persistAndScheduleSync();
        renderAll();
      };
    });

    container.querySelectorAll('[data-toggle-lock]').forEach((btn) => {
      btn.onclick = () => {
        const [bk, idxStr] = btn.getAttribute('data-toggle-lock').split(':');
        const row = ws.books[bk]?.holdings?.[Number(idxStr)];
        if (!row) return;
        row.locked = !row.locked;
        persistAndScheduleSync();
        renderAll();
        showToast(`${row.symbol}: ${row.locked ? '장기보유 보호 잠금(매도 추천 제외)' : '자율 리밸런싱 편입'}`);
      };
    });

    container.querySelectorAll('[data-edit-holding]').forEach((btn) => {
      btn.onclick = () => {
        const [bk, idxStr] = btn.getAttribute('data-edit-holding').split(':');
        const row = ws.books[bk]?.holdings?.[Number(idxStr)];
        if (!row) return;
        openCustomDialog({
          title: `${row.name} (${row.symbol}) 보유정보 수정`,
          subtitle: `${BOOK_META[bk].label} · 수량과 평균매입단가를 수정합니다.`,
          fields: [
            { name: 'qty', label: `보유 수량 (${bk === 'CRYPTO' ? '개' : '주'})`, type: 'number', value: String(row.qty), required: true },
            { name: 'avgPrice', label: `평균 매입단가 (${bk === 'US_STOCK' ? 'USD $' : 'KRW 원'})`, type: 'number', value: String(row.avgPrice || 0) },
          ],
          submitLabel: '수정 저장',
          onSubmit: (vals) => {
            const q = Number(vals.qty || 0);
            if (!(q > 0)) return;
            row.qty = q;
            row.avgPrice = Math.max(0, Number(vals.avgPrice || 0));
            ws.monthlyBaselineKrw = 0;
            persistAndScheduleSync();
            renderAll();
            showToast(`${row.symbol} 보유 수량(${q})이 수정되었습니다.`);
          },
        });
      };
    });

    container.querySelectorAll('[data-del-holding]').forEach((btn) => {
      btn.onclick = () => {
        const [bk, idxStr] = btn.getAttribute('data-del-holding').split(':');
        ws.books[bk]?.holdings?.splice(Number(idxStr), 1);
        ws.monthlyBaselineKrw = 0;
        persistAndScheduleSync();
        renderAll();
      };
    });

    container.querySelectorAll('form[data-add-holding]').forEach((form) => {
      form.onsubmit = (e) => {
        e.preventDefault();
        const bk = form.getAttribute('data-add-holding');
        const fd = new FormData(form);
        const sym = String(fd.get('symbol') || '').trim().toUpperCase();
        const qty = Number(fd.get('qty') || 0);
        if (!sym || !(qty > 0)) return;
        const matched = (liveFeed?.books?.[bk]?.assets || []).find((a) => a.symbol === sym);
        const avgPrice = Number(fd.get('avgPrice') || 0) || matched?.price || 0;
        ws.books[bk].holdings = ws.books[bk].holdings || [];
        ws.books[bk].holdings.push({
          symbol: sym,
          name: matched?.name || sym,
          qty,
          avgPrice,
          locked: false,
        });
        ws.monthlyBaselineKrw = 0;
        persistAndScheduleSync();
        renderAll();
        showToast(`${sym} ${qty}${bk === 'CRYPTO' ? '개' : '주'} 추가 완료`);
      };
    });

    container.querySelectorAll('[data-bulk-paste]').forEach((btn) => {
      btn.onclick = () => {
        const bk = btn.getAttribute('data-bulk-paste');
        openCustomDialog({
          title: `${BOOK_META[bk].icon} ${BOOK_META[bk].label} 일괄 붙여넣기`,
          subtitle: '증권사·거래소 내역이나 엑셀 텍스트를 한 줄에 한 종목씩 붙여넣으세요. ("잠금" 포함 시 자동 장기보유 보호)',
          fields: [
            {
              name: 'raw',
              label: '종목 목록 (예: 티커 수량 평단가)',
              type: 'textarea',
              placeholder: bk === 'KR_STOCK'
                ? '379800 50 21200\n005930 20 71000 잠금'
                : (bk === 'US_STOCK' ? 'SSO, 15, 88.5\nNVDA, 5, 128.5, 잠금' : 'BTC 0.025 138000000\nETH 0.5 4200000'),
              required: true,
            },
          ],
          submitLabel: '일괄 파싱 & 추가',
          onSubmit: (vals) => {
            const rows = Engine.parseHoldingsText(vals.raw || '');
            if (rows.length === 0) {
              showToast('인식된 종목이 없습니다. "티커 수량 평단가" 형식으로 입력해 주세요.');
              return;
            }
            for (const r of rows) {
              const matched = (liveFeed?.books?.[bk]?.assets || []).find((a) => a.symbol === r.symbol);
              ws.books[bk].holdings.push({
                symbol: r.symbol,
                name: matched?.name || r.symbol,
                qty: r.qty,
                avgPrice: r.avgPrice || matched?.price || 0,
                locked: r.locked,
              });
            }
            ws.monthlyBaselineKrw = 0;
            persistAndScheduleSync();
            renderAll();
            showToast(`${rows.length}개 종목이 일괄 등록되었습니다.`);
          },
        });
      };
    });

    bindCommonViewTriggers(container);
  }

  /* ── VIEW 3: SOTA SIGNALS & 131-FACTOR RADAR ───────────────────────────── */
  function renderSignals(container) {
    const allAssets = [];
    for (const bk of ['KR_STOCK', 'US_STOCK', 'CRYPTO']) {
      for (const a of liveFeed?.books?.[bk]?.assets || []) {
        allAssets.push(a);
      }
    }

    const filtered = allAssets
      .filter((a) => (signalFilterBook === 'ALL' ? true : a.assetClass === signalFilterBook))
      .filter((a) => (!signalOnlyEligible ? true : (a.action === 'BUY' || a.buyEligible || a.isCashPark)))
      .filter((a) => {
        if (!signalSearch) return true;
        const q = signalSearch.toLowerCase();
        return a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const getVal = (x) => {
          if (signalSortKey === 'clenow') return x.sota?.clenowRegSharpe63 || 0;
          if (signalSortKey === 'keller') return x.sota?.kellerMom13612 || 0;
          if (signalSortKey === 'vol') return x.sota?.annVol20Pct || 0;
          if (signalSortKey === 'netBps') return x.expectedNetBps || 0;
          return x.rankScore || 0;
        };
        return (getVal(a) - getVal(b)) * signalSortDir;
      });

    container.innerHTML = `
      <!-- 3-Market Canary Thermometers -->
      <div class="book-ledger-strip">
        ${['KR_STOCK', 'US_STOCK', 'CRYPTO'].map((bk) => {
          const meta = BOOK_META[bk];
          const bFeed = liveFeed?.books?.[bk] || {};
          const c = bFeed.canary || {};
          return `
            <div class="book-ledger-cell ${meta.cls}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <strong><span class="swatch-dot ${meta.swatch}"></span>${meta.label} 카나리아</strong>
                <span class="mono" style="font-size:11.5px;color:var(--text-muted)">Vol20: <strong>${c.benchAnnVol20Pct ?? '—'}%</strong></span>
              </div>
              <div style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:6px">${esc(c.gearLabel || '데이터 수신 중')}</div>
              <div class="mono" style="font-size:11.5px;color:var(--text-muted);display:flex;gap:10px;flex-wrap:wrap">
                <span>Keller 13612W: <strong>${c.benchKellerMom13612 ?? 0}</strong></span>
                <span>SMA140: <strong>${c.benchAboveSma140 ? '상단(강세)' : '하단(주의)'}</strong></span>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Screener Table Card -->
      <section class="card">
        <div class="card-header" style="flex-wrap:wrap">
          <div>
            <div class="card-title">3대 시장 유니버스 131팩터 실시간 스크리너 (${filtered.length}종목)</div>
            <div class="card-subtitle">종목을 클릭하면 9대 패밀리 팩터 분해, ATR 손절/트레일링 기준, AI 투자 논거 도시에가 열립니다.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <div class="seg-group">
              ${[
                ['ALL', '전체'],
                ['KR_STOCK', '국내 11'],
                ['US_STOCK', '미국 17'],
                ['CRYPTO', '코인 9'],
              ].map(([k, lbl]) => `<button class="seg-btn ${signalFilterBook === k ? 'active' : ''}" data-sig-book="${k}">${lbl}</button>`).join('')}
            </div>
            <button class="btn btn-sm ${signalOnlyEligible ? 'btn-primary' : ''}" id="btnSigEligible">적격·파킹만</button>
            <input id="inpSigSearch" class="input" style="width:170px;padding:5px 10px;font-size:12px" placeholder="티커·종목명 필터..." value="${esc(signalSearch)}" />
          </div>
        </div>

        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>시장 · 종목</th>
                <th>현재가</th>
                <th>SOTA 판정</th>
                <th class="sortable r-align" data-sort="rankScore">SOTA 점수 ▾</th>
                <th class="sortable r-align" data-sort="clenow">Clenow 회귀샤프</th>
                <th class="sortable r-align" data-sort="keller">Keller 13612W</th>
                <th class="sortable r-align" data-sort="vol">20일 변동성</th>
                <th class="sortable r-align" data-sort="netBps">순기대(bps)</th>
                <th>핵심 논거</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((a) => {
                const badgeCls = a.action === 'BUY'
                  ? 'tag-buy'
                  : (a.action === 'CASH_PARK' || a.action === 'PARK_READY' ? 'tag-park' : '');
                return `
                  <tr class="clickable-row" data-open-dossier="${a.assetClass}:${esc(a.symbol)}">
                    <td>
                      <div style="font-weight:700"><span class="swatch-dot ${BOOK_META[a.assetClass].swatch}"></span>${esc(a.name)}</div>
                      <div class="mono" style="font-size:11px;color:var(--text-muted)">${esc(a.symbol)} · 왕복 ${a.roundTripCostBps}bps${a.leverage > 1 ? ` · ${a.leverage}x` : ''}</div>
                    </td>
                    <td class="mono">${fmtNative(a.price, a.currency)}</td>
                    <td><span class="tag ${badgeCls}">${esc(a.action)} · ${esc(a.tradeStyle)}</span></td>
                    <td class="mono r-align"><strong>${a.rankScore.toFixed(3)}</strong></td>
                    <td class="mono r-align ${a.sota.clenowRegSharpe63 > 0 ? 'pos' : ''}">${a.sota.clenowRegSharpe63.toFixed(2)} <span style="color:var(--text-muted);font-size:10.5px">(R² ${a.sota.clenowR2_63.toFixed(2)})</span></td>
                    <td class="mono r-align ${a.sota.kellerMom13612 > 0 ? 'pos' : 'neg'}">${a.sota.kellerMom13612.toFixed(2)}</td>
                    <td class="mono r-align">${a.sota.annVol20Pct.toFixed(1)}%</td>
                    <td class="mono r-align ${a.expectedNetBps > 0 ? 'pos' : 'neg'}">${a.expectedNetBps >= 0 ? '+' : ''}${a.expectedNetBps}bps</td>
                    <td style="max-width:270px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-secondary);font-size:12px">${esc(a.thesis)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;

    container.querySelectorAll('[data-sig-book]').forEach((b) => {
      b.onclick = () => {
        signalFilterBook = b.getAttribute('data-sig-book');
        renderSignals(container);
      };
    });
    const btnElig = document.getElementById('btnSigEligible');
    if (btnElig) {
      btnElig.onclick = () => {
        signalOnlyEligible = !signalOnlyEligible;
        renderSignals(container);
      };
    }
    const inpSearch = document.getElementById('inpSigSearch');
    if (inpSearch) {
      inpSearch.oninput = () => {
        signalSearch = inpSearch.value;
        renderSignals(container);
        const refocused = document.getElementById('inpSigSearch');
        if (refocused) {
          refocused.focus();
          refocused.setSelectionRange(signalSearch.length, signalSearch.length);
        }
      };
    }
    container.querySelectorAll('[data-sort]').forEach((th) => {
      th.onclick = () => {
        const k = th.getAttribute('data-sort');
        if (signalSortKey === k) signalSortDir *= -1;
        else { signalSortKey = k; signalSortDir = -1; }
        renderSignals(container);
      };
    });

    bindCommonViewTriggers(container);
  }

  /* ── VIEW 4: STRATEGY LAB & WALK-FORWARD BACKTESTER ────────────────────── */
  function renderLab(container) {
    const sim = Engine.runCustomBacktest({
      initialKrw: labState.initialKrw,
      monthlyDcaKrw: labState.monthlyDcaKrw,
      weights: { KR_STOCK: labState.wKr, US_STOCK: labState.wUs, CRYPTO: labState.wCr },
      volManaged: labState.volManaged,
      safeHavenShield: labState.safeHavenShield,
      cashParkSweep: labState.cashParkSweep,
      extraFeeBps: labState.extraFeeBps,
    }, liveFeed?.oosBenchmark);

    container.innerHTML = `
      <div class="two-grid">
        <!-- Controls Panel -->
        <section class="card" style="display:flex;flex-direction:column;gap:14px">
          <div>
            <div class="card-title">∿ Walk-Forward OOS 적립식 &amp; 기어 백테스터</div>
            <div class="card-subtitle">2022.11 ~ 2026.11 실제 시장 일봉 및 실수수료 기반 비인샘플(Out-of-Sample) 검증기입니다.</div>
          </div>

          <div class="form-row">
            <div class="field">
              <label>초기 거치 투자금 (원)</label>
              <input id="labInit" class="input mono" type="number" step="1000000" min="100000" value="${labState.initialKrw}" />
            </div>
            <div class="field">
              <label>월 적립식 추가납입금 (DCA, 원)</label>
              <input id="labDca" class="input mono" type="number" step="100000" min="0" value="${labState.monthlyDcaKrw}" />
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label>국내주식 비중 (<span class="mono">${sim.ok ? sim.weights.KR_STOCK : labState.wKr}%</span>)</label>
              <input id="labWKr" type="range" min="0" max="100" value="${labState.wKr}" />
            </div>
            <div class="field">
              <label>미국주식 비중 (<span class="mono">${sim.ok ? sim.weights.US_STOCK : labState.wUs}%</span>)</label>
              <input id="labWUs" type="range" min="0" max="100" value="${labState.wUs}" />
            </div>
            <div class="field">
              <label>가상자산 비중 (<span class="mono">${sim.ok ? sim.weights.CRYPTO : labState.wCr}%</span>)</label>
              <input id="labWCr" type="range" min="0" max="100" value="${labState.wCr}" />
            </div>
          </div>

          <div style="padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px">
            <div style="font-size:11.5px;font-weight:700;color:var(--text-muted)">학술 SOTA 방어 기어 ON/OFF 실험 (끄면 실제 방어력 차이를 즉시 비교)</div>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer">
              <input type="checkbox" id="chkVol" ${labState.volManaged ? 'checked' : ''} />
              <span><strong>Moreira &amp; Muir (2017)</strong> 변동성 관리 레버리지 (고변동 시 2x → 1x 자동 감속)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer">
              <input type="checkbox" id="chkSafe" ${labState.safeHavenShield ? 'checked' : ''} />
              <span><strong>Keller 13612W 카나리아</strong> 위기 안전자산 로테이션 (금현물 411060·SGOL 피난)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer">
              <input type="checkbox" id="chkPark" ${labState.cashParkSweep ? 'checked' : ''} />
              <span><strong>무위험 단기채 복리 파킹</strong> (관망 구간 272580·USFR 일복리 이자 회수)</span>
            </label>
          </div>

          <button id="btnApplyLabToWs" class="btn btn-primary" style="margin-top:auto">이 비중을 내 실제 워크스페이스에 적용하기</button>
        </section>

        <!-- Metrics & Yearly Table -->
        <section class="card" style="display:flex;flex-direction:column;gap:14px">
          ${sim.ok ? `
            <div class="kpi-strip" style="padding-top:0;border-top:none">
              <div class="kpi-item">
                <span class="kpi-lbl">총 투입 원금</span>
                <span class="kpi-val mono">${fmtMoneyFromKrw(sim.wealth.principalKrw)}</span>
              </div>
              <div class="kpi-item">
                <span class="kpi-lbl">Steward SOTA 최종자산</span>
                <span class="kpi-val mono pos">${fmtMoneyFromKrw(sim.wealth.finalSotaKrw)}</span>
              </div>
              <div class="kpi-item">
                <span class="kpi-lbl">S&amp;P 500 적립 시</span>
                <span class="kpi-val mono">${fmtMoneyFromKrw(sim.wealth.finalSpyKrw)}</span>
              </div>
              <div class="kpi-item">
                <span class="kpi-lbl">S&amp;P 500 대비 초과자산</span>
                <span class="kpi-val mono ${sim.wealth.excessVsSpyKrw >= 0 ? 'pos' : 'neg'}">${sim.wealth.excessVsSpyKrw >= 0 ? '+' : ''}${fmtMoneyFromKrw(sim.wealth.excessVsSpyKrw)}</span>
              </div>
            </div>

            <table class="data-table">
              <thead>
                <tr>
                  <th>지표 (시간가중 수익률 기준)</th>
                  <th class="r-align">Steward v5.0 SOTA</th>
                  <th class="r-align">S&amp;P 500 (SPY)</th>
                </tr>
              </thead>
              <tbody class="mono">
                <tr><td>누적 수익률</td><td class="r-align pos"><strong>+${sim.sotaStats.totalRetPct}%</strong></td><td class="r-align">+${sim.spyStats.totalRetPct}%</td></tr>
                <tr><td>연평균 복리(CAGR)</td><td class="r-align pos"><strong>+${sim.sotaStats.cagrPct}%</strong></td><td class="r-align">+${sim.spyStats.cagrPct}%</td></tr>
                <tr><td>최대 낙폭(MaxDD)</td><td class="r-align"><strong>${sim.sotaStats.maxDdPct}%</strong></td><td class="r-align neg">${sim.spyStats.maxDdPct}%</td></tr>
                <tr><td>Sharpe / Sortino</td><td class="r-align"><strong>${sim.sotaStats.sharpe} / ${sim.sotaStats.sortino}</strong></td><td class="r-align">${sim.spyStats.sharpe} / ${sim.spyStats.sortino}</td></tr>
                <tr><td>Calmar (수익/낙폭비)</td><td class="r-align pos"><strong>${sim.sotaStats.calmar}</strong></td><td class="r-align">${sim.spyStats.calmar}</td></tr>
              </tbody>
            </table>

            <div style="font-size:12px;font-weight:700;color:var(--text-muted)">연도별 초과수익(Alpha) 기록</div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
              ${sim.yearly.map((y) => `
                <div style="background:var(--bg-sub);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
                  <div style="font-size:11px;color:var(--text-muted);font-weight:700">${y.year}</div>
                  <div class="mono" style="font-size:12.5px;font-weight:800;margin-top:2px">${y.sotaPct >= 0 ? '+' : ''}${y.sotaPct}%</div>
                  <div class="mono ${y.alphaPct >= 0 ? 'pos' : 'neg'}" style="font-size:10.5px">α ${y.alphaPct >= 0 ? '+' : ''}${y.alphaPct}%p</div>
                </div>
              `).join('')}
            </div>
          ` : '<div>백테스트 데이터를 불러오는 중입니다...</div>'}
        </section>
      </div>

      <!-- Dual Interactive Charts: Wealth Growth + Underwater Drawdown -->
      <section class="card">
        <div class="card-header">
          <div>
            <div class="card-title">자산 성장 곡선 (실선: Steward SOTA · 점선: S&amp;P 500 · 보라점선: 누적 납입원금)</div>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas id="labEquityCanvas"></canvas>
          <div id="labEquityTooltip" class="chart-tooltip"></div>
        </div>
        <div style="margin-top:16px;font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:6px">낙폭 깊이 비교 (Underwater Drawdown — 녹색 영역: SOTA vs 적색 실선: S&amp;P 500)</div>
        <div class="chart-wrap-sm">
          <canvas id="labUnderwaterCanvas"></canvas>
        </div>
      </section>
    `;

    if (sim.ok) {
      Charts.renderEquityChart(
        document.getElementById('labEquityCanvas'),
        document.getElementById('labEquityTooltip'),
        sim.series,
        {
          showPrincipal: labState.monthlyDcaKrw > 0,
          formatMoney: (v) => fmtMoneyFromKrw(v, false),
          compactAxis: (v) => fmtMoneyFromKrw(v, true),
        },
      );
      Charts.renderUnderwaterChart(document.getElementById('labUnderwaterCanvas'), sim.series);
    }

    const bindLabInputs = () => {
      const ids = ['labInit', 'labDca', 'labWKr', 'labWUs', 'labWCr', 'chkVol', 'chkSafe', 'chkPark'];
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.onchange = () => {
          labState.initialKrw = Math.max(100000, Number(document.getElementById('labInit').value) || 10000000);
          labState.monthlyDcaKrw = Math.max(0, Number(document.getElementById('labDca').value) || 0);
          labState.wKr = Number(document.getElementById('labWKr').value);
          labState.wUs = Number(document.getElementById('labWUs').value);
          labState.wCr = Number(document.getElementById('labWCr').value);
          labState.volManaged = document.getElementById('chkVol').checked;
          labState.safeHavenShield = document.getElementById('chkSafe').checked;
          labState.cashParkSweep = document.getElementById('chkPark').checked;
          renderLab(container);
        };
      });
    };
    bindLabInputs();

    const applyBtn = document.getElementById('btnApplyLabToWs');
    if (applyBtn) {
      applyBtn.onclick = () => {
        const ws = getActiveWorkspace();
        ws.profileId = 'CUSTOM';
        ws.weights = Engine.normalizeWeights({ KR_STOCK: labState.wKr, US_STOCK: labState.wUs, CRYPTO: labState.wCr });
        ws.monthlyDcaKrw = labState.monthlyDcaKrw;
        ws.autoCashPark = labState.cashParkSweep;
        persistAndScheduleSync();
        currentView = 'overview';
        renderAll();
        showToast('백테스트 비중과 적립금이 내 워크스페이스에 반영되었습니다.');
      };
    }
  }

  /* ── VIEW 5: AUTOMATION & CLOUD SYNC ───────────────────────────────────── */
  function renderConnect(container) {
    const lt = liveFeed?.liveTrack || {};
    container.innerHTML = `
      <div class="two-grid">
        <section class="card" style="display:flex;flex-direction:column;gap:16px">
          <div>
            <div class="card-title">멀티디바이스 클라우드 워크스페이스 및 백업</div>
            <div class="card-subtitle">PC와 스마트폰 어디서든 내 자산 구성과 장기보유 잠금 설정을 암호화 동기화합니다.</div>
          </div>

          ${currentUser ? `
            <div style="padding:16px;background:var(--accent-soft);border:1px solid var(--accent-border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
              <div>
                <div style="font-weight:700">연결된 계정: ${esc(currentUser.email || currentUser.id)}</div>
                <div style="font-size:12px;color:var(--text-secondary)">모든 변경사항이 Supabase Auth 개인 메타데이터 금고에 실시간 자동 저장됩니다.</div>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-sm" id="btnForcePushCloud">지금 동기화</button>
                <button class="btn btn-danger btn-sm" id="btnSignOut">로그아웃</button>
              </div>
            </div>
          ` : `
            <div style="padding:16px;background:var(--bg-sub);border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
              <div>
                <div style="font-weight:700">현재 브라우저 로컬 저장 모드입니다</div>
                <div style="font-size:12px;color:var(--text-muted)">계정을 연결하면 다른 기기에서도 동일한 포트폴리오를 이어서 관리할 수 있습니다.</div>
              </div>
              <button class="btn btn-primary" data-action="open-auth">이메일 또는 소셜 로그인</button>
            </div>
          `}

          <div style="padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:700;font-size:13px">JSON 포트폴리오 파일 백업 및 복원</div>
              <div style="font-size:12px;color:var(--text-muted)">클라우드 없이도 파일 하나로 내 전체 워크스페이스를 보관하거나 옮길 수 있습니다.</div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm" id="btnExportJson">JSON 내보내기</button>
              <label class="btn btn-sm" style="cursor:pointer">
                JSON 불러오기
                <input type="file" id="inpImportJson" accept="application/json" style="display:none" />
              </label>
            </div>
          </div>
        </section>

        <section class="card" style="display:flex;flex-direction:column;gap:16px">
          <div>
            <div class="card-title">엔진 실계좌 검증 트랙 (Skin-in-the-Game Live Proof)</div>
            <div class="card-subtitle">이 워크벤치의 모든 시그널은 실제 한국투자증권(국내, 미국) 및 빗썸 실계좌를 자율 운용하는 동일 엔진에서 생성됩니다.</div>
          </div>

          <div class="kpi-strip" style="padding-top:0;border-top:none">
            <div class="kpi-item">
              <span class="kpi-lbl">실전 지수 (기준 100)</span>
              <span class="kpi-val mono">${lt.navIndexBase100 ?? 98.38}</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-lbl">월간 서바이벌 한도</span>
              <span class="kpi-val mono">${lt.monthlyHardStopPct ?? -5.0}% 하드스탑</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-lbl">브로커 원장 대사</span>
              <span class="kpi-val pos">정상 (유령잔고 0)</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-lbl">유료 LLM 과금</span>
              <span class="kpi-val pos mono">$0.0000</span>
            </div>
          </div>

          <div style="background:var(--bg-sub);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:12.5px;display:flex;flex-direction:column;gap:8px">
            <div><strong>정기 리밸런싱 심의 시각 (알림 기준)</strong></div>
            <div>국내주식(KRX): <code>평일 09:08 / 11:30 / 14:35 KST</code> (100% 실물 및 액티브 ETF)</div>
            <div>미국주식(US): <code>평일 09:38 / 12:30 / 15:15 ET</code> (서머타임 자동 반영)</div>
            <div>디지털자산(Crypto): <code>24/7 4시간 주기 심의 + 1분 상시 손절/익절 감시</code></div>
          </div>
        </section>
      </div>
    `;

    const expBtn = document.getElementById('btnExportJson');
    if (expBtn) {
      expBtn.onclick = () => {
        const blob = new Blob([JSON.stringify(appState, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `steward-quant-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        showToast('포트폴리오 백업 JSON 파일이 다운로드되었습니다.');
      };
    }

    const impInp = document.getElementById('inpImportJson');
    if (impInp) {
      impInp.onchange = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(String(reader.result));
            if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
              appState = parsed;
              persistAndScheduleSync();
              renderAll();
              showToast('백업 파일에서 워크스페이스가 복원되었습니다.');
            }
          } catch {
            showToast('유효한 백업 JSON 파일이 아닙니다.');
          }
        };
        reader.readAsText(f);
      };
    }

    const pushBtn = document.getElementById('btnForcePushCloud');
    if (pushBtn) {
      pushBtn.onclick = async () => {
        try {
          await Cloud.pushStateToCloud(appState);
          showToast('클라우드 동기화가 완료되었습니다.');
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    const outBtn = document.getElementById('btnSignOut');
    if (outBtn) {
      outBtn.onclick = () => {
        Cloud.signOut();
        currentUser = null;
        renderAll();
        showToast('로그아웃되었습니다. 로컬 워크스페이스는 그대로 유지됩니다.');
      };
    }

    bindCommonViewTriggers(container);
  }

  /* ── SLIDE-OVER DOSSIER DRAWER ─────────────────────────────────────────── */
  function openAssetDossier(bookKey, symbol) {
    const asset = (liveFeed?.books?.[bookKey]?.assets || []).find((a) => a.symbol === symbol);
    const backdrop = document.getElementById('dossierBackdrop');
    const drawer = document.getElementById('dossierDrawer');
    if (!asset || !backdrop || !drawer) return;

    const famEntries = Object.entries(asset.familyScores || {});
    drawer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <div style="font-size:12px;color:var(--text-muted);font-weight:600">${BOOK_META[bookKey].label} / ${esc(asset.exchange)}</div>
          <h2 style="font-size:20px;font-weight:700;margin-top:2px">${esc(asset.name)} <span class="mono" style="color:var(--text-muted)">(${esc(asset.symbol)})</span></h2>
        </div>
        <button type="button" class="btn btn-sm" id="btnCloseDossier">닫기</button>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:12px 14px;background:var(--bg-sub);border-radius:12px;border:1px solid var(--border)">
        <div>
          <div style="font-size:11px;color:var(--text-muted)">현재가</div>
          <div class="mono" style="font-size:24px;font-weight:900">${fmtNative(asset.price, asset.currency)}</div>
        </div>
        <div style="text-align:right">
          <span class="tag ${asset.action === 'BUY' ? 'tag-buy' : (asset.isCashPark ? 'tag-park' : '')}">${esc(asset.action)} · ${esc(asset.tradeStyle)}</span>
          <div class="mono" style="font-size:12px;margin-top:4px">확신도 <strong>${asset.convictionPct}%</strong> · 순기대 <strong>${asset.expectedNetBps >= 0 ? '+' : ''}${asset.expectedNetBps}bps</strong></div>
        </div>
      </div>

      <div style="padding:12px 14px;background:var(--accent-soft);border:1px solid var(--accent-border);border-radius:10px;font-size:12.5px">
        <div style="font-weight:800;margin-bottom:3px;color:var(--accent)">반증 가능 SOTA 투자 논거 (Falsifiable Thesis)</div>
        <div>${esc(asset.thesis)}</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px" class="mono">
        <div style="background:var(--bg-sub);padding:9px;border-radius:8px;border:1px solid var(--border)">
          <div style="color:var(--text-muted);font-size:10.5px">Clenow 회귀샤프</div>
          <strong>${asset.sota.clenowRegSharpe63}</strong>
        </div>
        <div style="background:var(--bg-sub);padding:9px;border-radius:8px;border:1px solid var(--border)">
          <div style="color:var(--text-muted);font-size:10.5px">Keller 13612W</div>
          <strong>${asset.sota.kellerMom13612}</strong>
        </div>
        <div style="background:var(--bg-sub);padding:9px;border-radius:8px;border:1px solid var(--border)">
          <div style="color:var(--text-muted);font-size:10.5px">20일 연환산변동성</div>
          <strong>${asset.sota.annVol20Pct}%</strong>
        </div>
        <div style="background:var(--bg-sub);padding:9px;border-radius:8px;border:1px solid var(--border)">
          <div style="color:var(--text-muted);font-size:10.5px">하드 손절폭</div>
          <strong class="neg">-${asset.stopLossPct}%</strong>
        </div>
        <div style="background:var(--bg-sub);padding:9px;border-radius:8px;border:1px solid var(--border)">
          <div style="color:var(--text-muted);font-size:10.5px">트레일링 이익잠금</div>
          <strong class="pos">+${asset.trailingActivatePct}%</strong>
        </div>
        <div style="background:var(--bg-sub);padding:9px;border-radius:8px;border:1px solid var(--border)">
          <div style="color:var(--text-muted);font-size:10.5px">권장 보유주기</div>
          <strong>${Math.round(asset.timeHorizonHours / 24)}일</strong>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="font-size:12px;font-weight:800;color:var(--text-muted)">9대 패밀리 팩터 정규화 스코어 (-1.0 ~ +1.0)</div>
        ${famEntries.map(([fam, val]) => {
          const pct = Math.min(50, Math.abs(val) * 50);
          const left = val >= 0 ? 50 : 50 - pct;
          const col = val >= 0 ? 'var(--accent)' : 'var(--danger)';
          return `
            <div class="factor-bar-row">
              <span style="color:var(--text-secondary)">${esc(FAMILY_LABELS[fam] || fam)}</span>
              <div class="factor-track">
                <div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--border-strong)"></div>
                <div class="factor-fill" style="left:${left}%;width:${pct}%;background:${col}"></div>
              </div>
              <span class="mono r-align ${val >= 0 ? 'pos' : 'neg'}">${val >= 0 ? '+' : ''}${val.toFixed(2)}</span>
            </div>
          `;
        }).join('')}
      </div>

      <button class="btn btn-primary" id="btnQuickAddFromDossier">내 포트폴리오 보유종목에 추가하기</button>
    `;

    backdrop.classList.add('open');
    document.getElementById('btnCloseDossier').onclick = () => backdrop.classList.remove('open');
    document.getElementById('btnQuickAddFromDossier').onclick = () => {
      openCustomDialog({
        title: `${asset.name} (${asset.symbol}) 내 자산에 추가`,
        subtitle: `현재가 ${fmtNative(asset.price, asset.currency)} 기준 보유 수량과 평단가를 입력하세요.`,
        fields: [
          { name: 'qty', label: `보유 수량 (${bookKey === 'CRYPTO' ? '개' : '주'})`, type: 'number', value: '1', required: true },
          { name: 'avgPrice', label: `평균 매입단가 (${asset.currency})`, type: 'number', value: String(asset.price) },
        ],
        submitLabel: '보유종목에 추가',
        onSubmit: (vals) => {
          const qty = Number(vals.qty || 0);
          if (!(qty > 0)) return;
          const ws = getActiveWorkspace();
          ws.books[bookKey].holdings.push({
            symbol: asset.symbol,
            name: asset.name,
            qty,
            avgPrice: Number(vals.avgPrice || 0) || asset.price,
            locked: false,
          });
          ws.monthlyBaselineKrw = 0;
          persistAndScheduleSync();
          backdrop.classList.remove('open');
          renderAll();
          showToast(`${asset.symbol} ${qty}${bookKey === 'CRYPTO' ? '개' : '주'}가 내 자산에 추가되었습니다.`);
        },
      });
    };
  }

  function openCustomDialog({ title, subtitle, fields = [], submitLabel = '확인', onSubmit }) {
    const backdrop = document.getElementById('customDialogBackdrop');
    const modal = document.getElementById('customDialogModal');
    if (!backdrop || !modal) return;

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:15.5px;font-weight:700">${esc(title)}</h3>
        <button type="button" class="btn btn-sm" id="btnCloseCustomDialog">닫기</button>
      </div>
      ${subtitle ? `<div style="font-size:12px;color:var(--text-muted)">${esc(subtitle)}</div>` : ''}
      <form id="customDialogForm" style="display:flex;flex-direction:column;gap:10px">
        ${fields.map((f) => `
          <div class="field">
            <label>${esc(f.label)}</label>
            ${f.type === 'textarea'
              ? `<textarea class="input mono" name="${esc(f.name)}" rows="5" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''}>${esc(f.value || '')}</textarea>`
              : `<input class="input mono" type="${esc(f.type || 'text')}" step="any" name="${esc(f.name)}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''} />`
            }
          </div>
        `).join('')}
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px">
          <button type="button" class="btn" id="btnCancelCustomDialog">취소</button>
          <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
        </div>
      </form>
    `;

    backdrop.classList.add('open');
    const close = () => backdrop.classList.remove('open');
    document.getElementById('btnCloseCustomDialog').onclick = close;
    document.getElementById('btnCancelCustomDialog').onclick = close;
    const form = document.getElementById('customDialogForm');
    form.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const vals = {};
      for (const f of fields) vals[f.name] = String(fd.get(f.name) ?? '');
      close();
      if (onSubmit) onSubmit(vals);
    };
    const firstInput = form.querySelector('input, textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 20);
  }

  /* ── PRESET MODAL & AUTH MODAL & COMMAND PALETTE ───────────────────────── */
  function openPresetModal(createNew = false) {
    const backdrop = document.getElementById('presetBackdrop');
    const modal = document.getElementById('presetModal');
    if (!backdrop || !modal) return;

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:16px;font-weight:700">${createNew ? '새 포트폴리오 워크스페이스 추가' : '포트폴리오 시작 템플릿 선택'}</h3>
        <button type="button" class="btn btn-sm" id="btnClosePreset">닫기</button>
      </div>
      <div style="font-size:12.5px;color:var(--text-muted)">원하는 규모를 선택하면 즉시 샘플 자산이 채워지며, 이후 내 실제 잔고로 자유롭게 수정할 수 있습니다.</div>
      <div style="display:flex;flex-direction:column;gap:9px">
        ${Object.values(Engine.STARTER_PRESETS).map((p) => `
          <button class="profile-option" data-pick-preset="${p.id}">
            <div style="font-weight:800;font-size:13.8px">${esc(p.label)}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${esc(p.desc)}</div>
          </button>
        `).join('')}
      </div>
    `;
    backdrop.classList.add('open');
    document.getElementById('btnClosePreset').onclick = () => backdrop.classList.remove('open');
    modal.querySelectorAll('[data-pick-preset]').forEach((btn) => {
      btn.onclick = () => {
        const pid = btn.getAttribute('data-pick-preset');
        const nextWs = Engine.createDefaultWorkspace(pid);
        if (createNew) {
          nextWs.id = `ws_${Date.now()}`;
          appState.workspaces.push(nextWs);
          appState.activeWorkspaceId = nextWs.id;
        } else {
          const cur = getActiveWorkspace();
          nextWs.id = cur.id;
          const idx = appState.workspaces.findIndex((w) => w.id === cur.id);
          appState.workspaces[idx] = nextWs;
        }
        persistAndScheduleSync();
        backdrop.classList.remove('open');
        renderAll();
        showToast(`'${nextWs.name}' 템플릿이 적용되었습니다.`);
      };
    });
  }

  function openAuthModal() {
    const backdrop = document.getElementById('authBackdrop');
    const modal = document.getElementById('authModal');
    if (!backdrop || !modal) return;

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:16px;font-weight:700">클라우드 워크스페이스 동기화</h3>
        <button type="button" class="btn btn-sm" id="btnCloseAuth">닫기</button>
      </div>
      <div style="font-size:12.5px;color:var(--text-muted)">이메일 즉시 가입(별도 메일 인증 대기 없음) 또는 소셜 계정으로 PC와 모바일 간 내 포트폴리오를 자동 동기화합니다.</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button type="button" class="btn" id="btnOAuthGoogle">Google 계정으로 계속</button>
        <button type="button" class="btn" id="btnOAuthKakao">Kakao 계정으로 계속</button>
      </div>

      <div style="text-align:center;font-size:11px;color:var(--text-muted)">또는 이메일로 3초 시작</div>

      <form id="authForm" style="display:flex;flex-direction:column;gap:10px">
        <div class="field">
          <label>이메일</label>
          <input class="input" type="email" name="email" placeholder="you@example.com" required />
        </div>
        <div class="field">
          <label>비밀번호 (6자 이상)</label>
          <input class="input" type="password" name="password" minlength="6" placeholder="••••••" required />
        </div>
        <div id="authErrMsg" class="neg" style="font-size:12px;display:none"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
          <button type="submit" data-mode="signin" class="btn btn-primary">로그인 &amp; 동기화</button>
          <button type="button" id="btnSignUpSubmit" class="btn">신규 즉시 가입</button>
        </div>
      </form>
    `;

    backdrop.classList.add('open');
    document.getElementById('btnCloseAuth').onclick = () => backdrop.classList.remove('open');
    document.getElementById('btnOAuthGoogle').onclick = () => Cloud.startOAuthLogin('google');
    document.getElementById('btnOAuthKakao').onclick = () => Cloud.startOAuthLogin('kakao');

    const form = document.getElementById('authForm');
    const errEl = document.getElementById('authErrMsg');
    const handleAuth = async (isSignUp) => {
      errEl.style.display = 'none';
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const pw = String(fd.get('password') || '');
      try {
        if (isSignUp) await Cloud.signUpEmail(email, pw);
        else await Cloud.signInEmail(email, pw);
        currentUser = await Cloud.fetchCurrentUser();
        const pulled = await Cloud.pullStateFromCloud();
        if (pulled && pulled.workspaces?.length) {
          appState = { ...appState, ...pulled };
          Cloud.saveLocalState(appState);
        } else {
          await Cloud.pushStateToCloud(appState);
        }
        backdrop.classList.remove('open');
        renderAll();
        showToast(`환영합니다! 클라우드 동기화가 활성화되었습니다.`);
      } catch (err) {
        errEl.textContent = err.message || String(err);
        errEl.style.display = 'block';
      }
    };

    form.onsubmit = (e) => { e.preventDefault(); handleAuth(false); };
    document.getElementById('btnSignUpSubmit').onclick = () => handleAuth(true);
  }

  function openCommandPalette() {
    const backdrop = document.getElementById('cmdBackdrop');
    const inp = document.getElementById('cmdInput');
    const resEl = document.getElementById('cmdResults');
    if (!backdrop || !inp || !resEl) return;

    const renderCmdList = (q = '') => {
      const query = q.trim().toLowerCase();
      const items = [
        { label: '통합 자산 홈으로 이동', sub: 'Overview', run: () => { currentView = 'overview'; renderAll(); } },
        { label: '내 자산 입력 & 리밸런서 열기', sub: 'Portfolio', run: () => { currentView = 'portfolio'; renderAll(); } },
        { label: 'SOTA 131팩터 시그널 레이더 열기', sub: 'Signals', run: () => { currentView = 'signals'; renderAll(); } },
        { label: '4년 Walk-Forward 적립식 백테스터 열기', sub: 'Strategy Lab', run: () => { currentView = 'lab'; renderAll(); } },
        { label: '표시 통화 전환 (KRW ↔ USD)', sub: 'Currency', run: () => { appState.currencyMode = appState.currencyMode === 'KRW' ? 'USD' : 'KRW'; persistAndScheduleSync(); renderAll(); } },
        { label: '다크 / 라이트 테마 전환', sub: 'Theme', run: () => { applyTheme(appState.theme === 'dark' ? 'light' : 'dark'); persistAndScheduleSync(); renderAll(); } },
      ];
      for (const bk of ['KR_STOCK', 'US_STOCK', 'CRYPTO']) {
        for (const a of liveFeed?.books?.[bk]?.assets || []) {
          items.push({
            label: `${BOOK_META[bk].icon} ${a.name} (${a.symbol})`,
            sub: `${a.action} · 점수 ${a.rankScore.toFixed(2)}`,
            run: () => openAssetDossier(bk, a.symbol),
          });
        }
      }
      const matched = items.filter((it) => !query || it.label.toLowerCase().includes(query) || it.sub.toLowerCase().includes(query)).slice(0, 12);
      resEl.innerHTML = matched.map((it, i) => `
        <button class="cmd-item" data-cmd-idx="${i}">
          <span>${esc(it.label)}</span>
          <span class="mono" style="font-size:11px;color:var(--text-muted)">${esc(it.sub)}</span>
        </button>
      `).join('');
      resEl.querySelectorAll('[data-cmd-idx]').forEach((b) => {
        b.onclick = () => {
          backdrop.classList.remove('open');
          matched[Number(b.getAttribute('data-cmd-idx'))]?.run();
        };
      });
    };

    inp.value = '';
    renderCmdList('');
    backdrop.classList.add('open');
    setTimeout(() => inp.focus(), 20);
    inp.oninput = () => renderCmdList(inp.value);
  }

  function bindCommonViewTriggers(scope) {
    scope.querySelectorAll('[data-open-dossier]').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const [bk, sym] = el.getAttribute('data-open-dossier').split(':');
        openAssetDossier(bk, sym);
      };
    });
    scope.querySelectorAll('[data-action="go-portfolio"]').forEach((el) => {
      el.onclick = () => { currentView = 'portfolio'; renderAll(); };
    });
    scope.querySelectorAll('[data-action="go-overview"]').forEach((el) => {
      el.onclick = () => { currentView = 'overview'; renderAll(); };
    });
    scope.querySelectorAll('[data-action="go-lab"]').forEach((el) => {
      el.onclick = () => { currentView = 'lab'; renderAll(); };
    });
    scope.querySelectorAll('[data-action="open-presets"]').forEach((el) => {
      el.onclick = () => openPresetModal(false);
    });
    scope.querySelectorAll('[data-action="open-auth"]').forEach((el) => {
      el.onclick = () => openAuthModal();
    });
  }

  /* ── GLOBAL BOOTSTRAP ──────────────────────────────────────────────────── */
  async function boot() {
    applyTheme(appState.theme || 'dark');

    // Global Navigation
    document.querySelectorAll('[data-view]').forEach((btn) => {
      btn.onclick = () => {
        currentView = btn.getAttribute('data-view');
        renderAll();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });

    // Currency Switch
    document.querySelectorAll('[data-currency]').forEach((btn) => {
      btn.onclick = () => {
        appState.currencyMode = btn.getAttribute('data-currency');
        persistAndScheduleSync();
        renderAll();
      };
    });

    // Workspace Switch & Add
    const wsSel = document.getElementById('wsSelect');
    if (wsSel) {
      wsSel.onchange = () => {
        appState.activeWorkspaceId = wsSel.value;
        persistAndScheduleSync();
        renderAll();
      };
    }
    document.getElementById('btnNewWs').onclick = () => openPresetModal(true);
    document.getElementById('btnThemeToggle').onclick = () => {
      applyTheme(appState.theme === 'dark' ? 'light' : 'dark');
      persistAndScheduleSync();
      renderAll();
    };
    document.getElementById('btnOpenAuth').onclick = () => {
      if (currentUser) {
        currentView = 'connect';
        renderAll();
      } else {
        openAuthModal();
      }
    };
    document.getElementById('btnRefreshFeed').onclick = () => loadFeed(true);
    document.getElementById('btnCmdPalette').onclick = () => openCommandPalette();

    // Backdrop click-outside & Keyboard shortcuts (⌘K, Esc)
    ['dossierBackdrop', 'presetBackdrop', 'authBackdrop', 'cmdBackdrop', 'customDialogBackdrop'].forEach((id) => {
      const bd = document.getElementById(id);
      if (bd) {
        bd.onclick = (e) => {
          if (e.target === bd) bd.classList.remove('open');
        };
      }
    });

    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandPalette();
      } else if (e.key === 'Escape') {
        document.querySelectorAll('.backdrop.open').forEach((b) => b.classList.remove('open'));
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (currentView === 'overview' || currentView === 'lab') renderAll();
      }, 150);
    });

    // Capture OAuth return or restore cloud session
    Cloud.captureOAuthHashSession();
    loadFeed(false);

    const user = await Cloud.fetchCurrentUser();
    if (user) {
      currentUser = user;
      const cloudData = await Cloud.pullStateFromCloud();
      if (cloudData && Array.isArray(cloudData.workspaces) && cloudData.workspaces.length > 0) {
        if ((cloudData.updatedAt || 0) > (appState.updatedAt || 0)) {
          appState = { ...appState, ...cloudData };
          Cloud.saveLocalState(appState);
        }
      }
      renderAll();
    }
  }

  boot();
}());
