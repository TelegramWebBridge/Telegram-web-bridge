// Where the bridge backend lives. VITE_BRIDGE_ORIGIN (e.g. http://localhost:3000) targets it
// directly; empty means same origin as the page, i.e. through nginx or an ngrok tunnel. Used from
// both the main thread (the accounts fetch) and the MTProto worker (the relay WebSocket URL), so it
// reads only import.meta.env and location — both available in either realm.

function bridgeOrigin(): string | undefined {
  const origin = import.meta.env.VITE_BRIDGE_ORIGIN;
  return origin ? origin.replace(/\/$/, '') : undefined;
}

export function bridgeHttpBase(): string {
  return bridgeOrigin() || '';
}

export function bridgeWsUrl(path: string): string {
  const origin = bridgeOrigin();
  if(origin) {
    const url = new URL(origin);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}${path}`;
  }

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}${path}`;
}
