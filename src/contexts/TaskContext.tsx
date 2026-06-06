'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppItem, ItemType, ProjectSummary } from '@/types/task';
import { v4 as uuidv4 } from 'uuid';
import * as storage from '@/utils/storageManager';
import type { RestoreInfo, DataCounts } from '@/utils/storageManager';

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
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateItems = useCallback((newItems: AppItem[]) => {
    setItems(newItems);
  }, []);

  const updateProjectSummaries = useCallback((newSummaries: ProjectSummary[]) => {
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

  return (
    <ItemContext.Provider value={{ 
      items, projectSummaries, 
      addItem, updateItem, deleteItem, updateItems, 
      updateProjectSummaries, updateProjectSummary, clearAll,
      exportData, importData, getDataCounts: getDataCountsFn,
      restoreInfo, acceptRestore, dismissRestore
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
