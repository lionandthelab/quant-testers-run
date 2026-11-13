'use strict';

/**
 * Steward Quant SaaS — Local-First Multi-Workspace Store + Supabase Auth Cloud Sync
 * - Zero-friction instant usage via localStorage (supports multiple named workspaces)
 * - Optional 1-click Cloud Sync via Supabase Auth (Email+Password instant autoconfirm, Google, Kakao)
 * - Stores user workspaces strictly inside the authenticated user's JWT-isolated `user_metadata.quant_state_v5`
 */
(function initCloudSync(root) {
  const STORAGE_KEY = 'steward_quant_state_v5';
  const SESSION_KEY = 'steward_quant_supa_session_v5';

  function getConfig() {
    return root.STEWARD_QUANT_CONFIG || {
      supabaseUrl: 'https://hqfcpvszxkvtlabulbec.supabase.co',
      supabaseAnonKey: '',
      publicFeedUrl: 'https://hqfcpvszxkvtlabulbec.supabase.co/storage/v1/object/public/steward-crypto-public/quant-saas-feed.json',
    };
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
          return parsed;
        }
      }
    } catch {}
    const defWs = root.StewardQuantEngine.createDefaultWorkspace('STANDARD_10M');
    defWs.id = 'ws_default';
    let savedGrade = 'light';
    try {
      const g = localStorage.getItem('steward_theme_grade');
      if (g === 'dark' || g === 'light') savedGrade = g;
    } catch {}
    return {
      activeWorkspaceId: defWs.id,
      currencyMode: 'KRW',
      theme: savedGrade,
      workspaces: [defWs],
      updatedAt: Date.now(),
    };
  }

  function saveLocalState(state) {
    state.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
    return state;
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveSession(sess) {
    try {
      if (!sess) localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
    } catch {}
  }

  function captureOAuthHashSession() {
    if (!window.location.hash || !window.location.hash.includes('access_token=')) return null;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken) return null;
    const sess = {
      access_token: accessToken,
      refresh_token: refreshToken || '',
      savedAt: Date.now(),
    };
    saveSession(sess);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return sess;
  }

  async function supaFetch(endpoint, { method = 'GET', body = null, token = null } = {}) {
    const cfg = getConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error('클라우드 설정이 비활성화되어 있습니다.');
    }
    const headers = {
      apikey: cfg.supabaseAnonKey,
      'Content-Type': 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${cfg.supabaseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.msg || data.error_description || data.message || `인증 오류 (${res.status})`);
    }
    return data;
  }

  async function signUpEmail(email, password) {
    const data = await supaFetch('/auth/v1/signup', {
      method: 'POST',
      body: { email, password },
    });
    const session = data.access_token ? data : data.session;
    if (session?.access_token) {
      saveSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token || '',
        user: data.user || session.user,
        savedAt: Date.now(),
      });
    }
    return data;
  }

  async function signInEmail(email, password) {
    const data = await supaFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password },
    });
    saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      user: data.user,
      savedAt: Date.now(),
    });
    return data;
  }

  function startOAuthLogin(provider = 'google') {
    const cfg = getConfig();
    if (!cfg.supabaseUrl) return;
    const redirectTo = encodeURIComponent(window.location.origin + window.location.pathname);
    window.location.href = `${cfg.supabaseUrl}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${redirectTo}`;
  }

  async function fetchCurrentUser() {
    const sess = loadSession();
    if (!sess?.access_token) return null;
    try {
      const user = await supaFetch('/auth/v1/user', { token: sess.access_token });
      sess.user = user;
      saveSession(sess);
      return user;
    } catch {
      if (sess.refresh_token) {
        try {
          const refreshed = await supaFetch('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            body: { refresh_token: sess.refresh_token },
          });
          saveSession({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token || sess.refresh_token,
            user: refreshed.user,
            savedAt: Date.now(),
          });
          return refreshed.user;
        } catch {}
      }
      saveSession(null);
      return null;
    }
  }

  async function pushStateToCloud(state) {
    const sess = loadSession();
    if (!sess?.access_token) return { ok: false, reason: 'not_signed_in' };
    const compact = {
      activeWorkspaceId: state.activeWorkspaceId,
      currencyMode: state.currencyMode,
      workspaces: state.workspaces,
      updatedAt: state.updatedAt || Date.now(),
    };
    const user = await supaFetch('/auth/v1/user', {
      method: 'PUT',
      token: sess.access_token,
      body: { data: { quant_state_v5: compact } },
    });
    sess.user = user;
    saveSession(sess);
    return { ok: true, syncedAt: Date.now() };
  }

  async function pullStateFromCloud() {
    const user = await fetchCurrentUser();
    if (!user) return null;
    const cloud = user.user_metadata?.quant_state_v5;
    if (cloud && Array.isArray(cloud.workspaces) && cloud.workspaces.length > 0) {
      return cloud;
    }
    return null;
  }

  function signOut() {
    saveSession(null);
  }

  root.StewardCloudSync = {
    loadLocalState,
    saveLocalState,
    loadSession,
    captureOAuthHashSession,
    signUpEmail,
    signInEmail,
    startOAuthLogin,
    fetchCurrentUser,
    pushStateToCloud,
    pullStateFromCloud,
    signOut,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
