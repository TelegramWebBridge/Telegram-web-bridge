import {CURRENT_ACCOUNT_QUERY_PARAM} from '@lib/accounts/constants';
import {THREADED_WORKER_PROTOCOL_QUERY_PARAM} from '@lib/threadedWorkerTypes';
import {BRIDGE_ACCOUNT_QUERY_PARAM, BRIDGE_TOKEN_QUERY_PARAM} from '@lib/bridge/constants';

// * the page's own parameters: forwarded, a tab opened with one would get a worker of its own
const NOT_FORWARDED_PARAMS = new Set([
  CURRENT_ACCOUNT_QUERY_PARAM,
  THREADED_WORKER_PROTOCOL_QUERY_PARAM,
  BRIDGE_TOKEN_QUERY_PARAM,
  BRIDGE_ACCOUNT_QUERY_PARAM
]);

export function makeWorkerURL(url: string | URL) {
  if(!(url instanceof URL)) {
    url = new URL(url + '', location.href);
  }

  if(location.search && url.protocol !== 'blob:') {
    const params = new URLSearchParams(location.search);
    params.forEach((value, key) => {
      if(NOT_FORWARDED_PARAMS.has(key)) return;
      (url as URL).searchParams.set(key, value);
    });
  }

  // exclude useless params
  (url as URL).searchParams.delete('swfix');

  return url;
}

export default function setWorkerProxy() {
  // * hook worker constructor to set search parameters (test, debug, etc)
  const workerHandler = {
    construct(target: any, args: any) {
      args[0] = makeWorkerURL(args[0]);
      return new target(...args);
    }
  };

  [
    typeof(Worker) !== 'undefined' && Worker,
    typeof(SharedWorker) !== 'undefined' && SharedWorker
  ].filter(Boolean).forEach((w) => {
    window[w.name as any] = new Proxy(w, workerHandler);
  });
}

setWorkerProxy();
