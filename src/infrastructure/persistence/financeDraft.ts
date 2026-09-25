import type { FinanceDatabase } from '../../modules/finance/domain/models';
import type { FinanceSnapshot } from './FinanceRepository';

export interface FinanceDraft {
  userId: string;
  base: FinanceSnapshot;
  database: FinanceDatabase;
  updatedAt: string;
}

// Each mounted session owns its own slot. Reloads recover the previous slot;
// duplicated tabs copy it into a new slot instead of overwriting one another.
export class FinanceDraftStore {
  private key: string;
  private recovered?: { key: string; raw: string };
  private pointer: string;

  constructor(private userId: string) {
    this.pointer = 'finance-app:draft-pointer:' + userId;
    this.key = 'finance-app:draft:' + userId + ':' + crypto.randomUUID();
  }

  read(): FinanceDraft | null {
    const previousKey = sessionStorage.getItem(this.pointer);
    if (!previousKey?.startsWith('finance-app:draft:' + this.userId + ':')) return null;
    const raw = localStorage.getItem(previousKey);
    if (!raw) return null;
    const draft = JSON.parse(raw) as FinanceDraft;
    if (draft.userId !== this.userId || !draft.base?.database || !draft.database || !Number.isSafeInteger(draft.base.revision)) {
      throw new Error('El respaldo local no tiene un formato válido.');
    }
    this.recovered = { key: previousKey, raw };
    return draft;
  }

  write(base: FinanceSnapshot, database: FinanceDatabase) {
    const draft: FinanceDraft = { userId: this.userId, base, database, updatedAt: new Date().toISOString() };
    // Write the data before moving the pointer. A quota failure preserves the old copy.
    localStorage.setItem(this.key, JSON.stringify(draft));
    sessionStorage.setItem(this.pointer, this.key);
  }

  clear() {
    localStorage.removeItem(this.key);
    if (this.recovered && localStorage.getItem(this.recovered.key) === this.recovered.raw) localStorage.removeItem(this.recovered.key);
    if (sessionStorage.getItem(this.pointer) === this.key || sessionStorage.getItem(this.pointer) === this.recovered?.key) {
      sessionStorage.removeItem(this.pointer);
    }
    this.recovered = undefined;
  }
}
