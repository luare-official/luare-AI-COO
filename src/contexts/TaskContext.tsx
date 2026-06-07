'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppItem, ItemType, ProjectSummary } from '@/types/task';
import { v4 as uuidv4 } from 'uuid';
import * as storage from '@/utils/storageManager';
import type { RestoreInfo, DataCounts } from '@/utils/storageManager';
import * as gdrive from '@/utils/googleDriveSync';

export type AutoSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

interface ItemContextType {
  items: AppItem[];
  projectSummaries: ProjectSummary[];
  addItem: (rawInput: string) => void;
  updateItem: (id: string, updates: Partial<AppItem>) => void;
  deleteItem: (id: string) => void;
  updateItems: (items: AppItem[]) => void;
  updateProjectSummaries: (summaries: ProjectSummary[]) => void;
  updateProjectSummary: (projectName: string, updates: Partial<ProjectSummary>) => void;
  clearAll: () => void;
  // Phase 3-2: Backup & Restore
  exportData: () => void;
  importData: (jsonStr: string) => { success: boolean; message: string };
  getDataCounts: () => DataCounts;
  restoreInfo: RestoreInfo | null;
  acceptRestore: () => void;
  dismissRestore: () => void;
  // Phase 4: Google Drive Sync
  gdriveLinked: boolean;
  isSyncing: boolean;
  lastSyncTime: number | null;
  syncError: string | null;
  autoSyncStatus: AutoSyncStatus;
  syncWithDrive: () => Promise<'synced_to_cloud' | 'loaded_from_cloud' | 'merged_data' | 'already_up_to_date' | void>;
  disconnectDrive: () => void;
}

