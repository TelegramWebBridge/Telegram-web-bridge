// One browser per account through the bridge. Every relay WebSocket this worker opens names the
// client it belongs to (`?client=`); the backend lets one client per account relay at a time and,
// when another one shows up, closes this one's sockets with SUPERSEDED_CLOSE_CODE (app/bridge/clients.py
// in the backend). Told so, the worker opens nothing more and the tabs show "App is inactive" until
// one is clicked: that starts the worker again under a new id, which takes the account back.
// Lives in the realm that owns the sockets (the MTProto worker).

import {randomLong} from '@helpers/random';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';

export const BRIDGE_SUPERSEDED_CLOSE_CODE = 4001;

let clientId = randomLong();
let superseded = false;
const heldConnects = new Set<() => void>();

export function withBridgeClient(url: string) {
  return url + (url.includes('?') ? '&' : '?') + 'client=' + clientId;
}

/**
 * Holds `connect` back while another client has the account; it runs once a tab takes it back.
 */
export function holdBridgeConnect(connect: () => void) {
  if(!superseded) {
    return false;
  }

  heldConnects.add(connect);
  return true;
}

export function dropBridgeConnect(connect: () => void) {
  heldConnects.delete(connect);
}

export function onBridgeClientSuperseded() {
  if(superseded) {
    return;
  }

  superseded = true;
  MTProtoMessagePort.getInstance().invokeVoid('event', {
    name: 'bridge_taken_over',
    args: [undefined],
    accountNumber: undefined
  });
}

export function resumeBridgeClient() {
  if(!superseded) {
    return;
  }

  superseded = false;
  clientId = randomLong();
  const connects = [...heldConnects];
  heldConnects.clear();
  connects.forEach((connect) => connect());
}
