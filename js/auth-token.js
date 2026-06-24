let cache = null; 
let inflight = null;

export async function getAccessToken() {
  const agora = Math.floor(Date.now() / 1000);
  if (cache && cache.expiresAt - 60 > agora) return cache.token;
  if (inflight) return inflight;

  inflight = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch("/api/auth/token", { method: "POST", signal: ctrl.signal });
      if (!res.ok) {
        cache = null;
        return null;
      }
      const { access_token, expires_at } = await res.json();
      cache = { token: access_token, expiresAt: expires_at };
      return access_token;
    } catch {
      cache = null;
      return null;
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  })();

  return inflight;
}


export function setAccessToken(token, expiresAt) {
  cache = { token, expiresAt };
}

export function clearAccessToken() {
  cache = null;
}
