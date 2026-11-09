// Slot 1 holds whichever account of the bridge's pool the browser shows (src/lib/bridge/accounts.ts),
// so its IndexedDB is named after that account rather than after the slot: switching back to an
// account finds its dialogs, messages and updates state where it left them, and two accounts never
// share one database. Each realm that opens it learns the account before it does: the main thread
// from slot 1's session data as it loads the states (loadStateForAllAccounts), the MTProto worker from
// the state it is sent (index.worker.ts). The other slots keep tweb's names.

import type {ActiveAccountNumber} from '@lib/accounts/types';

let databaseUserId: UserId | PeerId;

export function setBridgeDatabaseUser(userId: UserId | PeerId | undefined) {
  databaseUserId = userId;
}

export function getBridgeDatabaseName(accountNumber: ActiveAccountNumber) {
  return accountNumber === 1 && databaseUserId ? `tweb-bridge-${databaseUserId}` : undefined;
}
