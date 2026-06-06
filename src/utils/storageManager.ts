import { AppItem, ProjectSummary } from '@/types/task';

// ─── Schema & Keys ───────────────────────────────────────────────
const CURRENT_SCHEMA_VERSION = 2;

const KEY_MAIN           = 'ai-coo-data-main';
const KEY_BACKUP_LATEST  = 'ai-coo-data-backup-latest';
const KEY_BACKUP_PREV    = 'ai-coo-data-backup-previous';

// Legacy keys (pre-Phase 3-2)
const LEGACY_KEY_ITEMS      = 'ai-coo-items';
const LEGACY_KEY_SUMMARIES  = 'ai-coo-project-summaries';
const LEGACY_KEY_OLD_TASKS  = 'ai-secretary-tasks';

// ─── Types ───────────────────────────────────────────────────────
export interface StorageData {
  schemaVersion: number;
  savedAt: number;         // Date.now() timestamp
  items: AppItem[];
  projectSummaries: ProjectSummary[];
}

export interface DataCounts {
  tasks: number;
  memos: number;
  insights: number;
  unclassified: number;
  projectSummaries: number;
  total: number;
}

export interface RestoreInfo {
  source: 'backup-latest' | 'backup-previous';
  savedAt: number;
  counts: DataCounts;
}

// ─── Helpers ─────────────────────────────────────────────────────

function parseStorageData(raw: string | null): StorageData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Validate it looks like StorageData
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
      return parsed as StorageData;
    }
  } catch (e) {
    console.warn('[storageManager] Failed to parse storage data:', e);
  }
  return null;
}

function makeStorageData(items: AppItem[], projectSummaries: ProjectSummary[]): StorageData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: Date.now(),
    items,
    projectSummaries,
  };
}

function countData(data: StorageData): DataCounts {
  const items = data.items || [];
  return {
    tasks: items.filter(i => i.type === 'task').length,
    memos: items.filter(i => i.type === 'memo').length,
    insights: items.filter(i => i.type === 'insight').length,
    unclassified: items.filter(i => i.type === 'unclassified').length,
    projectSummaries: (data.projectSummaries || []).length,
    total: items.length,
  };
}

// ─── Migration from legacy keys ─────────────────────────────────

