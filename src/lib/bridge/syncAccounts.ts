import AccountController from '@lib/accounts/accountController';
import apiManagerProxy from '@lib/apiManagerProxy';
import {
  clearOtherSlots,
  fetchBridgeAccounts,
  findBridgeAccount,
  getBridgeAccountsPool,
  getBridgeToken,
  getSelectedBridgeAccount,
  isBridgeAccountInSlot,
  putBridgeAccountIntoSlot,
  setBridgeToken,
  setSelectedBridgeAccount
} from '@lib/bridge/accounts';
import {BRIDGE_ACCOUNT_QUERY_PARAM, BRIDGE_TOKEN_QUERY_PARAM} from '@lib/bridge/constants';

/**
 * `?bridgeToken=` and `?bridgeAccount=` are read once and leave the address: kept, they would pick the
 * same account again on every reload, and put the token in sight
 */
function takeQueryParams() {
  const url = new URL(location.href);
  const token = url.searchParams.get(BRIDGE_TOKEN_QUERY_PARAM);
  const accountId = url.searchParams.get(BRIDGE_ACCOUNT_QUERY_PARAM);
  if(token === null && accountId === null) {
    return;
  }

  token && setBridgeToken(token);
  accountId && setSelectedBridgeAccount(+accountId);

  url.searchParams.delete(BRIDGE_TOKEN_QUERY_PARAM);
  url.searchParams.delete(BRIDGE_ACCOUNT_QUERY_PARAM);
  history.replaceState(history.state, '', url);
}

/**
 * Pulls the account pool from our backend and puts the chosen account into slot 1, so tweb boots
 * straight into it with no login. The real auth keys never reach the browser - these are the
 * backend's per-account fake keys (see app/bridge in the FastAPI project). The chosen one is the
 * account picked last in this browser (src/lib/bridge/accounts.ts), else the one in slot 1, else the
 * first of the pool. Without an answer from the backend slot 1 stays as it is.
 */
export default async function syncBridgeAccounts() {
  takeQueryParams();

  const token = getBridgeToken();
  if(!token) {
    return;
  }

  const [accounts, slot] = await Promise.all([
    fetchBridgeAccounts(token),
    AccountController.get(1)
  ]);
  if(!accounts?.length) {
    return;
  }

  const account = findBridgeAccount(accounts, getSelectedBridgeAccount()) ||
    findBridgeAccount(accounts, slot.userId) ||
    accounts[0];

  if(isBridgeAccountInSlot(slot, account)) {
    setSelectedBridgeAccount(account.id);
    await clearOtherSlots();
    return;
  }

  await putBridgeAccountIntoSlot(account);

  // * another account was signed in: a worker another tab keeps may already hold it, so it goes and
  // * every tab loads again into this one. A switch from the menu has put its account in before the
  // * reload, so it does not come here
  if(slot.userId) {
    reloadIntoBridgeAccount();
    await new Promise<never>(() => {});
  }
}

/**
 * The worker goes with its sockets, and every tab of the app loads again into the account in slot 1.
 * This tab's address loses the chat of the previous account.
 */
export function reloadIntoBridgeAccount() {
  const url = new URL(location.href);
  url.hash = '';
  apiManagerProxy.reloadAllTabs(url);
}

/**
 * Shows `id` of the pool instead of the account shown now - the account menu's pick.
 */
export async function switchBridgeAccount(id: UserId) {
  const account = findBridgeAccount(getBridgeAccountsPool(), id);
  if(!account) {
    return;
  }

  await putBridgeAccountIntoSlot(account);
  reloadIntoBridgeAccount();
}
