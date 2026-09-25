import type { FinanceDatabase } from '../../modules/finance/domain/models';
import type { FinanceRepository, FinanceSnapshot } from './FinanceRepository';
import { FinanceConflictError } from './SupabaseFinanceRepository';
import { normalizeFinanceDatabaseIds } from './financeMappers';
import { FinanceDraftStore } from './financeDraft';
import { financeEqual, mergeFinance, type FinanceConflictChoices, type FinanceMergeConflict } from './financeMerge';

const empty = (): FinanceDatabase => ({ version: 1, months: {}, categories: [], fixedExpenses: [], recurringIncomes: [], installmentPlans: [], goals: [] });

export class FinanceSync {
  private base?: FinanceSnapshot;
  private draft: FinanceDraftStore;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private operation?: Promise<void>;
  private active = false;
  private needsRefresh = false;
  private remote?: FinanceSnapshot;
  private choices: FinanceConflictChoices = {};
  private state = { database: empty(), saveError: null as string | null, conflicts: [] as FinanceMergeConflict[], backupError: null as string | null };

  constructor(private userId: string, private repository: FinanceRepository) {
    this.draft = new FinanceDraftStore(userId);
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(update: Partial<typeof this.state>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener());
  }

  start() { this.active = true; }
  stop() { this.active = false; clearTimeout(this.timer); }
  private backup() {
    if (!this.base) return;
    try {
      if (financeEqual(this.base.database, this.state.database)) this.draft.clear();
      else this.draft.write(this.base, this.state.database);
      if (this.state.backupError) this.publish({ backupError: null });
    } catch {
      this.publish({ backupError: 'El navegador no pudo guardar el respaldo local. Exportá una copia desde Datos antes de cerrar esta pestaña.' });
    }
  }

  initialize(snapshot: FinanceSnapshot) {
    if (!this.active || this.base) return;
    snapshot = { ...snapshot, database: normalizeFinanceDatabaseIds(snapshot.database) };
    this.base = snapshot;
    this.publish({ database: snapshot.database });
    try {
      const draft = this.draft.read();
      if (draft) {
        this.base = draft.base;
        this.publish({ database: draft.database });
        this.reconcile(snapshot);
      }
    } catch {
      this.publish({ backupError: 'No pudimos leer el respaldo local. Se conserva sin modificar en este navegador.' });
    }
    this.schedule();
  }

  update = (updater: FinanceDatabase | ((database: FinanceDatabase) => FinanceDatabase)) => {
    if (!this.active || !this.base) return;
    const candidate = typeof updater === 'function' ? updater(this.state.database) : updater;
    if (financeEqual(candidate, this.state.database)) return;
    const database = normalizeFinanceDatabaseIds(candidate);
    this.publish({ database });
    // Synchronous with the edit, before debounce/network and before page reload.
    this.backup();
    this.schedule();
  };

  private schedule() {
    clearTimeout(this.timer);
    if (this.active && this.base && !this.state.conflicts.length && (this.base.needsSave || !financeEqual(this.base.database, this.state.database))) {
      this.timer = setTimeout(() => { void this.flush(); }, 180);
    }
  }

  private reconcile(remote: FinanceSnapshot) {
    if (!this.base) return;
    remote = { ...remote, database: normalizeFinanceDatabaseIds(remote.database) };
    const merged = mergeFinance(this.base.database, this.state.database, remote.database, this.choices);
    this.remote = remote;
    if (merged.conflicts.length) {
      // Both versions remain available. The displayed local data and its base
      // stay intact until the user resolves overlapping edits.
      this.publish({ conflicts: merged.conflicts, saveError: 'Hay cambios distintos sobre el mismo dato. Conservamos tu copia; revisá las diferencias antes de sincronizar.' });
      this.backup();
      return;
    }
    this.base = remote;
    this.remote = undefined;
    this.choices = {};
    this.publish({ database: merged.database, conflicts: [], saveError: null });
    this.backup();
  }

  resolve = (choices: FinanceConflictChoices) => {
    if (!this.remote || !this.base) return;
    this.choices = choices;
    this.reconcile(this.remote);
    if (!this.state.conflicts.length) void this.flush();
  };

  remoteJson = () => JSON.stringify(this.remote?.database ?? this.base?.database ?? empty(), null, 2);

  refresh = () => {
    this.needsRefresh = true;
    this.choices = {};
    return this.flush();
  };

  flush = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.operation) return this.operation;
    this.operation = this.run().finally(() => { this.operation = undefined; });
    return this.operation;
  };

  private async run() {
    let attempts = 0;
    try {
      while (this.active && this.base) {
        if (this.needsRefresh) {
          this.needsRefresh = false;
          const remote = await this.repository.load(this.userId);
          if (!this.active) return;
          this.reconcile(remote);
        }
        if (this.state.conflicts.length) return;
        if (!this.base.needsSave && financeEqual(this.state.database, this.base.database)) {
          this.publish({ saveError: null });
          this.backup();
          return;
        }
        const candidate = this.state.database;
        try {
          const stored = await this.repository.save(candidate, this.base.revision, this.userId);
          if (!this.active) return;
          this.base = stored;
          // Edits made while this request was in flight remain the latest state.
          this.publish({ saveError: null });
          this.backup();
          attempts = 0;
        } catch (error) {
          if (!this.active) return;
          if (!(error instanceof FinanceConflictError)) throw error;
          if (++attempts > 3) throw new Error('Concurrent changes', { cause: error });
          this.needsRefresh = true;
        }
      }
    } catch {
      if (this.active) this.publish({ saveError: 'No pudimos sincronizar los últimos cambios. Tu copia sigue en esta pestaña. Reintentá el guardado.' });
    }
  }
}
