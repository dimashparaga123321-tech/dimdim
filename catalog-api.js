const sharedCatalog = (() => {
  const { url, publishableKey } = window.DARIA_CATALOG_CONFIG;
  if (!url || !publishableKey) return null;
  const origin = new URL(url).origin;
  const sessionKey = 'daria-catalog-session';
  let refresh;

  function remember(session, persistent) {
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(sessionKey);
    if (session) (persistent ? localStorage : sessionStorage).setItem(sessionKey, JSON.stringify(session));
  }

  async function request(path, { token, body, method, headers = {} } = {}) {
    const response = await fetch(origin + path, {
      method, body, cache: 'no-store',
      headers: { apikey: publishableKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }
    });
    if (!response.ok) throw Object.assign(new Error(`Catalog HTTP ${response.status}`), { status: response.status });
    return response;
  }

  async function authGrant(grant, data) {
    const response = await request(`/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    return response.json();
  }

  async function accessToken() {
    const persistent = localStorage.getItem(sessionKey);
    const raw = persistent || sessionStorage.getItem(sessionKey);
    if (!raw) throw Object.assign(new Error('Sign in required'), { status: 401 });
    const session = JSON.parse(raw);
    if (session.expires_at > Date.now() / 1000 + 30) return session.access_token;
    refresh ||= authGrant('refresh_token', { refresh_token: session.refresh_token }).then(updated => {
      if ((localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey)) === raw) remember(updated, Boolean(persistent));
      return updated.access_token;
    }).finally(() => { refresh = null; });
    return refresh;
  }

  async function canEdit(token) {
    const response = await request('/rest/v1/rpc/daria_can_edit', {
      token, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    return response.json();
  }

  return {
    async login(email, password, persistent) {
      const session = await authGrant('password', { email, password });
      if (!await canEdit(session.access_token)) throw Object.assign(new Error('Editor access required'), { status: 403 });
      remember(session, persistent);
    },
    async restore() { return canEdit(await accessToken()); },
    async logout() {
      try {
        const token = await accessToken();
        remember(null);
        await request('/auth/v1/logout?scope=local', { token, method: 'POST' });
      } finally { remember(null); }
    },
    async read() {
      const response = await request('/rest/v1/daria_catalog?id=eq.1&select=revision,content');
      const [catalog] = await response.json();
      if (!catalog) throw new Error('Catalog is not configured');
      return catalog;
    },
    async save(revision, content) {
      const response = await request(`/rest/v1/daria_catalog?id=eq.1&revision=eq.${encodeURIComponent(revision)}`, {
        token: await accessToken(), method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ revision: revision + 1, content })
      });
      const [catalog] = await response.json();
      if (!catalog) throw Object.assign(new Error('Catalog changed elsewhere'), { status: 409 });
      return catalog;
    },
    photoURL(path) {
      if (!/^[a-f0-9]{64}\.(webp|jpg|png)$/.test(path)) return null;
      return `${origin}/storage/v1/object/public/daria-artworks/${path}`;
    },
    async upload(blob) {
      const extensions = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
      const extension = extensions[blob.type];
      if (!extension) throw new Error('Unsupported photo format');
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const filename = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') + `.${extension}`;
      try {
        await request(`/storage/v1/object/daria-artworks/${filename}`, {
          token: await accessToken(), method: 'POST', body: blob,
          headers: { 'Content-Type': blob.type, 'Cache-Control': 'max-age=31536000' }
        });
      } catch (error) {
        if (![400, 409].includes(error.status) || !(await fetch(this.photoURL(filename), { method: 'HEAD' })).ok) throw error;
      }
      return filename;
    }
  };
})();
