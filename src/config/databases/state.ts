import type {Database} from '.';
import {ActiveAccountNumber} from '@lib/accounts/types';
import {MOUNT_CLASS_TO} from '@config/debug';
import {getBridgeDatabaseName} from '@lib/bridge/accountDatabase';

export type AccountDatabase = Database<'session' | 'stickerSets' | 'users' | 'chats' | 'messages' | 'dialogs' | 'webapp'>;
export type CommonDatabase = Database<'session' | 'localStorage'>;

export const getOldDatabaseState = (): AccountDatabase => ({
  name: `tweb`,
  version: 7,
  stores: [
    {
      name: 'session'
    },
    {
      name: 'stickerSets'
    },
    {
      name: 'users'
    },
    {
      name: 'chats'
    },
    {
      name: 'dialogs'
    },
    {
      name: 'messages'
    }
  ]
});

export const getCommonDatabaseState = (): CommonDatabase => ({
  name: `tweb-common`,
  version: 8,
  stores: [
    {
      name: 'session'
    },
    {
      name: 'localStorage', // not used (
      encryptedName: 'localStorage__encrypted'
    }
  ]
});

export const getDatabaseState = (
  accountNumber: ActiveAccountNumber
): Database<'session' | 'stickerSets' | 'users' | 'chats' | 'messages' | 'dialogs' | 'webapp'> => ({
  // * Bridge: slot 1's database belongs to the account in it (src/lib/bridge/accountDatabase.ts) - read
  // * when the database opens, since the managers make their storages before they learn the account
  get name() {
    return getBridgeDatabaseName(accountNumber) ?? `tweb-account-${accountNumber}`;
  },
  version: 9,
  stores: [
    {
      name: 'session',
      encryptedName: 'session__encrypted'
    },
    {
      name: 'stickerSets',
      encryptedName: 'stickerSets__encrypted'
    },
    {
      name: 'users',
      encryptedName: 'users__encrypted'
    },
    {
      name: 'chats',
      encryptedName: 'chats__encrypted'
    },
    {
      name: 'dialogs',
      encryptedName: 'dialogs__encrypted'
    },
    {
      name: 'messages',
      encryptedName: 'messages__encrypted'
    },
    {
      name: 'webapp',
      encryptedName: 'webapp__encrypted'
    }
  ]
});

MOUNT_CLASS_TO.getDatabaseState = getDatabaseState;
