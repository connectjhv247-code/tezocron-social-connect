import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  doc, 
  getDocFromServer 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from './firebase-config.json';

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Authentication instance
export const auth = getAuth(app);

// Storage instance
export const storage = getStorage(app);

// Initialize Firestore with specific databaseId as required by AI Studio Firebase Skill
function initDb() {
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  try {
    return getFirestore(app, dbId);
  } catch {
    return initializeFirestore(app, {}, dbId);
  }
}

export const db = initDb();

// Test Firestore connection on initial boot
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    // Non-fatal connection check notice
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.info('Firestore initial offline/reconnecting state:', error.message);
    }
  }
}

// Error handling helper required by Firebase Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Backend operation log: ', JSON.stringify(errInfo));

  let userFriendlyMsg = 'Something went wrong. Please try again.';
  if (operationType === OperationType.CREATE || operationType === OperationType.UPDATE || operationType === OperationType.WRITE) {
    userFriendlyMsg = 'Unable to update your information. Please try again.';
  } else if (operationType === OperationType.DELETE) {
    userFriendlyMsg = 'Unable to complete request. Please try again.';
  } else if (operationType === OperationType.LIST || operationType === OperationType.GET) {
    userFriendlyMsg = 'Unable to load information. Please try again.';
  }

  throw new Error(userFriendlyMsg);
}

export default app;