const ItemContext = createContext<ItemContextType | undefined>(undefined);

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<AppItem[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [restoreInfo, setRestoreInfo] = useState<RestoreInfo | null>(null);

  // Load from LocalStorage on mount via storageManager
  useEffect(() => {
    const loaded = storage.load();
    if (loaded) {
      setItems(loaded.items || []);
      setProjectSummaries(loaded.projectSummaries || []);
    } else {
      // Main data is empty — check if backup restore is available
      const restore = storage.checkRestoreAvailable();
      if (restore) {
        setRestoreInfo(restore);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to LocalStorage whenever items or summaries change (with 3-gen backup rotation)
  useEffect(() => {
    if (isLoaded) {
      storage.save(items, projectSummaries);
    }
  }, [items, projectSummaries, isLoaded]);

  // Quick Add: Instantly adds as "unclassified"
  const addItem = useCallback((rawInput: string) => {
    hasUserMadeChangesRef.current = true;
    const newItem: AppItem = {
      id: uuidv4(),
      type: 'unclassified',
      rawInput,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setItems(prev => [newItem, ...prev]);
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<AppItem>) => {
    hasUserMadeChangesRef.current = true;
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          ...updates,
          updatedAt: Date.now(),
        } as AppItem;
      }
      return item;
    }));
  }, []);

  const deleteItem = useCallback((id: string) => {
    hasUserMadeChangesRef.current = true;
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateItems = useCallback((newItems: AppItem[]) => {
    hasUserMadeChangesRef.current = true;
    setItems(newItems);
  }, []);

  const updateProjectSummaries = useCallback((newSummaries: ProjectSummary[]) => {
    hasUserMadeChangesRef.current = true;
    setProjectSummaries(prev => {
      return newSummaries.map(ns => {
        const existing = prev.find(s => s.projectName === ns.projectName);
        return {
          ...ns,
          manualProgressRate: existing?.manualProgressRate ?? ns.manualProgressRate
        };
      });
    });
  }, []);

  const updateProjectSummary = useCallback((projectName: string, updates: Partial<ProjectSummary>) => {
    hasUserMadeChangesRef.current = true;
    setProjectSummaries(prev => {
      const exists = prev.some(s => s.projectName === projectName);
      if (exists) {
        return prev.map(s => s.projectName === projectName ? { ...s, ...updates } : s);
      } else {
        const newSummary: ProjectSummary = {
          projectName,
          progressRate: 0,
          riskLevel: 'smooth',
          maxBottleneck: null,
          nextAction: null,
          decisionDeadline: null,
          ...updates
        };
        return [...prev, newSummary];
      }
    });
  }, []);

  // Phase 3-2: Enhanced clearAll with safety backup
  const clearAll = useCallback(() => {
    const firstConfirm = confirm('⚠️ すべてのデータ（タスク、メモ、知見、プロジェクト評価）を削除してよろしいですか？\n\n削除前に自動バックアップが作成されます。');
    if (!firstConfirm) return;

    const secondConfirm = confirm('⚠️⚠️ 本当に削除しますか？この操作は元に戻せません。\n\n（バックアップから復元は可能です）');
    if (!secondConfirm) return;

    // Create safety backup before clearing
    storage.createSafetyBackup();
    
    hasUserMadeChangesRef.current = true;
    setItems([]);
    setProjectSummaries([]);
    storage.clearMainData();
  }, []);

  // Phase 3-2: Export data as JSON file download
  const exportData = useCallback(() => {
    const json = storage.exportAsJson(items, projectSummaries);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-coo-backup-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [items, projectSummaries]);

  // Phase 3-2: Import data from JSON string
  const importData = useCallback((jsonStr: string): { success: boolean; message: string } => {
    const parsed = storage.parseImportJson(jsonStr);
    if (!parsed) {
      return { success: false, message: 'JSONファイルの形式が正しくありません。AI COOからエクスポートしたファイルを使用してください。' };
    }

    const counts = storage.getDataCounts(parsed.items, parsed.projectSummaries);
    
    // Create a backup of current data before importing
    storage.createSafetyBackup();

    hasUserMadeChangesRef.current = true;
    setItems(parsed.items);
    setProjectSummaries(parsed.projectSummaries);

    return { 
      success: true, 
      message: `インポート完了: タスク ${counts.tasks}件、メモ ${counts.memos}件、知見 ${counts.insights}件、未分類 ${counts.unclassified}件、プロジェクト評価 ${counts.projectSummaries}件` 
    };
  }, []);

  // Phase 3-2: Get current data counts
  const getDataCountsFn = useCallback((): DataCounts => {
    return storage.getDataCounts(items, projectSummaries);
  }, [items, projectSummaries]);

  // Phase 3-2: Accept restore from backup
  const acceptRestore = useCallback(() => {
    if (!restoreInfo) return;
    hasUserMadeChangesRef.current = true;
    const restored = storage.restoreFromBackup(restoreInfo.source);
    if (restored) {
      setItems(restored.items || []);
      setProjectSummaries(restored.projectSummaries || []);
    }
    setRestoreInfo(null);
  }, [restoreInfo]);

  // Phase 3-2: Dismiss restore suggestion
  const dismissRestore = useCallback(() => {
    setRestoreInfo(null);
  }, []);

  // Phase 4: Google Drive Sync
  const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const [gdriveLinked, setGdriveLinked] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<AutoSyncStatus>('idle');
  const hasUserMadeChangesRef = useRef(false);
  const hasInitialSyncRun = useRef(false);
  const autoSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize GIS on mount
  useEffect(() => {
    if (GOOGLE_CLIENT_ID) {
      gdrive.initGoogleDriveSync(GOOGLE_CLIENT_ID)
        .then(() => {
          setGdriveLinked(gdrive.isGdriveLinked());
          const lastSync = localStorage.getItem('gdrive_last_sync_time');
          if (lastSync) {
            setLastSyncTime(parseInt(lastSync, 10));
          }
        })
        .catch((err) => {
          console.error('[googleDriveSync] Initialization failed:', err);
        });
    }
  }, [GOOGLE_CLIENT_ID]);

  // Sync function
  const syncWithDrive = useCallback(async (interactive: boolean = true) => {
    if (!GOOGLE_CLIENT_ID) {
      const errMessage = 'Google Client ID が設定されていません。.env.local を確認してください。';
      setSyncError(errMessage);
      return;
    }

    setIsSyncing(true);
    setSyncError(null);

    try {
      const loaded = storage.load();
      const localData = loaded || {
        schemaVersion: 2,
        savedAt: 0,
        items: [],
        projectSummaries: [],
      };

      const lastSync = localStorage.getItem('gdrive_last_sync_time');
      const isFirstSync = !lastSync;
      const result = await gdrive.syncWithGoogleDrive(localData, isFirstSync, interactive);

      if ((result.action === 'loaded_from_cloud' || result.action === 'merged_data') && result.cloudData) {
        // Create safety backup of current local data before overwriting
        storage.createSafetyBackup();
        
        setItems(result.cloudData.items || []);
        setProjectSummaries(result.cloudData.projectSummaries || []);
        storage.save(result.cloudData.items || [], result.cloudData.projectSummaries || []);
      }

      setGdriveLinked(true);
      const now = Date.now();
      setLastSyncTime(now);
      localStorage.setItem('gdrive_last_sync_time', String(now));

      setIsSyncing(false);
      return result.action;
    } catch (err: any) {
      console.error('[googleDriveSync] Sync failed:', err);
      setSyncError(err.message === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : err.message || '同期中にエラーが発生しました。');
      setIsSyncing(false);
      throw err;
    }
  }, [GOOGLE_CLIENT_ID]);

  // Phase 4: Initial Auto Sync on mount
  useEffect(() => {
    if (gdriveLinked && !hasInitialSyncRun.current) {
      hasInitialSyncRun.current = true;
      const autoSyncOnStartup = localStorage.getItem('auto_sync_on_startup') !== 'false';
      if (!autoSyncOnStartup) return;

      hasUserMadeChangesRef.current = false;
      setAutoSyncStatus('syncing');
      syncWithDrive(false)
        .then(() => {
          setAutoSyncStatus('success');
          setTimeout(() => setAutoSyncStatus('idle'), 3000);
        })
        .catch(() => {
          setAutoSyncStatus('error');
          setTimeout(() => setAutoSyncStatus('idle'), 5000);
        });
    }
  }, [gdriveLinked, syncWithDrive]);

  // Phase 4: Debounced Auto Sync on data change
  useEffect(() => {
    if (!isLoaded || !gdriveLinked) return;

    if (!hasUserMadeChangesRef.current) {
      return;
    }

    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = setTimeout(() => {
      hasUserMadeChangesRef.current = false;
      setAutoSyncStatus('syncing');
      syncWithDrive(false)
        .then(() => {
          setAutoSyncStatus('success');
          setTimeout(() => setAutoSyncStatus('idle'), 3000);
        })
        .catch(() => {
          setAutoSyncStatus('error');
          setTimeout(() => setAutoSyncStatus('idle'), 5000);
        });
    }, 4000);

    return () => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
  }, [items, projectSummaries, isLoaded, gdriveLinked, syncWithDrive]);

  // Disconnect function
  const disconnectDrive = useCallback(() => {
    gdrive.disconnectGoogleDrive();
    setGdriveLinked(false);
    setLastSyncTime(null);
    setSyncError(null);
    localStorage.removeItem('gdrive_last_sync_time');
  }, []);

  return (
    <ItemContext.Provider value={{ 
      items, projectSummaries, 
      addItem, updateItem, deleteItem, updateItems, 
      updateProjectSummaries, updateProjectSummary, clearAll,
      exportData, importData, getDataCounts: getDataCountsFn,
      restoreInfo, acceptRestore, dismissRestore,
      gdriveLinked, isSyncing, lastSyncTime, syncError, autoSyncStatus,
      syncWithDrive, disconnectDrive
    }}>
      {children}
    </ItemContext.Provider>
  );
}

export function useItems() {
  const context = useContext(ItemContext);
  if (context === undefined) {
    throw new Error('useItems must be used within a TaskProvider');
  }
  return context;
}
