'use strict';

/**
 * Steward Quant SaaS — Isomorphic Multi-Asset Portfolio, Rebalancing & Walk-Forward Engine
 * (Runs identically in Node.js for unit tests & in Browser via `window.StewardQuantEngine`)
 */
(function initStewardQuantEngine(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StewardQuantEngine = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildEngine() {
  const RISK_PROFILES = {
    CONSERVATIVE: {
      id: 'CONSERVATIVE',
      label: '안정 방어형',
      subtitle: '단기채·우량 지수 중심 · 변동성 최소화',
      weights: { KR_STOCK: 45, US_STOCK: 45, CRYPTO: 10 },
      allowLeverage2x: false,
      monthlyStopPct: -3.5,
      cryptoMaxSlots: 1,
      equityMaxSlots: 2,
    },
    BALANCED_SOTA: {
      id: 'BALANCED_SOTA',
      label: 'S&P 추월 표준형 (SOTA 권장)',
      subtitle: '4년 OOS 연평균 +23.97% · MaxDD -15.60%',
      weights: { KR_STOCK: 43, US_STOCK: 32, CRYPTO: 25 },
      allowLeverage2x: true,
      monthlyStopPct: -5.0,
      cryptoMaxSlots: 2,
      equityMaxSlots: 2,
    },
    AGGRESSIVE: {
      id: 'AGGRESSIVE',
      label: '초과알파 집중형',
      subtitle: '미국 모멘텀·크립토 돌파 비중 확대',
      weights: { KR_STOCK: 30, US_STOCK: 40, CRYPTO: 30 },
      allowLeverage2x: true,
      monthlyStopPct: -7.0,
      cryptoMaxSlots: 2,
      equityMaxSlots: 2,
    },
    CUSTOM: {
      id: 'CUSTOM',
      label: '사용자 직접 설정',
      subtitle: '3대 자산 목표 비중 커스텀 운용',
      weights: { KR_STOCK: 40, US_STOCK: 40, CRYPTO: 20 },
      allowLeverage2x: true,
      monthlyStopPct: -5.0,
      cryptoMaxSlots: 2,
      equityMaxSlots: 2,
    },
  };

  const STARTER_PRESETS = {
    STARTER_1M: {
      id: 'STARTER_1M',
      label: '소액 실전 시작 (100만원)',
      desc: '국내 45만 · 미국 $250 · 코인 20만원 (온주 제약 자동 최적화)',
      workspace: {
        name: '내 100만원 퀀트 포트폴리오',
        profileId: 'BALANCED_SOTA',
        weights: { KR_STOCK: 45, US_STOCK: 35, CRYPTO: 20 },
        monthlyDcaKrw: 300000,
        monthlyBaselineKrw: 1000000,
        monthlyStopPct: -5.0,
        autoCashPark: true,
        books: {
          KR_STOCK: { cashKrw: 450000, holdings: [] },
          US_STOCK: { cashUsd: 260, holdings: [] },
          CRYPTO: { cashKrw: 200000, feeBps: 8, holdings: [] },
        },
      },
    },
    STANDARD_10M: {
      id: 'STANDARD_10M',
      label: '직장인 표준 포트폴리오 (1,000만원)',
      desc: '국내 ETF 430만 · 미국 $2,400 · 코인 250만원 + 장기보유 잠금 예시',
      workspace: {
        name: '1,000만원 SOTA 표준 워크스페이스',
        profileId: 'BALANCED_SOTA',
        weights: { KR_STOCK: 43, US_STOCK: 32, CRYPTO: 25 },
        monthlyDcaKrw: 1000000,
        monthlyBaselineKrw: 10000000,
        monthlyStopPct: -5.0,
        autoCashPark: true,
        books: {
          KR_STOCK: {
            cashKrw: 2150000,
            holdings: [
              { symbol: '379800', name: 'KODEX 미국S&P500', qty: 100, avgPrice: 21200, locked: false },
            ],
          },
          US_STOCK: {
            cashUsd: 1650,
            holdings: [
              { symbol: 'NVDA', name: 'NVIDIA (장기보유 잠금)', qty: 5, avgPrice: 128.5, locked: true },
            ],
          },
          CRYPTO: {
            cashKrw: 2500000,
            feeBps: 8,
            holdings: [],
          },
        },
      },
    },
    GROWTH_50M: {
      id: 'GROWTH_50M',
      label: '자산증식 집중형 (5,000만원)',
      desc: '국내 2,000만 · 미국 $14,800 · 코인 1,000만원 바벨 운용',
      workspace: {
        name: '5,000만원 멀티에셋 알파 운용',
        profileId: 'AGGRESSIVE',
        weights: { KR_STOCK: 40, US_STOCK: 40, CRYPTO: 20 },
        monthlyDcaKrw: 2500000,
        monthlyBaselineKrw: 50000000,
        monthlyStopPct: -5.0,
        autoCashPark: true,
        books: {
          KR_STOCK: { cashKrw: 20000000, holdings: [] },
          US_STOCK: { cashUsd: 14850, holdings: [] },
          CRYPTO: { cashKrw: 10000000, feeBps: 8, holdings: [] },
        },
      },
    },
    EMPTY_CUSTOM: {
      id: 'EMPTY_CUSTOM',
      label: '빈 계좌에서 내 자산 직접 입력',
      desc: '현재 보유 현금과 종목을 0원에서부터 직접 입력합니다',
      workspace: {
        name: '내 자산 워크스페이스',
        profileId: 'BALANCED_SOTA',
        weights: { KR_STOCK: 43, US_STOCK: 32, CRYPTO: 25 },
        monthlyDcaKrw: 500000,
        monthlyBaselineKrw: 0,
        monthlyStopPct: -5.0,
        autoCashPark: true,
        books: {
          KR_STOCK: { cashKrw: 0, holdings: [] },
          US_STOCK: { cashUsd: 0, holdings: [] },
          CRYPTO: { cashKrw: 0, feeBps: 8, holdings: [] },
        },
      },
    },
  };

  function roundKrTick(price, isEtf = true) {
    const px = Number(price) || 0;
    if (px <= 0) return 0;
    if (isEtf) return Math.max(5, Math.round(px / 5) * 5);
    if (px < 2000) return Math.round(px);
    if (px < 5000) return Math.round(px / 5) * 5;
    if (px < 20000) return Math.round(px / 10) * 10;
    if (px < 50000) return Math.round(px / 50) * 50;
    if (px < 200000) return Math.round(px / 100) * 100;
    if (px < 500000) return Math.round(px / 500) * 500;
    return Math.round(px / 1000) * 1000;
  }

  function roundUsTick(price) {
    const px = Number(price) || 0;
    if (px <= 0) return 0;
    return px >= 1 ? Number(px.toFixed(2)) : Number(px.toFixed(4));
  }

  function roundCryptoTick(price) {
    const px = Number(price) || 0;
    if (px <= 0) return 0;
    if (px >= 1000000) return Math.round(px / 1000) * 1000;
    if (px >= 500000) return Math.round(px / 500) * 500;
    if (px >= 100000) return Math.round(px / 100) * 100;
    if (px >= 50000) return Math.round(px / 50) * 50;
    if (px >= 10000) return Math.round(px / 10) * 10;
    if (px >= 5000) return Math.round(px / 5) * 5;
    if (px >= 100) return Math.round(px);
    if (px >= 10) return Number(px.toFixed(1));
    return Number(px.toFixed(2));
  }

  function createDefaultWorkspace(presetId = 'STANDARD_10M') {
    const preset = STARTER_PRESETS[presetId] || STARTER_PRESETS.STANDARD_10M;
    return JSON.parse(JSON.stringify({
      version: 5,
      updatedAt: Date.now(),
      executedOrderIds: [],
      ...preset.workspace,
    }));
  }

  function normalizeWeights(w = {}) {
    const kr = Math.max(0, Number(w.KR_STOCK ?? 43));
    const us = Math.max(0, Number(w.US_STOCK ?? 32));
    const cr = Math.max(0, Number(w.CRYPTO ?? 25));
    const sum = kr + us + cr;
    if (sum <= 0) return { KR_STOCK: 43, US_STOCK: 32, CRYPTO: 25 };
    const nKr = Math.round((kr / sum) * 100);
    const nUs = Math.round((us / sum) * 100);
    const nCr = Math.max(0, 100 - nKr - nUs);
    return { KR_STOCK: nKr, US_STOCK: nUs, CRYPTO: nCr };
  }

  function buildPriceLookup(feed) {
    const map = new Map();
    for (const bookKey of ['KR_STOCK', 'US_STOCK', 'CRYPTO']) {
      const list = feed?.books?.[bookKey]?.assets || [];
      for (const item of list) {
        map.set(`${bookKey}:${String(item.symbol).toUpperCase()}`, item);
      }
    }
    return map;
  }

  /**
   * 사용자 워크스페이스 + 실시간 SOTA 피드 -> 개인화 자산평가 · 보호잠금 분리 · 정확한 주문 티켓 산출
   */
  function computePortfolioPlan(workspace = {}, feed = {}) {
    const fx = Number(feed?.fxRateUsdKrw) > 0 ? Number(feed.fxRateUsdKrw) : 1345;
    const profile = RISK_PROFILES[workspace.profileId] || RISK_PROFILES.BALANCED_SOTA;
    const targetWeights = normalizeWeights(workspace.weights || profile.weights);
    const autoCashPark = workspace.autoCashPark !== false;
    const lookup = buildPriceLookup(feed);

    const bookSummaries = {};
    const allHoldingsValued = [];
    let totalNetWorthKrw = 0;
    let totalTradableKrw = 0;
    let totalLockedKrw = 0;
    let totalCashKrw = 0;

    for (const bookKey of ['KR_STOCK', 'US_STOCK', 'CRYPTO']) {
      const rawBook = workspace?.books?.[bookKey] || {};
      const isUsd = bookKey === 'US_STOCK';
      const cashNative = Math.max(0, Number(isUsd ? rawBook.cashUsd : rawBook.cashKrw) || 0);
      const cashKrw = isUsd ? cashNative * fx : cashNative;

      let tradableHoldingsNative = 0;
      let lockedHoldingsNative = 0;
      const valuedHoldings = [];

      for (const h of Array.isArray(rawBook.holdings) ? rawBook.holdings : []) {
        const sym = String(h.symbol || '').trim().toUpperCase();
        const qty = Math.max(0, Number(h.qty) || 0);
        if (!sym || !(qty > 0)) continue;
        const feedAsset = lookup.get(`${bookKey}:${sym}`) || null;
        const avgPx = Math.max(0, Number(h.avgPrice) || Number(feedAsset?.price) || 0);
        const curPx = Number(feedAsset?.price) > 0 ? Number(feedAsset.price) : avgPx;
        const evalNative = qty * curPx;
        const evalKrw = isUsd ? evalNative * fx : evalNative;
        const pnlPct = avgPx > 0 ? ((curPx - avgPx) / avgPx) * 100 : 0;
        const isLocked = Boolean(h.locked);

        if (isLocked) lockedHoldingsNative += evalNative;
        else tradableHoldingsNative += evalNative;

        const row = {
          book: bookKey,
          symbol: sym,
          name: h.name || feedAsset?.name || sym,
          qty,
          avgPrice: avgPx,
          currentPrice: curPx,
          currency: isUsd ? 'USD' : 'KRW',
          evalNative: Number(evalNative.toFixed(isUsd ? 2 : 0)),
          evalKrw: Math.round(evalKrw),
          pnlPct: Number(pnlPct.toFixed(2)),
          locked: isLocked,
          signalAction: feedAsset?.action || 'CUSTOM',
          tradeStyle: feedAsset?.tradeStyle || (isLocked ? 'RING_FENCED' : 'MANUAL'),
          isCashPark: Boolean(feedAsset?.isCashPark),
        };
        valuedHoldings.push(row);
        allHoldingsValued.push(row);
      }

      const totalNative = cashNative + tradableHoldingsNative + lockedHoldingsNative;
      const tradableNative = cashNative + tradableHoldingsNative;
      const bookTotalKrw = isUsd ? totalNative * fx : totalNative;
      const bookTradableKrw = isUsd ? tradableNative * fx : tradableNative;
      const bookLockedKrw = isUsd ? lockedHoldingsNative * fx : lockedHoldingsNative;

      totalNetWorthKrw += bookTotalKrw;
      totalTradableKrw += bookTradableKrw;
      totalLockedKrw += bookLockedKrw;
      totalCashKrw += cashKrw;

      bookSummaries[bookKey] = {
        book: bookKey,
        currency: isUsd ? 'USD' : 'KRW',
        cashNative: Number(cashNative.toFixed(isUsd ? 2 : 0)),
        cashKrw: Math.round(cashKrw),
        tradableNative: Number(tradableNative.toFixed(isUsd ? 2 : 0)),
        tradableKrw: Math.round(bookTradableKrw),
        lockedNative: Number(lockedHoldingsNative.toFixed(isUsd ? 2 : 0)),
        lockedKrw: Math.round(bookLockedKrw),
        totalNative: Number(totalNative.toFixed(isUsd ? 2 : 0)),
        totalKrw: Math.round(bookTotalKrw),
        feeBps: bookKey === 'CRYPTO' ? Math.max(4, Number(rawBook.feeBps) || 8) : (bookKey === 'KR_STOCK' ? 6 : 20),
        holdings: valuedHoldings,
      };
    }

    // 북별 비중 & 월간 적립금 캐시플로우 리밸런싱 가이드
    const monthlyDcaKrw = Math.max(0, Number(workspace.monthlyDcaKrw) || 0);
    const bookDrift = {};
    let positiveDeficitSum = 0;
    for (const bk of ['KR_STOCK', 'US_STOCK', 'CRYPTO']) {
      const curWeight = totalNetWorthKrw > 0 ? (bookSummaries[bk].totalKrw / totalNetWorthKrw) * 100 : 0;
      const tgtWeight = targetWeights[bk];
      const diffPct = curWeight - tgtWeight;
      const targetKrwAfterDca = ((totalNetWorthKrw + monthlyDcaKrw) * tgtWeight) / 100;
      const deficitKrw = Math.max(0, targetKrwAfterDca - bookSummaries[bk].totalKrw);
      positiveDeficitSum += deficitKrw;
      bookDrift[bk] = {
        currentWeightPct: Number(curWeight.toFixed(1)),
        targetWeightPct: tgtWeight,
        driftPct: Number(diffPct.toFixed(1)),
        deficitKrw,
        recommendedDcaKrw: 0,
      };
    }
    for (const bk of ['KR_STOCK', 'US_STOCK', 'CRYPTO']) {
      bookDrift[bk].recommendedDcaKrw = (monthlyDcaKrw > 0 && positiveDeficitSum > 0)
        ? Math.round((bookDrift[bk].deficitKrw / positiveDeficitSum) * monthlyDcaKrw)
        : Math.round((monthlyDcaKrw * targetWeights[bk]) / 100);
    }

    // 각 북별 SOTA 최적 목표 포트폴리오 & 실행 주문 티켓 생성
    const orderTickets = [];
    const targetAllocations = { KR_STOCK: [], US_STOCK: [], CRYPTO: [] };

    for (const bk of ['KR_STOCK', 'US_STOCK', 'CRYPTO']) {
      const bSum = bookSummaries[bk];
      const bFeed = feed?.books?.[bk] || { assets: [] };
      const assets = Array.isArray(bFeed.assets) ? bFeed.assets : [];
      const isUsd = bk === 'US_STOCK';
      const tradableBudget = bSum.tradableNative;
      const minViableBudget = isUsd ? 12 : (bk === 'KR_STOCK' ? 15000 : 10000);

      // 보호 잠금 종목은 그대로 보존 표시
      for (const lh of bSum.holdings.filter((x) => x.locked)) {
        targetAllocations[bk].push({
          symbol: lh.symbol,
          name: lh.name,
          role: 'LOCKED_CORE',
          targetQty: lh.qty,
          price: lh.currentPrice,
          amountNative: lh.evalNative,
          locked: true,
        });
      }

      if (tradableBudget < minViableBudget || assets.length === 0) continue;

      // 소액 계좌 온주 제약 자동 감지 (예: 미국 $200 미만 또는 국내 12만원 미만이면 1슬롯 집중으로 현금 드래그 제거)
      const maxSlots = bk === 'US_STOCK'
        ? (tradableBudget < 200 ? 1 : profile.equityMaxSlots)
        : (bk === 'KR_STOCK'
          ? (tradableBudget < 130000 ? 1 : profile.equityMaxSlots)
          : (tradableBudget < 35000 ? 1 : profile.cryptoMaxSlots));

      const userFeeBps = bSum.feeBps;
      const minNetHurdle = Math.max(25, userFeeBps * 2.0);

      const eligibleOffensive = assets.filter((a) => {
        if (a.isCashPark) return false;
        if (!profile.allowLeverage2x && Number(a.leverage || 1) >= 2) return false;
        if (bk === 'CRYPTO') {
          const adjNet = Number(a.expectedNetBps || 0) + (Number(a.roundTripCostBps || 8) - userFeeBps);
          if (a.symbol === 'USDT' && userFeeBps > 15) return false;
          return (a.action === 'BUY' || a.buyEligible) && adjNet >= minNetHurdle;
        }
        if (isUsd && a.price > tradableBudget * 0.992) return false;
        if (bk === 'KR_STOCK' && a.price > tradableBudget * 0.992) return false;
        return a.action === 'BUY' || a.buyEligible || a.coreBetaFloorEligible;
      });

      const chosen = eligibleOffensive.slice(0, maxSlots);
      const parkAsset = assets.find((a) => a.isCashPark && (a.price <= tradableBudget * 0.995 || bk === 'CRYPTO'));

      const desiredQtyBySym = new Map();
      const chosenMetaBySym = new Map();
      let remainingSimCash = tradableBudget;

      for (let i = 0; i < chosen.length; i += 1) {
        const cand = chosen[i];
        const slotsLeft = chosen.length - i;
        let slotBudget = remainingSimCash / slotsLeft;

        if (bk === 'CRYPTO') {
          const vol = Math.max(0.25, Number(cand.sota?.annVol20Pct || 55) / 100);
          const volScale = Math.max(0.45, Math.min(1.0, 0.72 / vol));
          slotBudget = slotBudget * volScale;
          const limitPx = roundCryptoTick(cand.price * 1.001);
          if (slotBudget >= 10000 && limitPx > 0) {
            const qty = Number(((slotBudget * 0.996) / limitPx).toFixed(6));
            desiredQtyBySym.set(cand.symbol, qty);
            chosenMetaBySym.set(cand.symbol, { ...cand, limitPx });
            remainingSimCash = Math.max(0, remainingSimCash - qty * limitPx);
          }
        } else {
          const limitPx = isUsd
            ? roundUsTick(cand.price * 1.002)
            : roundKrTick(cand.price * 1.002, cand.isEtf);
          const wholeQty = limitPx > 0 ? Math.floor((slotBudget * 0.994) / limitPx) : 0;
          if (wholeQty >= 1) {
            desiredQtyBySym.set(cand.symbol, wholeQty);
            chosenMetaBySym.set(cand.symbol, { ...cand, limitPx });
            remainingSimCash = Math.max(0, remainingSimCash - wholeQty * limitPx);
          }
        }
      }

      // 유휴 현금 단기채 파킹 스위프 (국내 272580 / 미국 USFR) — 공격 슬롯 후 남은 현금까지 온주 복리 가동!
      if (autoCashPark && parkAsset && bk !== 'CRYPTO') {
        const parkLimitPx = isUsd
          ? roundUsTick(parkAsset.price * 1.001)
          : roundKrTick(parkAsset.price + 5, true);
        const parkQty = parkLimitPx > 0 ? Math.floor((remainingSimCash * 0.994) / parkLimitPx) : 0;
        if (parkQty >= 1) {
          desiredQtyBySym.set(parkAsset.symbol, (desiredQtyBySym.get(parkAsset.symbol) || 0) + parkQty);
          chosenMetaBySym.set(parkAsset.symbol, { ...parkAsset, limitPx: parkLimitPx, isCashParkSweep: true });
          remainingSimCash = Math.max(0, remainingSimCash - parkQty * parkLimitPx);
        }
      }

      // 1) 기존 보유(비잠금) 대조 -> SELL 또는 HOLD/TRIM 티켓 생성
      const unlockedHoldings = bSum.holdings.filter((h) => !h.locked);
      for (const cur of unlockedHoldings) {
        const targetQ = desiredQtyBySym.get(cur.symbol) || 0;
        const feedInfo = lookup.get(`${bk}:${cur.symbol}`);
        const sellPx = isUsd
          ? roundUsTick(cur.currentPrice * 0.998)
          : (bk === 'KR_STOCK' ? roundKrTick(cur.currentPrice * 0.998, true) : roundCryptoTick(cur.currentPrice));

        if (targetQ <= 0) {
          const sellAmt = cur.qty * sellPx;
          orderTickets.push({
            id: `${bk}:SELL:${cur.symbol}`,
            book: bk,
            side: 'SELL',
            symbol: cur.symbol,
            name: cur.name,
            qty: cur.qty,
            limitPrice: sellPx,
            currency: bSum.currency,
            amountNative: Number(sellAmt.toFixed(isUsd ? 2 : 0)),
            amountKrw: Math.round(isUsd ? sellAmt * fx : sellAmt),
            tradeStyle: 'ROTATION_EXIT',
            stopLossPrice: null,
            trailingTriggerPrice: null,
            reason: feedInfo
              ? `SOTA 상위 시그널 교체 또는 추세 이탈(${feedInfo.action}) — 현금 회수 후 최적 타깃 재배치`
              : 'SOTA 코어 유니버스 외 비보호 종목 — 상위 팩터 자산으로 리밸런싱 권고',
          });
        } else {
          const diff = targetQ - cur.qty;
          const relDiff = cur.qty > 0 ? Math.abs(diff) / cur.qty : 1;
          if (diff < 0 && relDiff >= 0.18) {
            const trimQty = bk === 'CRYPTO' ? Number(Math.abs(diff).toFixed(6)) : Math.floor(Math.abs(diff));
            if (trimQty > 0 && (bk !== 'CRYPTO' || trimQty * sellPx >= 5500)) {
              orderTickets.push({
                id: `${bk}:SELL:${cur.symbol}`,
                book: bk,
                side: 'SELL',
                symbol: cur.symbol,
                name: cur.name,
                qty: trimQty,
                limitPrice: sellPx,
                currency: bSum.currency,
                amountNative: Number((trimQty * sellPx).toFixed(isUsd ? 2 : 0)),
                amountKrw: Math.round(isUsd ? trimQty * sellPx * fx : trimQty * sellPx),
                tradeStyle: 'VOL_TRIM',
                stopLossPrice: null,
                trailingTriggerPrice: null,
                reason: '변동성 타깃 비중에 맞춘 부분 비중 축소(리밸런싱)',
              });
            }
          }
        }
      }

      // 2) 목표 보유 종목 -> BUY 또는 HOLD 등록
      for (const [sym, targetQ] of desiredQtyBySym.entries()) {
        const meta = chosenMetaBySym.get(sym);
        const cur = unlockedHoldings.find((x) => x.symbol === sym);
        const curQ = cur ? cur.qty : 0;
        const addRaw = targetQ - curQ;
        const addQty = bk === 'CRYPTO' ? Number(Math.max(0, addRaw).toFixed(6)) : Math.max(0, Math.floor(addRaw));
        const px = meta.limitPx;
        const stopPct = Number(meta.stopLossPct || 5.0) / 100;
        const trailPct = Number(meta.trailingActivatePct || 6.0) / 100;
        const stopPx = isUsd ? roundUsTick(px * (1 - stopPct)) : (bk === 'KR_STOCK' ? roundKrTick(px * (1 - stopPct), meta.isEtf) : roundCryptoTick(px * (1 - stopPct)));
        const trailPx = isUsd ? roundUsTick(px * (1 + trailPct)) : (bk === 'KR_STOCK' ? roundKrTick(px * (1 + trailPct), meta.isEtf) : roundCryptoTick(px * (1 + trailPct)));

        targetAllocations[bk].push({
          symbol: sym,
          name: meta.name,
          role: meta.isCashPark ? 'CASH_PARK' : meta.tradeStyle,
          targetQty: targetQ,
          currentQty: curQ,
          price: px,
          amountNative: Number((targetQ * px).toFixed(isUsd ? 2 : 0)),
          stopLossPct: meta.stopLossPct,
          stopLossPrice: stopPx,
          thesis: meta.thesis,
          locked: false,
        });

        const minOrderOk = bk === 'CRYPTO' ? addQty * px >= 6000 : addQty >= 1;
        const meaningfulAdd = curQ === 0 || (addQty / Math.max(1e-9, curQ)) >= 0.15;

        if (minOrderOk && meaningfulAdd) {
          const amt = addQty * px;
          orderTickets.push({
            id: `${bk}:BUY:${sym}`,
            book: bk,
            side: 'BUY',
            symbol: sym,
            name: meta.name,
            qty: addQty,
            limitPrice: px,
            currency: bSum.currency,
            amountNative: Number(amt.toFixed(isUsd ? 2 : 0)),
            amountKrw: Math.round(isUsd ? amt * fx : amt),
            tradeStyle: meta.isCashPark ? 'CASH_PARK' : meta.tradeStyle,
            isCashPark: Boolean(meta.isCashPark),
            stopLossPct: meta.stopLossPct,
            stopLossPrice: stopPx,
            trailingActivatePct: meta.trailingActivatePct,
            trailingTriggerPrice: trailPx,
            convictionPct: meta.convictionPct,
            expectedNetBps: meta.expectedNetBps,
            reason: meta.isCashPark
              ? `공격 시그널 대기 현금 무위험 복리 가동 — ${meta.name}(상위 추세 발생 시 즉시 자동 교체)`
              : meta.thesis,
          });
        }
      }
    }

    // SELL 우선 정렬 -> 금액 큰 BUY 순 정렬 (동일 사이클 내 현금 확보 후 매수 원칙)
    orderTickets.sort((a, b) => {
      if (a.side !== b.side) return a.side === 'SELL' ? -1 : 1;
      return b.amountKrw - a.amountKrw;
    });

    // 월간 서바이벌 실드 점검
    const baselineKrw = Number(workspace.monthlyBaselineKrw) > 0
      ? Number(workspace.monthlyBaselineKrw)
      : Math.round(totalNetWorthKrw);
    const monthlyPnlPct = baselineKrw > 0 ? ((totalNetWorthKrw - baselineKrw) / baselineKrw) * 100 : 0;
    const stopFloorPct = Number(workspace.monthlyStopPct) < 0 ? Number(workspace.monthlyStopPct) : profile.monthlyStopPct;
    const shieldTripped = baselineKrw > 0 && monthlyPnlPct <= stopFloorPct;
    const bufferToStopPct = Number((monthlyPnlPct - stopFloorPct).toFixed(2));

    const finalTickets = shieldTripped
      ? orderTickets.filter((t) => t.side === 'SELL' || t.isCashPark)
      : orderTickets;

    // 4대 축 포트폴리오 건강 점수 (0 ~ 100점) — Wealthfront / Copilot Money 레퍼런스 진단 엔진
    const cashRatioPct = totalNetWorthKrw > 0 ? Number(((totalCashKrw / totalNetWorthKrw) * 100).toFixed(1)) : 0;
    let healthScore = {
      score: 0,
      projectedScore: 98,
      grade: '—',
      headline: '자산을 입력하면 4대 기관급 기준으로 내 포트폴리오 건강도를 즉시 진단합니다.',
      pillars: { balance: 0, cashEfficiency: 0, factorAlignment: 0, shieldAndFee: 0 },
    };
    if (totalNetWorthKrw > 0) {
      const avgAbsDrift = (
        Math.abs(bookDrift.KR_STOCK.driftPct)
        + Math.abs(bookDrift.US_STOCK.driftPct)
        + Math.abs(bookDrift.CRYPTO.driftPct)
      ) / 2;
      const pBalance = Math.max(4, Math.round(25 - Math.min(21, avgAbsDrift * 0.55)));
      // 크립토 관망 현금은 의도된 현금 실드일 수 있으므로 주식 북 내 유휴현금 비중 중심으로 드래그 감점
      const eqIdleCashKrw = (bookSummaries.KR_STOCK.cashKrw || 0) + (bookSummaries.US_STOCK.cashKrw || 0);
      const eqIdlePct = totalNetWorthKrw > 0 ? (eqIdleCashKrw / totalNetWorthKrw) * 100 : 0;
      const pCash = autoCashPark
        ? Math.max(6, Math.round(25 - Math.min(19, eqIdlePct * 0.32)))
        : Math.max(8, Math.round(22 - Math.min(14, eqIdlePct * 0.25)));
      const sellTurnoverKrw = finalTickets.filter((t) => t.side === 'SELL').reduce((s, t) => s + t.amountKrw, 0);
      const buyTurnoverKrw = finalTickets.filter((t) => t.side === 'BUY').reduce((s, t) => s + t.amountKrw, 0);
      const unalignedRatio = Math.min(1, (sellTurnoverKrw + buyTurnoverKrw * 0.65) / Math.max(1, totalTradableKrw));
      const pFactor = Math.max(5, Math.round(25 * (1 - unalignedRatio * 0.8)));
      const cryptoFeePenalty = bookSummaries.CRYPTO.feeBps > 20 ? 6 : (bookSummaries.CRYPTO.feeBps > 10 ? 2 : 0);
      const shieldPenalty = shieldTripped ? 12 : (bufferToStopPct < 2.0 ? 4 : 0);
      const pShield = Math.max(5, 25 - cryptoFeePenalty - shieldPenalty);

      const sumScore = Math.min(100, pBalance + pCash + pFactor + pShield);
      const projected = Math.max(sumScore, Math.min(99, 98 - cryptoFeePenalty));
      const grade = sumScore >= 90 ? 'S' : (sumScore >= 78 ? 'A' : (sumScore >= 62 ? 'B' : 'C'));
      let headline = '3대 자산 비중·팩터 모멘텀·복리 파킹이 SOTA 기준에 잘 정렬되어 있습니다.';
      if (finalTickets.length > 0 && eqIdlePct >= 18) {
        headline = `유휴 현금(${Math.round(eqIdlePct)}%)이 이자 없이 대기 중입니다 — 단기채·SOTA 타깃 배치를 권장합니다.`;
      } else if (avgAbsDrift >= 12) {
        headline = `목표 비중 대비 편차(±${avgAbsDrift.toFixed(1)}%p)가 발생했습니다 — 적립금 또는 리밸런싱으로 균형을 맞추세요.`;
      } else if (sellTurnoverKrw > 0) {
        headline = '모멘텀 약화 또는 비핵심 보유 종목을 상위 SOTA 팩터 자산으로 교체할 시점입니다.';
      }
      healthScore = {
        score: sumScore,
        projectedScore: projected,
        grade,
        headline,
        pillars: {
          balance: pBalance,
          cashEfficiency: pCash,
          factorAlignment: pFactor,
          shieldAndFee: pShield,
        },
      };
    }

    return {
      fxRateUsdKrw: fx,
      profile,
      targetWeights,
      totals: {
        netWorthKrw: Math.round(totalNetWorthKrw),
        netWorthUsd: Number((totalNetWorthKrw / fx).toFixed(2)),
        tradableKrw: Math.round(totalTradableKrw),
        lockedKrw: Math.round(totalLockedKrw),
        cashKrw: Math.round(totalCashKrw),
        cashRatioPct,
      },
      healthScore,
      survivalShield: {
        baselineKrw,
        monthlyPnlPct: Number(monthlyPnlPct.toFixed(2)),
        hardStopFloorPct: stopFloorPct,
        bufferToStopPct,
        shieldTripped,
        posture: shieldTripped
          ? 'EMERGENCY_CASH_SHIELD'
          : (bufferToStopPct <= 1.8 ? 'CAUTION_DEFENSIVE' : 'HEALTHY_ACTIVE'),
      },
      books: bookSummaries,
      bookDrift,
      targetAllocations,
      orderTickets: finalTickets,
      allHoldings: allHoldingsValued,
    };
  }

  /**
   * 사용자가 주문 티켓에서 '체결 완료 반영' 클릭 시 워크스페이스 현금·보유수량을 즉시 갱신
   */
  function applyOrderTicketToWorkspace(workspace, ticket) {
    const next = JSON.parse(JSON.stringify(workspace));
    const bk = ticket.book;
    const bookObj = next.books?.[bk];
    if (!bookObj) return next;
    const isUsd = bk === 'US_STOCK';
    const cashKey = isUsd ? 'cashUsd' : 'cashKrw';
    bookObj.holdings = Array.isArray(bookObj.holdings) ? bookObj.holdings : [];

    const idx = bookObj.holdings.findIndex((h) => String(h.symbol).toUpperCase() === String(ticket.symbol).toUpperCase() && !h.locked);
    const totalCost = Number(ticket.qty) * Number(ticket.limitPrice);

    if (ticket.side === 'BUY') {
      bookObj[cashKey] = Math.max(0, Number(((Number(bookObj[cashKey]) || 0) - totalCost).toFixed(isUsd ? 2 : 0)));
      if (idx >= 0) {
        const prev = bookObj.holdings[idx];
        const newQty = Number(prev.qty) + Number(ticket.qty);
        const newAvg = (Number(prev.qty) * Number(prev.avgPrice || ticket.limitPrice) + totalCost) / newQty;
        bookObj.holdings[idx] = {
          ...prev,
          qty: bk === 'CRYPTO' ? Number(newQty.toFixed(6)) : newQty,
          avgPrice: Number(newAvg.toFixed(isUsd ? 2 : 0)),
        };
      } else {
        bookObj.holdings.push({
          symbol: ticket.symbol,
          name: ticket.name,
          qty: ticket.qty,
          avgPrice: ticket.limitPrice,
          locked: false,
        });
      }
    } else if (ticket.side === 'SELL' && idx >= 0) {
      const prev = bookObj.holdings[idx];
      const sold = Math.min(Number(prev.qty), Number(ticket.qty));
      const rem = Number((Number(prev.qty) - sold).toFixed(6));
      bookObj[cashKey] = Number(((Number(bookObj[cashKey]) || 0) + sold * Number(ticket.limitPrice)).toFixed(isUsd ? 2 : 0));
      if (rem <= 1e-6 || (bk !== 'CRYPTO' && rem < 1)) {
        bookObj.holdings.splice(idx, 1);
      } else {
        bookObj.holdings[idx].qty = bk === 'CRYPTO' ? rem : Math.floor(rem);
      }
    }

    next.updatedAt = Date.now();
    next.executedOrderIds = [...(next.executedOrderIds || []).slice(-49), `${ticket.id}@${next.updatedAt}`];
    return next;
  }

  function applyAllTicketsToWorkspace(workspace, tickets = []) {
    let cur = JSON.parse(JSON.stringify(workspace));
    const ordered = [...tickets].sort((a, b) => (a.side === b.side ? 0 : (a.side === 'SELL' ? -1 : 1)));
    for (const t of ordered) {
      cur = applyOrderTicketToWorkspace(cur, t);
    }
    return cur;
  }

  /**
   * 4년 실전 Walk-Forward OOS 데이터 기반 사용자 맞춤형 적립식(DCA)·비중·기어 백테스트 시뮬레이터
   */
  function runCustomBacktest(config = {}, oosData = null) {
    const pts = Array.isArray(oosData?.points) ? oosData.points : [];
    if (pts.length < 10) {
      return { ok: false, series: [], metrics: null, yearly: [] };
    }

    const initialKrw = Math.max(100000, Number(config.initialKrw ?? 10000000));
    const monthlyDcaKrw = Math.max(0, Number(config.monthlyDcaKrw ?? 0));
    const weights = normalizeWeights(config.weights || { KR_STOCK: 43, US_STOCK: 32, CRYPTO: 25 });
    const wKr = weights.KR_STOCK / 100;
    const wUs = weights.US_STOCK / 100;
    const wCr = weights.CRYPTO / 100;

    const volManaged = config.volManaged !== false;
    const safeHavenShield = config.safeHavenShield !== false;
    const cashParkSweep = config.cashParkSweep !== false;
    const extraFeeBps = Math.max(0, Number(config.extraFeeBps || 0));

    let sotaWealth = initialKrw;
    let spyWealth = initialKrw;
    let cashWealth = initialKrw;
    let totalPrincipal = initialKrw;

    let twrSota = 1.0;
    let twrSpy = 1.0;
    let peakTwrSota = 1.0;
    let peakTwrSpy = 1.0;
    let maxDdSota = 0;
    let maxDdSpy = 0;

    const stepRetsSota = [];
    const stepRetsSpy = [];
    const series = [{
      d: pts[0].d,
      principalKrw: Math.round(totalPrincipal),
      sotaKrw: Math.round(sotaWealth),
      spyKrw: Math.round(spyWealth),
      cashKrw: Math.round(cashWealth),
      sotaTwrPct: 0,
      spyTwrPct: 0,
      sotaDdPct: 0,
      spyDdPct: 0,
      regime: pts[0].reg || 'NORMAL_BULL_1X',
    }];

    let lastMonth = pts[0].d.slice(0, 7);
    const byYear = {};

    for (let i = 1; i < pts.length; i += 1) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const rSpy = p0.spy > 0 ? (p1.spy / p0.spy) - 1 : 0;
      const rCash = p0.cash > 0 ? (p1.cash / p0.cash) - 1 : 0;
      let rKr = p0.kr > 0 ? (p1.kr / p0.kr) - 1 : 0;
      let rUs = p0.us > 0 ? (p1.us / p0.us) - 1 : 0;
      let rCr = p0.cr > 0 ? (p1.cr / p0.cr) - 1 : 0;
      const rKospi = p0.kospi > 0 ? (p1.kospi / p0.kospi) - 1 : 0;
      const rBtc = p0.btc > 0 ? (p1.btc / p0.btc) - 1 : 0;

      // SOTA 방어 모듈 OFF 시 실제 반사실(Counterfactual) 시장 노출 반영
      if (!safeHavenShield && p1.reg === 'SAFE_HAVEN_SHIELD') {
        rKr = 0.65 * rKospi + 0.35 * rKr;
        rUs = 0.70 * rSpy + 0.30 * rUs;
        rCr = 0.55 * rBtc + 0.45 * rCr;
      }
      if (!volManaged && p1.reg !== 'CALM_BULL_2X') {
        rUs = rUs + 0.45 * rSpy - 0.0008;
      }
      if (!cashParkSweep && p1.reg === 'SAFE_HAVEN_SHIELD') {
        rKr -= rCash * 0.7;
        rUs -= rCash * 0.8;
      }

      const feeStepDrag = (extraFeeBps / 10000) * (4 / 252);
      const portR = wKr * rKr + wUs * rUs + wCr * rCr - feeStepDrag;

      const curMonth = p1.d.slice(0, 7);
      if (monthlyDcaKrw > 0 && curMonth !== lastMonth) {
        sotaWealth += monthlyDcaKrw;
        spyWealth += monthlyDcaKrw;
        cashWealth += monthlyDcaKrw;
        totalPrincipal += monthlyDcaKrw;
        lastMonth = curMonth;
      }

      sotaWealth *= (1 + portR);
      spyWealth *= (1 + rSpy);
      cashWealth *= (1 + rCash);

      const prevTwrSota = twrSota;
      const prevTwrSpy = twrSpy;
      twrSota *= (1 + portR);
      twrSpy *= (1 + rSpy);
      stepRetsSota.push(portR);
      stepRetsSpy.push(rSpy);

      if (twrSota > peakTwrSota) peakTwrSota = twrSota;
      if (twrSpy > peakTwrSpy) peakTwrSpy = twrSpy;
      const ddSota = (twrSota - peakTwrSota) / peakTwrSota;
      const ddSpy = (twrSpy - peakTwrSpy) / peakTwrSpy;
      if (ddSota < maxDdSota) maxDdSota = ddSota;
      if (ddSpy < maxDdSpy) maxDdSpy = ddSpy;

      const yr = p1.d.slice(0, 4);
      if (!byYear[yr]) byYear[yr] = { s0: prevTwrSota, b0: prevTwrSpy };
      byYear[yr].s1 = twrSota;
      byYear[yr].b1 = twrSpy;

      series.push({
        d: p1.d,
        principalKrw: Math.round(totalPrincipal),
        sotaKrw: Math.round(sotaWealth),
        spyKrw: Math.round(spyWealth),
        cashKrw: Math.round(cashWealth),
        sotaTwrPct: Number(((twrSota - 1) * 100).toFixed(2)),
        spyTwrPct: Number(((twrSpy - 1) * 100).toFixed(2)),
        sotaDdPct: Number((ddSota * 100).toFixed(2)),
        spyDdPct: Number((ddSpy * 100).toFixed(2)),
        regime: p1.reg || 'NORMAL_BULL_1X',
      });
    }

    const stepsPerYear = 252 / 4; // 63 steps/yr
    const years = stepRetsSota.length / stepsPerYear;
    const calcStats = (twrEnd, maxDd, rets) => {
      const totalRetPct = (twrEnd - 1) * 100;
      const cagrPct = (Math.pow(twrEnd, 1 / Math.max(0.25, years)) - 1) * 100;
      const m = rets.reduce((a, b) => a + b, 0) / rets.length;
      const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, rets.length - 1);
      const annVol = Math.sqrt(v * stepsPerYear);
      const sharpe = annVol > 0 ? ((m * stepsPerYear) - 0.035) / annVol : 0;
      const dv = rets.reduce((a, b) => a + (b < 0 ? b * b : 0), 0) / rets.length;
      const sortino = Math.sqrt(dv * stepsPerYear) > 0 ? ((m * stepsPerYear) - 0.035) / Math.sqrt(dv * stepsPerYear) : 0;
      const calmar = Math.abs(maxDd) > 0 ? (cagrPct / 100) / Math.abs(maxDd) : 0;
      return {
        totalRetPct: Number(totalRetPct.toFixed(2)),
        cagrPct: Number(cagrPct.toFixed(2)),
        maxDdPct: Number((maxDd * 100).toFixed(2)),
        annVolPct: Number((annVol * 100).toFixed(2)),
        sharpe: Number(sharpe.toFixed(2)),
        sortino: Number(sortino.toFixed(2)),
        calmar: Number(calmar.toFixed(2)),
      };
    };

    const sotaStats = calcStats(twrSota, maxDdSota, stepRetsSota);
    const spyStats = calcStats(twrSpy, maxDdSpy, stepRetsSpy);

    const yearly = Object.entries(byYear).map(([year, y]) => {
      const sotaPct = Number((((y.s1 / y.s0) - 1) * 100).toFixed(2));
      const spyPct = Number((((y.b1 / y.b0) - 1) * 100).toFixed(2));
      return {
        year,
        sotaPct,
        spyPct,
        alphaPct: Number((sotaPct - spyPct).toFixed(2)),
      };
    });

    return {
      ok: true,
      periodStart: pts[0].d,
      periodEnd: pts[pts.length - 1].d,
      weights,
      wealth: {
        principalKrw: Math.round(totalPrincipal),
        finalSotaKrw: Math.round(sotaWealth),
        finalSpyKrw: Math.round(spyWealth),
        finalCashKrw: Math.round(cashWealth),
        netProfitKrw: Math.round(sotaWealth - totalPrincipal),
        excessVsSpyKrw: Math.round(sotaWealth - spyWealth),
      },
      sotaStats,
      spyStats,
      yearly,
      series,
    };
  }

  /**
   * 엑셀/CSV/증권사 복사 텍스트 한 번에 파싱 ("379800 10 21200" 또는 "NVDA, 5, 128.5")
   */
  function parseHoldingsText(rawText = '') {
    const lines = String(rawText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      const parts = line.split(/[\t,|]+|\s{2,}|\s+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const symbol = parts[0].replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!symbol || /^(SYMBOL|TICKER|종목|코드)$/i.test(symbol)) continue;
      const nums = parts.slice(1).map((x) => Number(x.replace(/[,₩$원주개]/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
      if (nums.length === 0) continue;
      parsed.push({
        symbol,
        name: symbol,
        qty: nums[0],
        avgPrice: nums[1] || 0,
        locked: /잠금|lock|장기/i.test(line),
      });
    }
    return parsed;
  }

  return {
    RISK_PROFILES,
    STARTER_PRESETS,
    roundKrTick,
    roundUsTick,
    roundCryptoTick,
    createDefaultWorkspace,
    normalizeWeights,
    computePortfolioPlan,
    applyOrderTicketToWorkspace,
    applyAllTicketsToWorkspace,
    runCustomBacktest,
    parseHoldingsText,
  };
}));