function migrateLegacyData(): StorageData | null {
  let items: AppItem[] = [];
  let summaries: ProjectSummary[] = [];
  let didMigrate = false;

  // 1) Read from ai-coo-items
  const savedItems = localStorage.getItem(LEGACY_KEY_ITEMS);
  if (savedItems) {
    try {
      const parsed = JSON.parse(savedItems);
      if (Array.isArray(parsed)) {
        items = parsed;
        didMigrate = true;
      }
    } catch (e) {
      console.warn('[storageManager] Failed to parse legacy items', e);
    }
  }

  // 2) Read from ai-coo-project-summaries
  const savedSummaries = localStorage.getItem(LEGACY_KEY_SUMMARIES);
  if (savedSummaries) {
    try {
      const parsed = JSON.parse(savedSummaries);
      if (Array.isArray(parsed)) {
        summaries = parsed;
        didMigrate = true;
      }
    } catch (e) {
      console.warn('[storageManager] Failed to parse legacy summaries', e);
    }
  }

  // 3) Read from ai-secretary-tasks (very old format)
  const oldSaved = localStorage.getItem(LEGACY_KEY_OLD_TASKS);
  if (oldSaved) {
    try {
      const oldTasks = JSON.parse(oldSaved);
      if (Array.isArray(oldTasks) && oldTasks.length > 0) {
        const migratedItems: AppItem[] = oldTasks.map((t: any) => {
          const isUnclassified = t.project === '未分類' && t.cooScore === undefined;
          if (isUnclassified) {
            return {
              id: t.id,
              type: 'unclassified',
              rawInput: t.rawInput || t.title,
              createdAt: t.createdAt || Date.now(),
              updatedAt: Date.now(),
            } as AppItem;
          } else {
            return {
              id: t.id,
              type: 'task',
              rawInput: t.rawInput || t.title,
              title: t.title,
              project: t.project || 'その他',
              priority: t.priority || 'medium',
              urgency: t.urgency || 'medium',
              status: t.status || 'pending',
              requester: t.requester || '自分',
              deadline: t.deadline || null,
              profitImpact: t.profitImpact || 'Medium',
              progressRate: t.progressRate || 0,
              cooScore: t.cooScore,
              cooReason: t.cooReason,
              createdAt: t.createdAt || Date.now(),
              updatedAt: Date.now(),
            } as AppItem;
          }
        });
        items = [...items, ...migratedItems];
        didMigrate = true;
      }
    } catch (e) {
      console.warn('[storageManager] Failed to migrate old tasks', e);
    }
  }

  if (!didMigrate) return null;

  // Clean up legacy keys after migration
  try { localStorage.removeItem(LEGACY_KEY_ITEMS); } catch {}
  try { localStorage.removeItem(LEGACY_KEY_SUMMARIES); } catch {}
  try { localStorage.removeItem(LEGACY_KEY_OLD_TASKS); } catch {}

  console.log(`[storageManager] Migrated ${items.length} items + ${summaries.length} summaries from legacy keys`);
  return makeStorageData(items, summaries);
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Load data from localStorage.
 * Priority: main → migration from legacy keys → null
 */
export function load(): StorageData | null {
  // 1. Try main key
  const mainData = parseStorageData(localStorage.getItem(KEY_MAIN));
  if (mainData && mainData.items.length > 0) {
    return mainData;
  }

  // 2. If main is empty/missing, try migrating from legacy keys
  const migrated = migrateLegacyData();
  if (migrated && migrated.items.length > 0) {
    // Save the migrated data in new format immediately
    save(migrated.items, migrated.projectSummaries);
    return migrated;
  }

  // 3. If main has data but 0 items (empty state), still return it
  if (mainData) return mainData;

  return null;
}

/**
 * Save data with 3-generation backup rotation.
 * Rotation: previous ← latest, latest ← current main, main ← new data
 */
export function save(items: AppItem[], projectSummaries: ProjectSummary[]): void {
  const newData = makeStorageData(items, projectSummaries);
  const newJson = JSON.stringify(newData);

  try {
    // Rotate: backup-previous ← backup-latest
    const latestBackup = localStorage.getItem(KEY_BACKUP_LATEST);
    if (latestBackup) {
      localStorage.setItem(KEY_BACKUP_PREV, latestBackup);
    }

    // Rotate: backup-latest ← current main
    const currentMain = localStorage.getItem(KEY_MAIN);
    if (currentMain) {
      localStorage.setItem(KEY_BACKUP_LATEST, currentMain);
    }

    // Save new data to main
    localStorage.setItem(KEY_MAIN, newJson);
  } catch (e) {
    console.error('[storageManager] Failed to save data:', e);
    // If rotation failed, at least try to save main
    try {
      localStorage.setItem(KEY_MAIN, newJson);
    } catch (e2) {
      console.error('[storageManager] Critical: Failed to save even main data:', e2);
    }
  }
}

/**
 * Check if a backup restore is available.
 * Returns info about the best available backup, or null.
 */
export function checkRestoreAvailable(): RestoreInfo | null {
  // Only suggest restore if main data is empty / missing
  const mainData = parseStorageData(localStorage.getItem(KEY_MAIN));
  if (mainData && mainData.items.length > 0) return null;

  // Try backup-latest first
  const latest = parseStorageData(localStorage.getItem(KEY_BACKUP_LATEST));
  if (latest && latest.items.length > 0) {
    return {
      source: 'backup-latest',
      savedAt: latest.savedAt || 0,
      counts: countData(latest),
    };
  }

  // Try backup-previous
  const prev = parseStorageData(localStorage.getItem(KEY_BACKUP_PREV));
  if (prev && prev.items.length > 0) {
    return {
      source: 'backup-previous',
      savedAt: prev.savedAt || 0,
      counts: countData(prev),
    };
  }

  return null;
}

/**
 * Restore data from a backup source.
 */
export function restoreFromBackup(source: 'backup-latest' | 'backup-previous'): StorageData | null {
  const key = source === 'backup-latest' ? KEY_BACKUP_LATEST : KEY_BACKUP_PREV;
  const data = parseStorageData(localStorage.getItem(key));
  if (data) {
    // Write restored data to main
    localStorage.setItem(KEY_MAIN, JSON.stringify(data));
    console.log(`[storageManager] Restored from ${source}: ${data.items.length} items`);
  }
  return data;
}

/**
 * Create a safety backup before destructive operations (e.g. clearAll).
 * Saves current main data to a dedicated safety key.
 */
export function createSafetyBackup(): boolean {
  try {
    const currentMain = localStorage.getItem(KEY_MAIN);
    if (currentMain) {
      localStorage.setItem('ai-coo-data-safety-backup', currentMain);
      return true;
    }
  } catch (e) {
    console.error('[storageManager] Failed to create safety backup:', e);
  }
  return false;
}

/**
 * Export all data as a JSON string (excluding API key).
 */
export function exportAsJson(items: AppItem[], projectSummaries: ProjectSummary[]): string {
  const exportData = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    items,
    projectSummaries,
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Parse an imported JSON string and return the data.
 * Returns null if invalid format.
 */
export function parseImportJson(jsonStr: string): { items: AppItem[]; projectSummaries: ProjectSummary[] } | null {
  try {
    const parsed = JSON.parse(jsonStr);
    
    // Support both export format and raw StorageData format
    if (parsed && typeof parsed === 'object') {
      const items = parsed.items;
      const summaries = parsed.projectSummaries || [];
      
      if (Array.isArray(items)) {
        return {
          items,
          projectSummaries: Array.isArray(summaries) ? summaries : [],
        };
      }
    }
  } catch (e) {
    console.error('[storageManager] Failed to parse import JSON:', e);
  }
  return null;
}

/**
 * Count the data types in the current items.
 */
export function getDataCounts(items: AppItem[], projectSummaries: ProjectSummary[]): DataCounts {
  return countData(makeStorageData(items, projectSummaries));
}

/**
 * Clear main data. Backups are preserved.
 */
export function clearMainData(): void {
  localStorage.removeItem(KEY_MAIN);
}

/**
 * Format a timestamp to a readable date string.
 */
export function formatBackupDate(timestamp: number): string {
  if (!timestamp) return '不明';
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}
