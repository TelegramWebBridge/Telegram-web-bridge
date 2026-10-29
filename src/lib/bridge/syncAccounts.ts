import AccountController from '@lib/accounts/accountController';
import {AccountSessionData} from '@lib/accounts/types';
import {DcAuthKey, TrueDcId} from '@types';
import tsNow from '@helpers/tsNow';
import {bridgeHttpBase} from '@lib/bridge/endpoint';

const TOKEN_STORAGE_KEY = 'bridge_token';

type BridgeAccount = {
  id: number,
  username: string | null,
  name: string,
  dcId: TrueDcId,
  authKeys: Record<string, string>
};

function readToken(): string | undefined {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('bridgeToken');
  if(fromUrl) {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, fromUrl);
    } catch{}
    return fromUrl;
  }

  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || undefined;
  } catch{
    return undefined;
  }
}

function toSessionData(account: BridgeAccount): AccountSessionData {
  const data: AccountSessionData = {
    userId: account.id as PeerId,
    dcId: account.dcId,
    date: tsNow(true)
  };

  for(const dc in account.authKeys) {
    data[`dc${dc}_auth_key` as DcAuthKey] = account.authKeys[dc];
  }

  return data;
}

/**
 * Pulls the account list from our backend and writes the chosen one into slot 1, so tweb boots
 * straight into it with no login. The real auth keys never reach the browser — these are the
 * backend's per-account fake keys (see app/bridge in the FastAPI project). One account for now;
 * the multi-slot picker is the next step.
 */
export default async function syncBridgeAccounts() {
  const token = readToken();
  if(!token) {
    return;
  }

  let accounts: BridgeAccount[];
  try {
    const res = await fetch(bridgeHttpBase() + '/api/bridge/accounts', {headers: {'X-Bridge-Token': token}});
    if(!res.ok) {
      console.error('[bridge] accounts fetch failed', res.status);
      return;
    }

    accounts = (await res.json()).accounts;
  } catch(err) {
    console.error('[bridge] accounts fetch error', err);
    return;
  }

  if(!accounts?.length) {
    return;
  }

  const wantedId = new URLSearchParams(location.search).get('bridgeAccount');
  const account = accounts.find((a) => String(a.id) === wantedId) || accounts[0];

  await AccountController.update(1, toSessionData(account), true);
}
