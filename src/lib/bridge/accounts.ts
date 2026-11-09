// The bridge's account pool: every account the backend has (`/api/bridge/accounts`, no limit), and
// the one this browser shows. tweb itself only ever has that one signed in, in slot 1 - the others are
// rows of the account menu, with no managers, storages or sockets of their own, so the bridge sees one
// account per browser. Picking another puts it into slot 1 and reloads every tab into it
// (switchBridgeAccount). Main thread only: kept in localStorage, which the menu reads without waiting.
// The keys kept with the pool are the backend's fake ones (app/bridge/keys.py), the same ones the
// account list hands out to anyone with the token, which is kept here too.

import AccountController from '@lib/accounts/accountController';
import {AccountSessionData} from '@lib/accounts/types';
import sessionStorage from '@lib/sessionStorage';
import {DcAuthKey, TrueDcId} from '@types';
import tsNow from '@helpers/tsNow';
import {bridgeHttpBase} from '@lib/bridge/endpoint';

export type BridgeAccount = {
  id: UserId,
  username: string | null,
  name: string,
  dcId: TrueDcId,
  authKeys: Record<string, string>
};

const TOKEN_STORAGE_KEY = 'bridge_token';
const POOL_STORAGE_KEY = 'bridge_accounts';
const SELECTED_STORAGE_KEY = 'bridge_account';

function read<T>(key: string): T | undefined {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  } catch{
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch{}
}

export function getBridgeToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || undefined;
  } catch{
    return undefined;
  }
}

export function setBridgeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch{}
}

/**
 * The pool as the backend last listed it; empty when the bridge never answered in this browser.
 */
export function getBridgeAccountsPool(): BridgeAccount[] {
  return read<BridgeAccount[]>(POOL_STORAGE_KEY) || [];
}

export function getSelectedBridgeAccount(): UserId | undefined {
  return read<UserId>(SELECTED_STORAGE_KEY);
}

export function setSelectedBridgeAccount(id: UserId) {
  write(SELECTED_STORAGE_KEY, id);
}

export function findBridgeAccount(accounts: BridgeAccount[], id: UserId | string) {
  return id === undefined ? undefined : accounts.find((account) => String(account.id) === String(id));
}

/**
 * Lists the pool from the backend and keeps it for the menu; `undefined` when it does not answer.
 */
export async function fetchBridgeAccounts(token: string) {
  let accounts: BridgeAccount[];
  try {
    const res = await fetch(bridgeHttpBase() + '/api/bridge/accounts', {headers: {'X-Bridge-Token': token}});
    if(!res.ok) {
      console.error('[bridge] accounts fetch failed', res.status);
      return;
    }

    accounts = (await res.json()).accounts || [];
  } catch(err) {
    console.error('[bridge] accounts fetch error', err);
    return;
  }

  write(POOL_STORAGE_KEY, accounts);
  return accounts;
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
 * Whether slot 1 already holds `account`, with the keys the backend hands out for it now.
 */
export function isBridgeAccountInSlot(slot: AccountSessionData, account: BridgeAccount) {
  if(String(slot.userId) !== String(account.id) || slot.dcId !== account.dcId) {
    return false;
  }

  return Object.keys(account.authKeys).every((dc) => slot[`dc${dc}_auth_key` as DcAuthKey] === account.authKeys[dc]);
}

/**
 * Makes `account` the one tweb is signed in to: slot 1 gets its session, replacing what was there,
 * and any other slot is emptied, so that no second account connects.
 */
export async function putBridgeAccountIntoSlot(account: BridgeAccount) {
  setSelectedBridgeAccount(account.id);
  // * the others first: writing slot 1 counts the accounts again (number_of_accounts)
  await clearOtherSlots();
  await AccountController.update(1, toSessionData(account), true);
}

export async function clearOtherSlots() {
  for(const accountNumber of [2, 3, 4] as const) {
    const data = await AccountController.get(accountNumber, true);
    if(data.userId) {
      await sessionStorage.delete(`account${accountNumber}`);
    }
  }
}
