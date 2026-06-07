'use client';

import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { useItems } from '@/contexts/TaskContext';
import { cooPrioritizeClientSide, testGeminiConnection } from '@/utils/geminiClient';
import styles from './page.module.css';
import { 
  Send, CheckCircle2, Circle, Clock, Briefcase, User, Sparkles, 
  Loader2, ListTodo, XCircle, AlertCircle, Settings, X, 
  FileText, Lightbulb, HelpCircle, ChevronDown, ChevronUp, Trash2,
  Play, Edit2, Hourglass, HelpCircle as HelpIcon, FileQuestion, RotateCcw,
  Download, Upload, ShieldCheck, Database, Cloud, CloudOff, RefreshCw
} from 'lucide-react';
import { formatBackupDate } from '@/utils/storageManager';
import { AppItem, TaskItem, MemoItem, InsightItem, Status, Priority, ProjectSummary } from '@/types/task';

export default function Home() {
  const { 
    items, projectSummaries, addItem, updateItem, deleteItem, updateItems, 
    updateProjectSummaries, updateProjectSummary, clearAll, exportData, 
    importData, getDataCounts, restoreInfo, acceptRestore, dismissRestore,
    gdriveLinked, isSyncing, lastSyncTime, syncError, autoSyncStatus, syncWithDrive, disconnectDrive
  } = useItems();
  const [inputValue, setInputValue] = useState('');
  const [isCooEvaluating, setIsCooEvaluating] = useState(false);
  const [cooMessage, setCooMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'ceo' | 'today' | 'all' | 'memo-insight' | 'roadmap'>('ceo');
  
  // Progress manual edit state
  const [editingProjectProgress, setEditingProjectProgress] = useState<string | null>(null);
  const [progressInputValue, setProgressInputValue] = useState<string>('');
  
  // ADHD Risk Filter state
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<'red' | 'yellow' | 'green' | null>(null);
  
  // Today's date based on browser
  const [todayStr, setTodayStr] = useState('2026-06-06');
  const [todayDate, setTodayDate] = useState<Date | null>(null);

  // Bulk fix report state
  const [bulkFixReport, setBulkFixReport] = useState<{ title: string; oldDeadline: string; newDeadline: string; }[]>([]);
  
  // Settings / API Key Modal state
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-2.5-flash-lite');
  
  // Temporary state for settings edits
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempModelName, setTempModelName] = useState('gemini-2.5-flash-lite');
  const [tempAutoSync, setTempAutoSync] = useState(true);
  const [tempKeepLogin, setTempKeepLogin] = useState(true);

  // Connection Test state
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testErrorMessage, setTestErrorMessage] = useState('');

  // Task Edit Modal state
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editProject, setEditProject] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState('');
  const [editActualMinutes, setEditActualMinutes] = useState('');
  const [editWaitingDays, setEditWaitingDays] = useState('');
  const [editBottleneck, setEditBottleneck] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editStatus, setEditStatus] = useState<Status>('pending');
  const [editTargetDate, setEditTargetDate] = useState('');
  const [editManualRiskLevel, setEditManualRiskLevel] = useState<'green' | 'yellow' | 'red' | ''>('');

  // Phase 3-2: Import state
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 4: Google Drive sync message
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // Auto-focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    
    const savedKey = localStorage.getItem('gemini-api-key') || '';
    const savedModel = localStorage.getItem('gemini-model-name') || 'gemini-2.5-flash-lite';
    setApiKey(savedKey);
    setModelName(savedModel);
    
    setTempAutoSync(localStorage.getItem('auto_sync_on_startup') !== 'false');
    setTempKeepLogin(localStorage.getItem('keep_google_login') !== 'false');

    // Get current date
    const d = new Date();
    setTodayDate(d);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    setTodayStr(`${y}-${m}-${date}`);
  }, []);

  const handleOpenSettings = () => {
    setTempApiKey(apiKey);
    setTempModelName(modelName);
    setTestStatus('idle');
    setTestErrorMessage('');
    setImportMessage(null);
    setSyncMessage(null);
    setShowSettings(true);
  };

  const handleSyncWithDrive = async () => {
    setSyncMessage(null);
    try {
      const action = await syncWithDrive();
      let msgText = '同期が完了しました。';
      if (action === 'synced_to_cloud') {
        msgText = 'ローカルをGoogle Driveへ保存しました';
      } else if (action === 'loaded_from_cloud') {
        msgText = 'Google Driveから読み込みました';
      } else if (action === 'merged_data') {
        msgText = 'ローカルとGoogle Driveをマージしました';
      } else if (action === 'already_up_to_date') {
        msgText = 'データは最新です';
      }
      setSyncMessage({ type: 'success', text: msgText });
    } catch (err: any) {
      setSyncMessage({ 
        type: 'error', 
        text: err.message || 'Google Drive同期に失敗しました。時間をおいて再度お試しください。' 
      });
    }
  };

  const handleDisconnectDrive = () => {
    if (confirm('Google Driveとの連携を解除しますか？\n（ローカルのデータは削除されません）')) {
      disconnectDrive();
      setSyncMessage({ type: 'success', text: 'Google Driveとの連携を解除しました。' });
    }
  };

  const saveSettings = () => {
    const trimmedKey = tempApiKey.trim();
    const trimmedModel = tempModelName.trim();

    setApiKey(trimmedKey);
    setModelName(trimmedModel);
    
    localStorage.setItem('gemini-api-key', trimmedKey);
    localStorage.setItem('gemini-model-name', trimmedModel);
    localStorage.setItem('auto_sync_on_startup', tempAutoSync ? 'true' : 'false');
    localStorage.setItem('keep_google_login', tempKeepLogin ? 'true' : 'false');
    
    setShowSettings(false);
  };

  const deleteApiKey = () => {
    if (confirm('保存されているAPIキーを削除してよろしいですか？')) {
      setApiKey('');
      setTempApiKey('');
      localStorage.removeItem('gemini-api-key');
      setTestStatus('idle');
      setTestErrorMessage('');
    }
  };

  const handleTestConnection = async () => {
    const keyToTest = tempApiKey.trim();
    if (!keyToTest) {
      setTestStatus('error');
      setTestErrorMessage('テストするAPIキーが入力されていません。');
      return;
    }

    setTestStatus('testing');
    setTestErrorMessage('');

    try {
      await testGeminiConnection(keyToTest, tempModelName.trim());
      setTestStatus('success');
    } catch (error: any) {
      setTestStatus('error');
      setTestErrorMessage(error.message || '接続に失敗しました。キーを確認してください。');
    }
  };

  const getMaskedKey = (keyString: string) => {
    if (!keyString) return '未設定';
    if (keyString.length <= 8) return 'キーが短すぎます';
    return `${keyString.substring(0, 4)}...${keyString.substring(keyString.length - 4)}`;
  };

  // Grouping & Filtering items
  const tasks = items.filter(item => item.type === 'task') as TaskItem[];
  const memos = items.filter(item => item.type === 'memo') as MemoItem[];
  const insights = items.filter(item => item.type === 'insight') as InsightItem[];
  const unclassified = items.filter(item => item.type === 'unclassified');

  const PROJECTS = [
    "シリコンビブ卸事業",
    "Luareブログ自動化",
    "Luareホームページリニューアル",
    "税理士紹介ビジネス",
    "中国移住準備",
    "家庭関連タスク",
    "その他"
  ];
  const activeProjects = PROJECTS.filter(proj => tasks.some(t => t.project === proj));

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const notDoingNowTasks = tasks.filter(t => t.status === 'not-doing-now');

  // Helper for computing waiting progress
  const getRemainingWaitingDays = (task: TaskItem) => {
    if (!task.waitingDays || !task.waitingSince) return 0;
    const elapsedMs = Date.now() - task.waitingSince;
    const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
    const remaining = task.waitingDays - elapsedDays;
    return remaining > 0 ? remaining : 0;
  };

  // 2. 待機中タスク (waitingDays があり、未完了のタスク)
  const waitingTasks = pendingTasks.filter(t => t.waitingDays && t.waitingDays > 0);

  // Sorted pending tasks by AI Score descending
  const sortedPendingTasks = [...pendingTasks].sort((a, b) => {
    if (a.cooScore !== undefined && b.cooScore !== undefined) {
      return b.cooScore - a.cooScore;
    }
    return b.createdAt - a.createdAt;
  });

  // 1. 今日やる TOP 3
  const todayTop3 = sortedPendingTasks.slice(0, 3);
  
  // 期限が近い案件 (Deadline is set and status is pending)
  const dueSoonTasks = pendingTasks
    .filter(t => t.deadline !== null)
    .sort((a, b) => {
      const dateA = new Date(a.deadline!).getTime();
      const dateB = new Date(b.deadline!).getTime();
      return dateA - dateB;
    });

  // 夫からの依頼
  const husbandTasks = pendingTasks.filter(t => t.requester === '夫');

  // 停滞案件 (14日以上更新なし)
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const stalledTasks = pendingTasks.filter(t => t.updatedAt < fourteenDaysAgo);

  // 保留中タスク (Top 3 以外の pending タスク)
  const otherPendingTasks = sortedPendingTasks.slice(3);

  // 過去期限のタスク
  const pastDeadlineTasks = pendingTasks.filter(t => t.deadline && t.deadline < todayStr);

  // ボトルネックTOP5
  const blockedTasks = pendingTasks.filter(t => t.bottleneck);
  const top5Blocked = [...blockedTasks].sort((a, b) => {
    if (a.cooScore !== undefined || b.cooScore !== undefined) {
      const scoreA = a.cooScore ?? -1;
      const scoreB = b.cooScore ?? -1;
      if (scoreA !== scoreB) return scoreB - scoreA;
    }
    if (a.deadline && b.deadline) {
      return a.deadline < b.deadline ? -1 : 1;
    } else if (a.deadline) return -1;
    else if (b.deadline) return 1;
    const waitA = a.waitingDays || 0;
    const waitB = b.waitingDays || 0;
    return waitB - waitA;
  }).slice(0, 5);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Quick Add: Local save only
    addItem(inputValue);
    setInputValue('');
    
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleCooEvaluate = async () => {
    if (!apiKey) {
      handleOpenSettings();
      setCooMessage('先に設定画面からGemini APIキーを設定してください。');
      return;
    }

    setIsCooEvaluating(true);
    setCooMessage('AI COOがタスク、メモ、知見を整理しています。しばらくお待ちください...');
    try {
      const result = await cooPrioritizeClientSide(items, apiKey, modelName);
      updateItems(result.items);
      updateProjectSummaries(result.projectSummaries);
      setCooMessage(result.message);
    } catch (error: any) {
      console.error('COO Evaluation failed', error);
      setCooMessage(error.message || 'AI COOの整理に失敗しました。');
    } finally {
      setIsCooEvaluating(false);
    }
  };

  // Start Detail Editing Modal
  const handleStartEdit = (task: TaskItem) => {
    setEditingTask(task);
    setEditTitle(task.title || '');
    setEditProject(task.project || 'その他');
    setEditDeadline(task.deadline || '');
    setEditEstimatedMinutes(task.estimatedMinutes?.toString() || '');
    setEditActualMinutes(task.actualMinutes?.toString() || '');
    setEditWaitingDays(task.waitingDays?.toString() || '');
    setEditBottleneck(task.bottleneck || '');
    setEditNotes(task.notes || '');
    setEditPriority(task.priority || 'medium');
    setEditStatus(task.status || 'pending');
    setEditTargetDate(task.targetDate || '');
    setEditManualRiskLevel(task.manualRiskLevel || '');
  };

  // Save Detail Editing Modal
  const handleSaveEdit = () => {
    if (!editingTask) return;
    
    const oldWaitingDays = editingTask.waitingDays || 0;
    const newWaitingDays = Number(editWaitingDays) || 0;
    let waitingSince = editingTask.waitingSince;
    
    if (newWaitingDays > 0 && oldWaitingDays !== newWaitingDays) {
      waitingSince = Date.now();
    } else if (newWaitingDays === 0) {
      waitingSince = undefined;
    }

    const isDeadlineChanged = editDeadline !== (editingTask.deadline || '');
    const isDeadlineHandEdited = isDeadlineChanged ? true : editingTask.isDeadlineHandEdited;
    
    const isEstimatedMinutesChanged = editEstimatedMinutes !== (editingTask.estimatedMinutes?.toString() || '');
    const isEstimatedMinutesManual = isEstimatedMinutesChanged ? true : editingTask.isEstimatedMinutesManual;

    updateItem(editingTask.id, {
      title: editTitle,
      project: editProject,
      deadline: editDeadline || null,
      isDeadlineHandEdited: isDeadlineHandEdited,
      estimatedMinutes: editEstimatedMinutes ? Number(editEstimatedMinutes) : undefined,
      isEstimatedMinutesManual: isEstimatedMinutesManual,
      actualMinutes: editActualMinutes ? Number(editActualMinutes) : 0,
      waitingDays: newWaitingDays || undefined,
      waitingSince: waitingSince,
      bottleneck: editBottleneck || undefined,
      notes: editNotes || undefined,
      priority: editPriority as Priority,
      status: editStatus as Status,
      targetDate: editTargetDate || null,
      manualRiskLevel: editManualRiskLevel || undefined,
    });
    
    setEditingTask(null);
  };

  // Phase 3-1 extension: Quick Date helper for edit modal
  const handleQuickDate = (setter: React.Dispatch<React.SetStateAction<string>>, days: number, baseDateStr?: string) => {
    let d = new Date();
    if (baseDateStr) {
      const [y, m, day] = baseDateStr.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m) && !isNaN(day)) {
        d = new Date(y, m - 1, day);
      }
    }
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setter(`${y}-${m}-${day}`);
  };

  const handleBulkFix = (pastDeadlineTasks: TaskItem[]) => {
    if (pastDeadlineTasks.length === 0) return;
    
    const count = pastDeadlineTasks.length;
    const isConfirmed = confirm(`過去期限のタスク ${count}件 を未来日に補正します。実行しますか？`);
    if (!isConfirmed) return;

    const reports: { title: string; oldDeadline: string; newDeadline: string; }[] = [];
    
    const updatedItems = items.map(item => {
      if (item.type === 'task' && item.deadline && item.deadline < todayStr && item.status !== 'completed') {
        const [y, m, d] = item.deadline.split('-');
        const currentYear = new Date().getFullYear();
        
        let candidateStr = `${currentYear}-${m}-${d}`;
        if (candidateStr < todayStr) {
          candidateStr = `${currentYear + 1}-${m}-${d}`;
        }
        
        reports.push({
          title: item.title,
          oldDeadline: item.deadline,
          newDeadline: candidateStr
        });

        return {
          ...item,
          deadline: candidateStr,
          isDeadlineHandEdited: true,
          updatedAt: Date.now()
        } as TaskItem;
      }
      return item;
    });

    updateItems(updatedItems);
    setBulkFixReport(reports);
    alert('過去期限の一括補正が完了しました！');
  };

  const handleGoToProjectRoadmap = (projectName: string) => {
    setActiveTab('roadmap');
    setTimeout(() => {
      const el = document.getElementById(`roadmap-project-${projectName}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleSaveProjectProgress = (projectName: string) => {
    const val = Number(progressInputValue);
    if (isNaN(val) || val < 0 || val > 100) {
      alert('進捗率は0から100の数値を入力してください。');
      return;
    }
    updateProjectSummary(projectName, { manualProgressRate: val });
    setEditingProjectProgress(null);
  };

  const toggleTaskStatus = (task: TaskItem) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    updateItem(task.id, { status: newStatus });
  };

  const toggleNotDoingNow = (task: TaskItem) => {
    const newStatus = task.status === 'not-doing-now' ? 'pending' : 'not-doing-now';
    updateItem(task.id, { status: newStatus });
  };

  const toggleAccordion = (id: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Phase 3-2: Handle file import
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setImportMessage({ type: 'error', text: 'ファイルの読み込みに失敗しました。' });
        return;
      }

      const confirmImport = confirm(
        `「${file.name}」からデータをインポートします。\n\n現在のデータは上書きされます（インポート前に自動バックアップが作成されます）。\n\n続行しますか？`
      );
      if (!confirmImport) {
        setImportMessage(null);
        return;
      }

      const result = importData(text);
      setImportMessage({ type: result.success ? 'success' : 'error', text: result.message });
    };
    reader.onerror = () => {
      setImportMessage({ type: 'error', text: 'ファイルの読み込み中にエラーが発生しました。' });
    };
    reader.readAsText(file);

    // Reset file input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <Sparkles size={24} color="var(--accent)" />
          AI COO
        </h1>
        <div className={styles.headerRight}>
          {autoSyncStatus !== 'idle' && (
            <div className={`${styles.autoSyncBadge} ${styles[autoSyncStatus]}`}>
              {autoSyncStatus === 'syncing' && <RefreshCw size={14} className={styles.spin} />}
              {autoSyncStatus === 'success' && <CheckCircle2 size={14} />}
              {autoSyncStatus === 'error' && <AlertCircle size={14} />}
              <span>
                {autoSyncStatus === 'syncing' && '同期中...'}
                {autoSyncStatus === 'success' && '同期完了'}
                {autoSyncStatus === 'error' && '同期失敗'}
              </span>
            </div>
          )}
          {unclassified.length > 0 && (
            <div className={styles.unclassifiedBadge}>
              <AlertCircle size={14} />
              未整理 {unclassified.length}件
            </div>
          )}
          <button onClick={handleOpenSettings} className={styles.settingsBtn} title="APIキー・モデル設定">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Auth Required Banner */}
      {syncError === 'AUTH_REQUIRED' && (
        <div className={styles.authBanner} style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #ffeeba' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <strong>Google Drive の再認証が必要です</strong>
          </div>
          <button 
            onClick={() => handleSyncWithDrive()} 
            style={{ backgroundColor: '#856404', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ワンタップでログイン
          </button>
        </div>
      )}

      {/* Phase 3-2: Restore Banner */}
      {restoreInfo && (
        <div className={styles.restoreBanner}>
          <div className={styles.restoreBannerContent}>
            <ShieldCheck size={20} />
            <div className={styles.restoreBannerText}>
              <strong>バックアップからの復元が可能です</strong>
              <span>
                {formatBackupDate(restoreInfo.savedAt)} のデータ（{restoreInfo.counts.total}件）が見つかりました。
                復元しますか？
              </span>
            </div>
            <div className={styles.restoreBannerActions}>
              <button onClick={acceptRestore} className={styles.restoreAcceptBtn}>
                復元する
              </button>
              <button onClick={dismissRestore} className={styles.restoreDismissBtn}>
                無視する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: '540px' }}>
            <div className={styles.modalHeader}>
              <h3>⚙️ 設定</h3>
              <button onClick={() => { setShowSettings(false); setImportMessage(null); setSyncMessage(null); }} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody} style={{ maxHeight: '75vh', overflowY: 'auto' }}>

              {/* ── API Settings Section ── */}
              <div className={styles.settingsSection}>
                <h4 className={styles.settingsSectionTitle}>🔑 API設定</h4>
                <p className={styles.helpText}>
                  APIキーとモデル名を設定してください。キーは安全にブラウザ内にのみ保存されます。
                </p>

                <div className={styles.keyDisplayBox}>
                  <span className={styles.keyLabel}>現在有効なキー:</span>
                  <span className={styles.keyValue}>{getMaskedKey(apiKey)}</span>
                  {apiKey && (
                    <button onClick={deleteApiKey} className={styles.deleteKeyBtn} title="キーを削除">
                      キー削除
                    </button>
                  )}
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="apiKey">新しい API キーを入力:</label>
                  <input
                    type="password"
                    id="apiKey"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className={styles.modalInput}
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="modelName">使用モデル名 (第一候補):</label>
                  <input
                    type="text"
                    id="modelName"
                    value={tempModelName}
                    onChange={(e) => setTempModelName(e.target.value)}
                    placeholder="gemini-2.5-flash-lite"
                    className={styles.modalInput}
                  />
                  <span className={styles.helpText} style={{ marginTop: '2px', display: 'block' }}>
                    ※これが使えない場合は自動で <b>gemini-2.5-flash</b> へフォールバックします。
                  </span>
                </div>

                <div className={styles.testConnectionArea}>
                  <button 
                    onClick={handleTestConnection} 
                    className={styles.testBtn}
                    disabled={testStatus === 'testing'}
                  >
                    {testStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    接続テストを実行
                  </button>

                  {testStatus === 'testing' && <span className={styles.testTesting}>テスト通信中...</span>}
                  {testStatus === 'success' && <span className={styles.testSuccess}>🟢 接続成功！</span>}
                  {testStatus === 'error' && (
                    <div className={styles.testErrorBox}>
                      🔴 エラー: {testErrorMessage}
                    </div>
                  )}
                </div>

                <div className={styles.modalActions}>
                  <button onClick={saveSettings} className={styles.saveBtn}>
                    設定を保存
                  </button>
                </div>
              </div>

              {/* ── Sync Settings Section ── */}
              <div className={styles.settingsSection}>
                <h4 className={styles.settingsSectionTitle}>🔄 同期設定</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={tempAutoSync}
                      onChange={(e) => setTempAutoSync(e.target.checked)}
                    />
                    <span>起動時に自動同期する</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={tempKeepLogin}
                      onChange={(e) => setTempKeepLogin(e.target.checked)}
                    />
                    <span>Googleログイン状態を維持する</span>
                  </label>
                </div>
                <div className={styles.modalActions}>
                  <button onClick={saveSettings} className={styles.saveBtn}>
                    設定を保存
                  </button>
                </div>
              </div>

              {/* ── Data Management Section ── */}
              <div className={styles.settingsSection}>
                <h4 className={styles.settingsSectionTitle}>
                  <Database size={16} />
                  データ管理・バックアップ
                </h4>

                {/* Data Counts */}
                {(() => {
                  const counts = getDataCounts();
                  return (
                    <div className={styles.dataCountsGrid}>
                      <div className={styles.dataCountItem}>
                        <span className={styles.dataCountLabel}>📋 タスク</span>
                        <span className={styles.dataCountValue}>{counts.tasks}</span>
                      </div>
                      <div className={styles.dataCountItem}>
                        <span className={styles.dataCountLabel}>📝 メモ</span>
                        <span className={styles.dataCountValue}>{counts.memos}</span>
                      </div>
                      <div className={styles.dataCountItem}>
                        <span className={styles.dataCountLabel}>💡 知見</span>
                        <span className={styles.dataCountValue}>{counts.insights}</span>
                      </div>
                      <div className={styles.dataCountItem}>
                        <span className={styles.dataCountLabel}>❓ 未分類</span>
                        <span className={styles.dataCountValue}>{counts.unclassified}</span>
                      </div>
                      <div className={styles.dataCountItem}>
                        <span className={styles.dataCountLabel}>📊 プロジェクト</span>
                        <span className={styles.dataCountValue}>{counts.projectSummaries}</span>
                      </div>
                      <div className={styles.dataCountItem}>
                        <span className={styles.dataCountLabel}>📦 合計</span>
                        <span className={styles.dataCountValue}><strong>{counts.total}</strong></span>
                      </div>
                    </div>
                  );
                })()}

                {/* Export / Import Buttons */}
                <div className={styles.backupActions}>
                  <button onClick={exportData} className={styles.exportBtn}>
                    <Download size={16} />
                    データをエクスポート (JSON)
                  </button>

                  <button onClick={() => fileInputRef.current?.click()} className={styles.importBtn}>
                    <Upload size={16} />
                    データをインポート
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileImport}
                    style={{ display: 'none' }}
                  />
                </div>

                {/* Import Message */}
                {importMessage && (
                  <div className={importMessage.type === 'success' ? styles.importSuccess : styles.importError}>
                    {importMessage.type === 'success' ? '✅' : '❌'} {importMessage.text}
                  </div>
                )}

                {/* Data Protection Info */}
                <div className={styles.dataProtectionInfo}>
                  <ShieldCheck size={14} />
                  <span>データは3世代バックアップで自動保護されています。削除前にも自動バックアップが作成されます。</span>
                </div>

                {/* Danger Zone */}
                <div className={styles.dangerZone}>
                  <button onClick={clearAll} className={styles.dangerBtn}>
                    <Trash2 size={14} />
                    全データ削除
                  </button>
                </div>
              </div>

              {/* ── Google Drive Sync Section ── */}
              <div className={styles.settingsSection}>
                <h4 className={styles.settingsSectionTitle}>
                  <Cloud size={16} />
                  Google Drive 同期 (PC・スマホ同期)
                </h4>
                <p className={styles.helpText}>
                  個人の Google Drive を使用して、PCとスマートフォンの間でデータを安全に同期します。（APIキーは同期されません）
                </p>

                <div className={styles.gdriveSyncBox}>
                  <div className={styles.gdriveStatusRow}>
                    <span className={styles.gdriveStatusLabel}>ステータス:</span>
                    {gdriveLinked ? (
                      <span className={styles.gdriveStatusActive}>
                        <CheckCircle2 size={14} /> 連携中
                      </span>
                    ) : (
                      <span className={styles.gdriveStatusInactive}>
                        <CloudOff size={14} /> 未連携
                      </span>
                    )}
                  </div>

                  {lastSyncTime && (
                    <div className={styles.gdriveStatusRow}>
                      <span className={styles.gdriveStatusLabel}>最終同期:</span>
                      <span className={styles.gdriveStatusValue}>{formatBackupDate(lastSyncTime)}</span>
                    </div>
                  )}

                  {syncError && syncError !== 'AUTH_REQUIRED' && (
                    <div className={styles.syncErrorBox}>
                      <AlertCircle size={14} /> {syncError}
                    </div>
                  )}

                  {syncMessage && (
                    <div className={syncMessage.type === 'success' ? styles.syncSuccess : styles.syncError}>
                      {syncMessage.type === 'success' ? '✅' : '❌'} {syncMessage.text}
                    </div>
                  )}

                  <div className={styles.gdriveActions}>
                    <button 
                      onClick={handleSyncWithDrive} 
                      className={styles.syncBtn}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          同期中...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={16} />
                          {gdriveLinked ? '今すぐ同期' : 'Google Driveと連携して同期'}
                        </>
                      )}
                    </button>

                    {gdriveLinked && (
                      <button 
                        onClick={handleDisconnectDrive} 
                        className={styles.disconnectBtn}
                        disabled={isSyncing}
                      >
                        連携解除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Edit Detail Modal */}
      {editingTask && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: '520px' }}>
            <div className={styles.modalHeader}>
              <h3>📝 タスク詳細編集</h3>
              <button onClick={() => setEditingTask(null)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody} style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              <div className={styles.inputGroup}>
                <label>タスク名:</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className={styles.modalInput}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label>プロジェクト:</label>
                  <select 
                    value={editProject} 
                    onChange={(e) => setEditProject(e.target.value)}
                    className={styles.modalSelect}
                  >
                    <option value="シリコンビブ卸事業">シリコンビブ卸事業</option>
                    <option value="Luareブログ自動化">Luareブログ自動化</option>
                    <option value="Luareホームページリニューアル">Luareホームページリニューアル</option>
                    <option value="税理士紹介ビジネス">税理士紹介ビジネス</option>
                    <option value="中国移住準備">中国移住準備</option>
                    <option value="家庭関連タスク">家庭関連タスク</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label>自分用目標期限:</label>
                  <input
                    type="date"
                    value={editTargetDate}
                    onChange={(e) => setEditTargetDate(e.target.value)}
                    className={styles.modalInput}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>絶対締切から逆算:</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        onClick={() => handleQuickDate(setEditTargetDate, -1, editDeadline)} 
                        className={styles.inlineActionBtn}
                        disabled={!editDeadline}
                        style={{ padding: '6px 10px', fontSize: '0.85rem', flex: 1 }}
                      >-1日</button>
                      <button 
                        onClick={() => handleQuickDate(setEditTargetDate, -3, editDeadline)} 
                        className={styles.inlineActionBtn}
                        disabled={!editDeadline}
                        style={{ padding: '6px 10px', fontSize: '0.85rem', flex: 1 }}
                      >-3日</button>
                      <button 
                        onClick={() => handleQuickDate(setEditTargetDate, -7, editDeadline)} 
                        className={styles.inlineActionBtn}
                        disabled={!editDeadline}
                        style={{ padding: '6px 10px', fontSize: '0.85rem', flex: 1 }}
                      >-1週</button>
                    </div>
                  </div>
                </div>
                
                <div className={styles.inputGroup}>
                  <label>
                    絶対締切:
                    {editDeadline && editDeadline < todayStr && (
                      <span className={styles.inputWarning} style={{marginLeft: '8px'}}>⚠️過去</span>
                    )}
                    {editTargetDate && editDeadline && editTargetDate > editDeadline && (
                      <span className={styles.inputWarning} style={{marginLeft: '8px'}}>⚠️逆転</span>
                    )}
                  </label>
                  <input
                    type="date"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className={`${styles.modalInput} ${editDeadline && editDeadline < todayStr ? styles.inputErrorBorder : ''}`}
                  />
                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                    <button onClick={() => handleQuickDate(setEditDeadline, 3, editTargetDate || todayStr)} className={styles.inlineActionBtn}>+3日</button>
                    <button onClick={() => handleQuickDate(setEditDeadline, 7, editTargetDate || todayStr)} className={styles.inlineActionBtn}>+1週</button>
                    <button onClick={() => handleQuickDate(setEditDeadline, 30, editTargetDate || todayStr)} className={styles.inlineActionBtn}>+1月</button>
                  </div>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label>優先度:</label>
                  <select 
                    value={editPriority} 
                    onChange={(e) => setEditPriority(e.target.value as Priority)}
                    className={styles.modalSelect}
                  >
                    <option value="high">高 (High)</option>
                    <option value="medium">中 (Medium)</option>
                    <option value="low">低 (Low)</option>
                  </select>
                </div>
                
                <div className={styles.inputGroup}>
                  <label>ステータス:</label>
                  <select 
                    value={editStatus} 
                    onChange={(e) => setEditStatus(e.target.value as Status)}
                    className={styles.modalSelect}
                  >
                    <option value="pending">保留中</option>
                    <option value="not-doing-now">今やらない</option>
                    <option value="completed">完了</option>
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label>想定工数 (分):</label>
                  <input
                    type="number"
                    value={editEstimatedMinutes}
                    onChange={(e) => setEditEstimatedMinutes(e.target.value)}
                    placeholder="例: 30, 120"
                    className={styles.modalInput}
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label>実績工数 (分):</label>
                  <input
                    type="number"
                    value={editActualMinutes}
                    onChange={(e) => setEditActualMinutes(e.target.value)}
                    placeholder="例: 15, 60"
                    className={styles.modalInput}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label>手動危険度補正:</label>
                  <select 
                    value={editManualRiskLevel} 
                    onChange={(e) => setEditManualRiskLevel(e.target.value as any)}
                    className={styles.modalSelect}
                  >
                    <option value="">自動判定に従う</option>
                    <option value="green">🟢 順調 (Green)</option>
                    <option value="yellow">🟡 注意 (Yellow)</option>
                    <option value="red">🔴 危険 (Red)</option>
                  </select>
                  {!editManualRiskLevel && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      自動判定予測: {(() => {
                        const d = editDeadline;
                        const t = editTargetDate;
                        if (d && d <= todayStr) return '🔴 危険';
                        if (d) {
                          const diff = Math.ceil((new Date(d).getTime() - new Date(todayStr).getTime()) / (1000*60*60*24));
                          if (diff <= 3) return '🔴 危険';
                        }
                        if (t && t < todayStr) return '🟡 注意';
                        return '🟢 順調';
                      })()}
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label>待機日数 (日):</label>
                  <input
                    type="number"
                    value={editWaitingDays}
                    onChange={(e) => setEditWaitingDays(e.target.value)}
                    placeholder="例: 14"
                    className={styles.modalInput}
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label>ボトルネック理由:</label>
                  <input
                    type="text"
                    value={editBottleneck}
                    onChange={(e) => setEditBottleneck(e.target.value)}
                    placeholder="例: GS1審査待ち"
                    className={styles.modalInput}
                  />
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label>メモ / 備忘録:</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="追加情報や手順など..."
                  rows={3}
                  className={styles.modalTextarea}
                />
              </div>

              <div className={styles.modalActions}>
                <button onClick={handleSaveEdit} className={styles.saveBtn}>
                  変更を保存
                </button>
                <button onClick={() => setEditingTask(null)} className={styles.cancelBtn}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Input Area */}
      <section className={styles.inputSection}>
        <form onSubmit={handleSubmit} className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            rows={1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="タスク、メモ、長文知見などをクイック入力..."
            className={styles.textarea}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button type="submit" className={styles.submitBtn} disabled={!inputValue.trim()}>
            <Send size={18} />
          </button>
        </form>
      </section>

      {/* AI COO Button */}
      <div className={styles.cooActions}>
        <button 
          onClick={handleCooEvaluate} 
          className={styles.cooBtn} 
          disabled={isCooEvaluating || items.length === 0}
        >
          {isCooEvaluating ? <Loader2 size={18} className="animate-spin" /> : <ListTodo size={18} />}
          AI COOに整理してもらう
        </button>
      </div>

      {cooMessage && (
        <div className={styles.cooMessage}>
          {cooMessage}
        </div>
      )}

      {/* Tabs Menu */}
      <div className={styles.tabMenu}>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'ceo' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('ceo')}
        >
          📈 CEOダッシュボード
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'today' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('today')}
        >
          今日のフォーカス
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'all' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('all')}
        >
          完了済み
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'memo-insight' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('memo-insight')}
        >
          メモ・知見 ({memos.length + insights.length + unclassified.length})
        </button>
        <button 
          className={`${styles.tabBtn} ${styles.desktopOnlyTab} ${activeTab === 'roadmap' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('roadmap')}
        >
          🗺️ ロードマップ
        </button>
      </div>

      <div className={styles.dashboard}>
        {/* TAB 0: CEO DASHBOARD */}
        {activeTab === 'ceo' && todayDate && (
          <div className={styles.ceoDashboard}>
            {(() => {
              // ADHD task calculations
              const pendingTaskRisks = pendingTasks.map(t => ({
                task: t,
                risk: getActiveTaskRiskLevel(t, todayStr)
              }));
              
              const redTasks = pendingTaskRisks.filter(r => r.risk === 'red');
              const yellowTasks = pendingTaskRisks.filter(r => r.risk === 'yellow');
              const greenTasks = pendingTaskRisks.filter(r => r.risk === 'green');

              // Sorting TOP 3
              const sortedTopTasks = [...pendingTaskRisks].sort((a, b) => {
                const riskOrder = { red: 3, yellow: 2, green: 1 };
                const orderA = riskOrder[a.risk] || 1;
                const orderB = riskOrder[b.risk] || 1;
                
                if (orderA !== orderB) {
                  return orderB - orderA;
                }
                
                const scoreA = a.task.cooScore ?? -1;
                const scoreB = b.task.cooScore ?? -1;
                if (scoreA !== scoreB) {
                  return scoreB - scoreA;
                }
                
                if (a.task.deadline && b.task.deadline) {
                  if (a.task.deadline !== b.task.deadline) {
                    return a.task.deadline < b.task.deadline ? -1 : 1;
                  }
                } else if (a.task.deadline) {
                  return -1;
                } else if (b.task.deadline) {
                  return 1;
                }
                
                if (a.task.targetDate && b.task.targetDate) {
                  if (a.task.targetDate !== b.task.targetDate) {
                    return a.task.targetDate < b.task.targetDate ? -1 : 1;
                  }
                } else if (a.task.targetDate) {
                  return -1;
                } else if (b.task.targetDate) {
                  return 1;
                }
                
                return b.task.createdAt - a.task.createdAt;
              });

              const top3Tasks = sortedTopTasks.slice(0, 3);

              return (
                <>
                  {/* ADHD Execution Diagnosis Banner */}
                  <div className={styles.adhdDiagnosticBanner}>
                    <h2 className={styles.healthBannerTitle}>🧠 ADHD実行診断（放置すると危険な案件）</h2>
                    <div className={styles.adhdStatsGrid}>
                      <div 
                        className={`${styles.adhdStatItem} ${styles.adhdRed} ${selectedRiskFilter === 'red' ? styles.adhdStatItemActive : ''}`}
                        onClick={() => setSelectedRiskFilter(prev => prev === 'red' ? null : 'red')}
                        style={{ cursor: 'pointer' }}
                        title="クリックして危険案件のみ表示"
                      >
                        <span className={styles.adhdLabel}>🔴 危険案件</span>
                        <span className={styles.adhdVal}>{redTasks.length}件</span>
                      </div>
                      <div 
                        className={`${styles.adhdStatItem} ${styles.adhdYellow} ${selectedRiskFilter === 'yellow' ? styles.adhdStatItemActive : ''}`}
                        onClick={() => setSelectedRiskFilter(prev => prev === 'yellow' ? null : 'yellow')}
                        style={{ cursor: 'pointer' }}
                        title="クリックして注意案件のみ表示"
                      >
                        <span className={styles.adhdLabel}>🟡 注意案件</span>
                        <span className={styles.adhdVal}>{yellowTasks.length}件</span>
                      </div>
                      <div 
                        className={`${styles.adhdStatItem} ${styles.adhdGreen} ${selectedRiskFilter === 'green' ? styles.adhdStatItemActive : ''}`}
                        onClick={() => setSelectedRiskFilter(prev => prev === 'green' ? null : 'green')}
                        style={{ cursor: 'pointer' }}
                        title="クリックして順調案件のみ表示"
                      >
                        <span className={styles.adhdLabel}>🟢 順調案件</span>
                        <span className={styles.adhdVal}>{greenTasks.length}件</span>
                      </div>
                    </div>
                  </div>

                  {/* Filtered tasks based on risk selection */}
                  {selectedRiskFilter && (
                    <div className={styles.filteredTasksSection}>
                      <h3 className={styles.filteredSectionTitle}>
                        {selectedRiskFilter === 'red' ? '🔴 危険判定のタスク一覧' :
                         selectedRiskFilter === 'yellow' ? '🟡 注意判定のタスク一覧' :
                         '🟢 順調判定のタスク一覧'}
                      </h3>
                      <div className={styles.filteredTasksGrid}>
                        {(() => {
                          const filtered = pendingTaskRisks.filter(r => r.risk === selectedRiskFilter);
                          if (filtered.length === 0) {
                            return (
                              <div className={styles.emptyFilteredState}>
                                該当するタスクはありません。
                              </div>
                            );
                          }
                          return filtered.map(item => {
                            const t = item.task;
                            return (
                              <div 
                                key={t.id} 
                                className={`${styles.filteredTaskCard} ${
                                  selectedRiskFilter === 'red' ? styles.filteredRed :
                                  selectedRiskFilter === 'yellow' ? styles.filteredYellow :
                                  styles.filteredGreen
                                }`}
                                onClick={() => handleStartEdit(t)}
                                title="クリックして詳細編集"
                              >
                                <div className={styles.filteredTaskHeader}>
                                  <span className={styles.filteredTaskProject}>{t.project}</span>
                                  <span className={styles.filteredTaskEditLink}>編集する ↗</span>
                                </div>
                                <h4 className={styles.filteredTaskTitle}>{t.title}</h4>
                                {t.cooReason && (
                                  <p className={styles.filteredTaskCooReason}>💡 {t.cooReason}</p>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  {/* TOP 3 Immediate Action */}
                  <div className={styles.top3Section}>
                    <h3 className={styles.top3SectionTitle}>🔥 今すぐ着手すべきTOP 3</h3>
                    <div className={styles.top3Grid}>
                      {top3Tasks.length > 0 ? (
                        top3Tasks.map((item, idx) => {
                          const t = item.task;
                          const risk = item.risk;
                          let riskBadge = '🟢 順調';
                          let cardRiskClass = styles.top3Green;
                          if (risk === 'yellow') {
                            riskBadge = '🟡 注意';
                            cardRiskClass = styles.top3Yellow;
                          } else if (risk === 'red') {
                            riskBadge = '🔴 危険';
                            cardRiskClass = styles.top3Red;
                          }

                          return (
                            <div 
                              key={t.id} 
                              className={`${styles.top3Card} ${cardRiskClass}`}
                              onClick={() => handleStartEdit(t)}
                              title="クリックして詳細編集"
                            >
                              <div className={styles.top3CardHeader}>
                                <span className={styles.top3Rank}>#{(idx + 1)}</span>
                                <span className={styles.top3ProjectName}>{t.project}</span>
                                <span className={styles.top3RiskBadge}>{riskBadge}</span>
                              </div>
                              <h4 className={styles.top3CardTitle}>{t.title}</h4>
                              {t.cooReason && (
                                <p className={styles.top3CooReason}>💡 {t.cooReason}</p>
                              )}
                              <div className={styles.top3CardFooter}>
                                {t.cooScore !== undefined && (
                                  <span className={styles.top3Score}>優先度スコア: {t.cooScore}</span>
                                )}
                                <span className={styles.top3EditLink}>編集する ↗</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className={styles.emptyState}>
                          🎉 現在保留中のタスクはありません。順調です！
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Business Health Diagnostic Banner */}
                  <div className={styles.healthDiagnosticBanner}>
                    <h2 className={styles.healthBannerTitle}>📊 事業健康診断</h2>
                    <div className={styles.healthStatsGrid}>
                      <div className={styles.healthStatItem}>
                        <span className={styles.healthStatLabel}>進行中事業</span>
                        <span className={styles.healthStatVal}>{activeProjects.length}件</span>
                      </div>
                      <div className={styles.healthStatItem}>
                        <span className={`${styles.healthStatLabel} ${styles.statSmooth}`}>🟢 順調</span>
                        <span className={styles.healthStatVal}>
                          {activeProjects.filter(proj => projectSummaries.find(s => s.projectName === proj)?.riskLevel === 'smooth').length}件
                        </span>
                      </div>
                      <div className={styles.healthStatItem}>
                        <span className={`${styles.healthStatLabel} ${styles.statWarning}`}>🟡 注意</span>
                        <span className={styles.healthStatVal}>
                          {activeProjects.filter(proj => projectSummaries.find(s => s.projectName === proj)?.riskLevel === 'warning').length}件
                        </span>
                      </div>
                      <div className={styles.healthStatItem}>
                        <span className={`${styles.healthStatLabel} ${styles.statDanger}`}>🟠 危険</span>
                        <span className={styles.healthStatVal}>
                          {activeProjects.filter(proj => projectSummaries.find(s => s.projectName === proj)?.riskLevel === 'danger').length}件
                        </span>
                      </div>
                      <div className={styles.healthStatItem}>
                        <span className={`${styles.healthStatLabel} ${styles.statStuck}`}>🔴 停止</span>
                        <span className={styles.healthStatVal}>
                          {activeProjects.filter(proj => projectSummaries.find(s => s.projectName === proj)?.riskLevel === 'stuck').length}件
                        </span>
                      </div>
                    </div>
                    <div className={styles.healthDiagnosticFooter}>
                      <span className={styles.healthBottleneckLabel}>🚨 最大ボトルネック:</span>
                      <span className={styles.healthBottleneckVal}>
                        {(() => {
                          const bottlenecks = activeProjects
                            .map(proj => projectSummaries.find(s => s.projectName === proj)?.maxBottleneck)
                            .filter(Boolean);
                          return bottlenecks.length > 0 ? bottlenecks.join(', ') : 'なし';
                        })()}
                      </span>
                    </div>
                  </div>

                  {/* Past Deadline Warning Block */}
                  {pastDeadlineTasks.length > 0 && (
                    <div className={styles.dangerZone}>
                      <div style={{ flex: 1 }}>
                        <h3 className={styles.dangerTitle}>⚠️ 過去期限のタスクが {pastDeadlineTasks.length} 件残っています</h3>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          進行が止まっているか、期限の更新漏れです。ロードマップの集計が狂うため、未来日に補正してください。
                        </p>
                      </div>
                      <button 
                        onClick={() => handleBulkFix(pastDeadlineTasks)} 
                        className={styles.bulkFixBtn}
                      >
                        ⚡ 未来日に一括補正する
                      </button>
                    </div>
                  )}

                  {/* Bulk Fix Report */}
                  {bulkFixReport.length > 0 && (
                    <div className={styles.bulkFixReportBox}>
                      <div className={styles.reportHeader}>
                        <strong>🔄 期限補正の実行結果:</strong>
                        <button onClick={() => setBulkFixReport([])} className={styles.reportCloseBtn}>閉じる</button>
                      </div>
                      <ul className={styles.reportList}>
                        {bulkFixReport.map((rep, idx) => (
                          <li key={idx} className={styles.reportItem}>
                            <span className={styles.reportTaskName}>{rep.title}</span>: 
                            <span className={styles.reportOldDate}>{rep.oldDeadline}</span>
                            <span className={styles.reportArrow}> → </span>
                            <span className={styles.reportNewDate}>{rep.newDeadline}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}

            {/* CEO Cards Grid */}
            <div className={styles.ceoCardsSection}>
              <h3 className={styles.ceoCardsSectionTitle}>📁 事業別CEOカード</h3>
              {activeProjects.length === 0 ? (
                <div className={styles.emptyState}>
                  現在進行中のプロジェクトはありません。タスクを追加して「AI COOに整理してもらう」を実行してください。
                </div>
              ) : (
                <div className={styles.ceoCardsGrid}>
                  {activeProjects.map(proj => {
                    const summary = projectSummaries.find(s => s.projectName === proj);
                    
                    // Fallback calculations if summary doesn't exist
                    const projTasks = tasks.filter(t => t.project === proj);
                    let totalRemainingMinutes = 0;
                    let totalWaitingDays = 0;
                    projTasks.forEach(t => {
                      if (t.status !== 'completed' && t.status !== 'not-doing-now') {
                        if (t.estimatedMinutes) {
                          totalRemainingMinutes += Math.max(0, t.estimatedMinutes - (t.actualMinutes || 0));
                        }
                        if (t.waitingDays) {
                          totalWaitingDays += t.waitingDays;
                        }
                      }
                    });
                    
                    const completed = projTasks.filter(t => t.status === 'completed').length;
                    const calculatedRate = projTasks.length > 0 ? Math.round((completed / projTasks.length) * 100) : 0;
                    
                    const progressRate = summary ? summary.progressRate : calculatedRate;
                    const manualRate = summary?.manualProgressRate;
                    const hasManualRate = manualRate !== undefined && manualRate !== null;
                    const activeRate = hasManualRate ? manualRate : progressRate;

                    const riskLevel = summary ? summary.riskLevel : 'smooth';
                    const maxBottleneck = summary ? summary.maxBottleneck : 'AI COO未判定 (「整理してもらう」を実行してください)';
                    const nextAction = summary ? summary.nextAction : 'タスクを確認する';
                    const decisionDeadline = summary ? summary.decisionDeadline : null;
                    const isFallback = !summary;

                    let riskLabel = '🟢 順調';
                    let riskClass = styles.cardSmooth;
                    if (riskLevel === 'warning') {
                      riskLabel = '🟡 注意';
                      riskClass = styles.cardWarning;
                    } else if (riskLevel === 'danger') {
                      riskLabel = '🟠 危険';
                      riskClass = styles.cardDanger;
                    } else if (riskLevel === 'stuck') {
                      riskLabel = '🔴 停止';
                      riskClass = styles.cardStuck;
                    }

                    return (
                      <div 
                        key={proj} 
                        className={`${styles.ceoCard} ${riskClass}`}
                        onClick={() => handleGoToProjectRoadmap(proj)}
                        title="クリックしてロードマップ詳細を表示"
                      >
                        <div className={styles.ceoCardHeader}>
                          <h4 className={styles.ceoCardProjectName}>{proj}</h4>
                          <span className={styles.ceoCardRiskBadge}>{riskLabel}</span>
                        </div>

                        <div className={styles.ceoCardBody}>
                          <div className={styles.ceoCardProgressSection}>
                            <div className={styles.ceoCardProgressHeader}>
                              <span className={styles.ceoCardProgressLabel}>
                                {hasManualRate ? '進捗率 (手動補正)' : '進捗率 (AI予測)'} {isFallback && <small style={{ color: 'var(--text-muted)' }}>(タスクベース)</small>}
                              </span>
                              
                              {editingProjectProgress === proj ? (
                                <div className={styles.inlineProgressEditWrapper} onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={progressInputValue}
                                    onChange={(e) => setProgressInputValue(e.target.value)}
                                    className={styles.inlineProgressInput}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSaveProjectProgress(proj);
                                      }
                                    }}
                                  />
                                  <span style={{ fontSize: '0.8125rem' }}>%</span>
                                  <button 
                                    onClick={() => handleSaveProjectProgress(proj)} 
                                    className={styles.inlineSaveBtn}
                                  >
                                    保存
                                  </button>
                                  <button 
                                    onClick={() => setEditingProjectProgress(null)} 
                                    className={styles.inlineCancelBtn}
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span className={styles.ceoCardProgressVal}>
                                    {activeRate}%
                                  </span>
                                  <button
                                    className={styles.inlineEditBtn}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingProjectProgress(proj);
                                      setProgressInputValue(activeRate.toString());
                                    }}
                                    title="進捗率を手動補正する"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  {hasManualRate && (
                                    <button
                                      className={styles.inlineResetBtn}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`「${proj}」の進捗率を手動補正からAI予測値（${progressRate}%）に戻しますか？`)) {
                                          updateProjectSummary(proj, { manualProgressRate: undefined });
                                        }
                                      }}
                                      title="AI予測値に戻す"
                                    >
                                      <RotateCcw size={12} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className={styles.ceoProgressBarContainer}>
                              <div 
                                className={styles.ceoProgressBar} 
                                style={{ width: `${activeRate}%` }}
                              />
                            </div>
                          </div>

                          <div className={styles.ceoCardInfoGrid}>
                            <div className={styles.ceoCardInfoRow}>
                              <span className={styles.ceoCardInfoLabel}>⏳ 残作業</span>
                              <span className={styles.ceoCardInfoVal}>{totalRemainingMinutes > 0 ? formatMinutesToHours(totalRemainingMinutes) : '0時間'}</span>
                            </div>
                            <div className={styles.ceoCardInfoRow}>
                              <span className={styles.ceoCardInfoLabel}>🛑 総待機</span>
                              <span className={styles.ceoCardInfoVal}>{totalWaitingDays > 0 ? `${totalWaitingDays}日` : '0日'}</span>
                            </div>
                            <div className={styles.ceoCardInfoRow}>
                              <span className={styles.ceoCardInfoLabel}>⚠️ ボトルネック</span>
                              <span className={styles.ceoCardInfoVal}>{maxBottleneck || 'なし'}</span>
                            </div>
                            <div className={styles.ceoCardInfoRow}>
                              <span className={styles.ceoCardInfoLabel}>👉 次にやること</span>
                              <span className={styles.ceoCardInfoVal} style={{ fontWeight: 600, color: 'var(--accent)' }}>
                                {nextAction || 'なし'}
                              </span>
                            </div>
                            <div className={styles.ceoCardInfoRow}>
                              <span className={styles.ceoCardInfoLabel}>📅 意思決定期限</span>
                              <span className={`${styles.ceoCardInfoVal} ${decisionDeadline && decisionDeadline < todayStr ? styles.alertDeadline : ''}`}>
                                {decisionDeadline || '設定なし'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className={styles.ceoCardFooter}>
                          <span>ロードマップ詳細へ ↗</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 1: TODAY'S FOCUS */}
        {activeTab === 'today' && (
          <section className={styles.section}>
            <h2 className={`${styles.sectionTitle} ${styles.sectionTitleTop}`}>
              <Sparkles size={16} /> 今日のフォーカス (優先順)
            </h2>
            <div className={styles.taskList}>
              {(() => {
                const pendingTasksWithScore = pendingTasks.map(task => ({
                  task,
                  score: calculatePriorityScore(task, todayStr)
                }));
                
                pendingTasksWithScore.sort((a, b) => b.score - a.score);
                
                if (pendingTasksWithScore.length === 0) {
                  return (
                    <div className={styles.emptyState}>
                      未完了のタスクはありません。素晴らしいですね！
                    </div>
                  );
                }
                
                return pendingTasksWithScore.map((item, idx) => (
                  <div key={item.task.id} className={styles.top3Card} style={{ marginBottom: '12px' }} onClick={() => handleStartEdit(item.task)}>
                    <div className={styles.top3CardHeader}>
                      <span className={styles.top3Rank}>#{idx + 1}</span>
                      <span className={styles.top3ProjectName}>{item.task.project}</span>
                    </div>
                    <h4 className={styles.top3CardTitle}>{item.task.title}</h4>
                    <div className={styles.top3CardFooter}>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                        {item.task.deadline && (() => {
                          const diffTime = new Date(item.task.deadline).getTime() - new Date(todayStr).getTime();
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          return (
                            <span style={{ color: diffDays <= 3 ? 'var(--danger)' : 'inherit' }}>
                              残り：{diffDays < 0 ? '期限超過' : `${diffDays}日`}
                            </span>
                          );
                        })()}
                        {(() => {
                          const estMinutes = getFinalEstimatedMinutes(item.task);
                          if (estMinutes) {
                            const hours = estMinutes / 60;
                            return <span>ADHD工数：{Number(hours.toFixed(1))}時間</span>;
                          }
                          return null;
                        })()}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskStatus(item.task);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--accent)',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                          }}
                        >
                          ✅ 完了
                        </button>
                        <span className={styles.top3EditLink}>詳細・編集 ↗</span>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </section>
        )}

        {/* TAB 2: COMPLETED TASKS */}
        {activeTab === 'all' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle} style={{ color: 'var(--text-muted)' }}>完了済み</h2>
            <div className={styles.taskList} style={{ opacity: 0.6 }}>
              {completedTasks.length > 0 ? (
                completedTasks.map(task => (
                  <TaskCard key={task.id} task={task} onToggle={() => toggleTaskStatus(task)} onNotNow={() => toggleNotDoingNow(task)} onDelete={() => deleteItem(task.id)} onEdit={() => handleStartEdit(task)} todayStr={todayStr} />
                ))
              ) : (
                <div className={styles.emptyState}>完了済みのタスクはありません。</div>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: MEMO & INSIGHT */}
        {activeTab === 'memo-insight' && (
          <>
            {unclassified.length > 0 && (
              <section className={styles.section}>
                <h2 className={`${styles.sectionTitle} ${styles.sectionTitleTop}`}>
                  <AlertCircle size={16} /> 未整理の新規入力 ({unclassified.length}件)
                </h2>
                <div className={styles.taskList}>
                  {unclassified.map(item => (
                    <div key={item.id} className={styles.unclassifiedCard}>
                      <div className={styles.cardHeader}>
                        <span className={styles.badge}>未分類</span>
                        <button onClick={() => deleteItem(item.id)} className={styles.iconBtn}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <p className={styles.cardContent}>{item.rawInput}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <FileText size={16} /> 知見 (ChatGPT / NotebookLMなどの回答)
              </h2>
              <div className={styles.taskList}>
                {insights.length > 0 ? (
                  insights.map(insight => (
                    <div key={insight.id} className={styles.insightCard}>
                      <div className={styles.cardHeader} onClick={() => toggleAccordion(insight.id)}>
                        <div className={styles.cardHeaderLeft}>
                          <FileText size={18} color="var(--accent)" />
                          <h3 className={styles.cardTitle}>{insight.title}</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button onClick={(e) => { e.stopPropagation(); deleteItem(insight.id); }} className={styles.iconBtn}>
                            <Trash2 size={16} />
                          </button>
                          {expandedItems[insight.id] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>
                      {expandedItems[insight.id] && (
                        <div className={styles.cardBody}>
                          <pre className={styles.preText}>{insight.content}</pre>
                          {insight.extractedTaskIds && insight.extractedTaskIds.length > 0 && (
                            <div className={styles.extractedSection}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)' }}>📌 抽出されたタスク:</span>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                {tasks.filter(t => insight.extractedTaskIds?.includes(t.id)).map(t => (
                                  <span key={t.id} className={styles.miniBadge}>{t.title}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyState}>知見はありません。</div>
                )}
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <Lightbulb size={16} /> メモ・アイデア
              </h2>
              <div className={styles.taskList}>
                {memos.length > 0 ? (
                  memos.map(memo => (
                    <div key={memo.id} className={styles.insightCard}>
                      <div className={styles.cardHeader} onClick={() => toggleAccordion(memo.id)}>
                        <div className={styles.cardHeaderLeft}>
                          <Lightbulb size={18} color="var(--color-gray-600)" />
                          <h3 className={styles.cardTitle}>{memo.title}</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span className={styles.badge}>{memo.project || 'その他'}</span>
                          <button onClick={(e) => { e.stopPropagation(); deleteItem(memo.id); }} className={styles.iconBtn}>
                            <Trash2 size={16} />
                          </button>
                          {expandedItems[memo.id] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>
                      {expandedItems[memo.id] && (
                        <div className={styles.cardBody}>
                          <p className={styles.memoText}>{memo.content}</p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyState}>メモはありません。</div>
                )}
              </div>
            </section>
          </>
        )}

        {/* TAB 4: ROADMAP */}
        {activeTab === 'roadmap' && todayDate && (
          <div className={styles.roadmapView}>
            <div className={styles.roadmapIntro}>
              <h2>🗺️ プロジェクト・ロードマップ (今後30日間)</h2>
              <p>プロジェクト別のタスク進捗、期限、想定工数、および待機/ボトルネックの可視化チャートです。</p>
            </div>
            
            {(() => {
              const roadmapDays = getRoadmapDays(todayDate);

              return (
                <>
                  {/* Project Gantt Charts */}
                  {activeProjects.length === 0 ? (
                    <div className={styles.emptyState}>
                      表示するプロジェクトタスクがありません。タスクを追加してください。
                    </div>
                  ) : (
                    activeProjects.map(proj => {
                const projectTasks = tasks.filter(t => t.project === proj);
                
                // Group stats
                const totalCount = projectTasks.length;
                const completedCount = projectTasks.filter(t => t.status === 'completed').length;
                const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                
                const remainingMinutes = projectTasks
                  .filter(t => t.status !== 'completed' && t.estimatedMinutes)
                  .reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);

                const totalWaitingDays = projectTasks
                  .filter(t => t.status !== 'completed' && t.waitingDays)
                  .reduce((sum, t) => sum + (t.waitingDays || 0), 0);
                  
                const pendingWithDeadline = projectTasks.filter(t => t.status === 'pending' && t.deadline);
                const nextDeadline = pendingWithDeadline.length > 0
                  ? pendingWithDeadline.map(t => t.deadline!).sort()[0]
                  : 'なし';

                return (
                  <section key={proj} id={`roadmap-project-${proj}`} className={styles.roadmapProjectSection}>
                    <div className={styles.roadmapProjectHeader}>
                      <h3 className={styles.roadmapProjectTitle}>📁 {proj}</h3>
                      <div className={styles.roadmapProjectStats}>
                        <div className={styles.roadmapStatItem}>
                          <span className={styles.statLabel}>タスク数</span>
                          <span className={styles.roadmapStatVal}>{totalCount}件</span>
                        </div>
                        <div className={styles.roadmapStatItem}>
                          <span className={styles.statLabel}>完了率</span>
                          <span className={styles.roadmapStatVal}>{completionRate}%</span>
                        </div>
                        <div className={styles.roadmapStatItem}>
                          <span className={styles.statLabel}>残作業時間</span>
                          <span className={styles.roadmapStatVal}>{formatMinutesToHours(remainingMinutes)}</span>
                        </div>
                        <div className={styles.roadmapStatItem}>
                          <span className={styles.statLabel}>総待機日数</span>
                          <span className={styles.roadmapStatVal}>{totalWaitingDays > 0 ? `${totalWaitingDays}日` : '0日'}</span>
                        </div>
                        <div className={styles.roadmapStatItem}>
                          <span className={styles.statLabel}>直近期限</span>
                          <span className={`${styles.roadmapStatVal} ${nextDeadline !== 'なし' && nextDeadline < todayStr ? styles.statValAlert : ''}`}>
                            {nextDeadline !== 'なし' ? nextDeadline : '設定なし'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.ganttScrollWrapper}>
                      <div className={styles.ganttGrid}>
                        {/* Header Column Labels */}
                        <div className={styles.ganttHeaderCol} style={{ gridColumn: 1, gridRow: 1 }}>タスク名</div>
                        {roadmapDays.map((day, dIdx) => (
                          <div key={dIdx} className={styles.ganttDateHeader} style={{ gridColumn: dIdx + 2, gridRow: 1 }}>
                            <span className={styles.ganttDayNum}>{day.getDate()}</span>
                            <span className={styles.ganttDayWeek}>
                              {['日', '月', '火', '水', '木', '金', '土'][day.getDay()]}
                            </span>
                          </div>
                        ))}

                        {/* Today Column Line */}
                        <div className={styles.todayLine} style={{ gridColumn: 2, gridRow: `1 / ${projectTasks.length + 2}` }} />

                        {/* Task Rows */}
                        {projectTasks.map((task, tIdx) => {
                          const rowNum = tIdx + 2;
                          const pos = getGridPosition(task, todayDate);
                          const targetCol = getColumnOffset(task.targetDate, todayDate);
                          const deadlineCol = getColumnOffset(task.deadline, todayDate);
                          return (
                            <React.Fragment key={task.id}>
                              <div 
                                className={styles.ganttTaskInfo} 
                                style={{ gridColumn: 1, gridRow: rowNum }}
                                onClick={() => handleStartEdit(task)}
                                title="クリックして編集"
                              >
                                <span className={styles.ganttTaskTitleText} style={{ textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
                                  {task.title}
                                </span>
                                 <span className={styles.ganttTaskMetaText}>
                                   {task.estimatedMinutes ? `作業:${formatMinutesToHours(task.estimatedMinutes)}` : ''}
                                   {task.waitingDays ? ` / 待機:${task.waitingDays}日` : ''}
                                 </span>
                              </div>

                              {pos && (
                                <>
                                  {pos.hasWait && (
                                    <div
                                      className={styles.ganttWaitBar}
                                      style={{
                                        gridColumnStart: pos.waitGridStart!,
                                        gridColumnEnd: pos.waitGridEnd!,
                                        gridRow: rowNum
                                      }}
                                      onClick={() => handleStartEdit(task)}
                                      title={`待機中: ${task.waitingDays}日\nボトルネック: ${task.bottleneck || 'なし'}`}
                                    >
                                      <span className={styles.ganttBarLabel}>待機</span>
                                    </div>
                                  )}
                                  {pos.hasWork && (
                                    <div 
                                      className={`${styles.ganttBar} ${
                                        task.status === 'completed' ? styles.barCompleted :
                                        task.bottleneck && !pos.hasWait ? styles.barBottleneck :
                                        styles.barNormal
                                      }`}
                                      style={{
                                        gridColumnStart: pos.workGridStart,
                                        gridColumnEnd: pos.workGridEnd,
                                        gridRow: rowNum
                                      }}
                                      onClick={() => handleStartEdit(task)}
                                      title={`${task.title}\n期限: ${task.deadline || 'なし'}\n想定工数: ${task.estimatedMinutes || 0}分`}
                                    >
                                      <span className={styles.ganttBarLabel}>{task.title}</span>
                                    </div>
                                  )}
                                </>
                              )}

                              {targetCol && (
                                <div 
                                  className={styles.ganttTargetLine} 
                                  style={{ gridColumn: targetCol, gridRow: rowNum }}
                                  title={`目標期限: ${task.targetDate}`}
                                  onClick={() => handleStartEdit(task)}
                                />
                              )}

                              {deadlineCol && (
                                <div 
                                  className={styles.ganttDeadlineLine} 
                                  style={{ gridColumn: deadlineCol, gridRow: rowNum }}
                                  title={`絶対締切: ${task.deadline}`}
                                  onClick={() => handleStartEdit(task)}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                );
              })
            )}
          </>
        );
      })()}
          </div>
        )}
      </div>
    </div>
  );
}

// 3. 各タスクカードに小さく表示 (期限, 想定工数, 待機時間, 優先度スコア)
function TaskCard({ 
  task, 
  onToggle, 
  onNotNow, 
  onDelete,
  onEdit,
  todayStr = '2026-06-06'
}: { 
  task: TaskItem; 
  onToggle: () => void; 
  onNotNow: () => void; 
  onDelete: () => void; 
  onEdit: () => void;
  todayStr?: string;
}) {
  // Helper to format minutes into human readable text
  const formatTime = (minutes?: number) => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes}分`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  };

  return (
    <div className={styles.taskCard}>
      <div className={styles.taskHeader}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <button onClick={onToggle} className={styles.iconBtn} style={{ color: task.status === 'completed' ? 'var(--accent)' : 'var(--text-muted)' }}>
            {task.status === 'completed' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
          </button>
          <div>
            <h3 className={styles.taskTitle} style={{ textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
              {task.title}
            </h3>
            {task.cooReason && task.status !== 'completed' && (
              <p className={styles.cooReason}>💡 {task.cooReason}</p>
            )}
            {task.notes && task.status !== 'completed' && (
              <p className={styles.notesText}>🗒️ {task.notes}</p>
            )}
          </div>
        </div>
        <div className={styles.taskActions}>
          <button onClick={onEdit} className={styles.iconBtn} title="詳細を編集">
            <Edit2 size={16} />
          </button>
          <button onClick={onNotNow} className={styles.iconBtn} title={task.status === 'not-doing-now' ? "保留に戻す" : "今やらないリストへ移動"}>
            <XCircle size={18} />
          </button>
          <button onClick={onDelete} className={styles.iconBtn} title="タスク削除">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      
      <div className={styles.taskMeta}>
        {task.project && task.project !== 'その他' && (
          <span className={`${styles.badge} ${styles.badgeProject}`}>
            <Briefcase size={12} /> {task.project}
          </span>
        )}
        {task.requester && task.requester !== '自分' && (
          <span className={styles.badge}>
            <User size={12} /> {task.requester}
          </span>
        )}
        {task.targetDate && (
          <span className={`${styles.badge} ${styles.badgeTargetDate} ${task.targetDate < todayStr ? styles.badgeTargetAlert : ''}`}>
            🎯目標: {task.targetDate}
          </span>
        )}
        {task.targetDate && task.deadline && task.targetDate > task.deadline && (
          <span className={styles.badgeAlertMini} style={{marginLeft: '-4px'}} title="目標が絶対期限を越えています">⚠️逆転</span>
        )}
        {task.deadline && (
          <span className={`${styles.badge} ${task.deadline < todayStr ? styles.badgeAlert : styles.badgeHigh}`}>
            <Clock size={12} /> 
            {task.deadline < todayStr ? `⚠️ 絶対期限切れ: ${task.deadline}` : `絶対期限: ${task.deadline}`}
          </span>
        )}
        {(() => {
          const estMinutes = getFinalEstimatedMinutes(task);
          if (estMinutes) {
            const hours = estMinutes / 60;
            return (
              <span className={`${styles.badge} ${styles.badgeEstimated}`}>
                ADHD工数：{Number(hours.toFixed(1))}時間
              </span>
            );
          }
          return null;
        })()}
        {task.waitingDays && task.status === 'pending' && (
          <span className={`${styles.badge} ${styles.badgeWaiting}`}>
            🛑 待ち: {task.bottleneck || '外部処理'}
          </span>
        )}
        {task.status === 'pending' && (
          <span className={styles.badge} style={{ backgroundColor: 'var(--primary-bg)', color: 'var(--accent)' }}>
            優先スコア: {calculatePriorityScore(task, todayStr)}
          </span>
        )}
      </div>
    </div>
  );
}

// Helpers for Phase 2-2 PC Roadmap

// Helper to generate 30 days starting from today Date
const getRoadmapDays = (today: Date) => {
  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
};

// Helper to determine Grid Position of task bar in 30-day window
const getGridPosition = (task: TaskItem, today: Date) => {
  const startWindow = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  let end: Date;
  const workDays = task.estimatedMinutes ? Math.max(1, Math.ceil(task.estimatedMinutes / 480)) : 1;
  const waitDays = task.waitingDays || 0;
  const totalDays = waitDays + workDays;
  
  if (task.deadline) {
    const [y, m, d] = task.deadline.split('-').map(Number);
    end = new Date(y, m - 1, d);
  } else {
    // If no deadline, default to starting today (or waitingSince if earlier)
    let baseStart = today;
    if (task.waitingSince) {
      baseStart = new Date(task.waitingSince);
    }
    const start = new Date(baseStart.getFullYear(), baseStart.getMonth(), baseStart.getDate());
    end = new Date(start.getTime() + (totalDays - 1) * 24 * 60 * 60 * 1000);
  }
  
  let start = new Date(end.getTime() - (totalDays - 1) * 24 * 60 * 60 * 1000);
  
  const dStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  
  const startOffset = Math.round((dStart.getTime() - startWindow.getTime()) / msPerDay);
  const workStartOffset = startOffset + waitDays;
  const endOffset = startOffset + totalDays - 1;
  
  if (endOffset < 0 || startOffset > 29) {
    return null;
  }
  
  const waitGridStart = waitDays > 0 ? Math.max(0, startOffset) + 2 : null;
  const waitGridEnd = waitDays > 0 ? Math.min(30, workStartOffset) + 2 : null;
  
  const workGridStart = Math.max(0, workStartOffset) + 2;
  const workGridEnd = Math.min(30, endOffset + 1) + 2;
  
  const hasWait = waitDays > 0 && waitGridStart !== null && waitGridEnd !== null && waitGridStart < waitGridEnd;
  const hasWork = workGridStart < workGridEnd && workGridStart <= 31;
  
  return { 
    hasWait, 
    waitGridStart, 
    waitGridEnd, 
    hasWork, 
    workGridStart, 
    workGridEnd 
  };
};

// Helper to format remaining minutes to hours & minutes
const formatMinutesToHours = (minutes: number) => {
  if (minutes === 0) return '0分';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  return m > 0 ? `${h}時間 ${m}分` : `${h}時間`;
};

// Helper to calculate final estimated minutes (respects manual input)
const getFinalEstimatedMinutes = (task: TaskItem) => {
  if (!task.estimatedMinutes) return undefined;
  if (task.isEstimatedMinutesManual || task.manualAdhdMinutes !== undefined) {
    return task.manualAdhdMinutes !== undefined ? task.manualAdhdMinutes : task.estimatedMinutes;
  }
  
  const est = task.estimatedMinutes;
  if (est <= 120) {
    return est * 2;
  } else {
    return Math.round(est * 1.5);
  }
};

// Helper to determine active task risk level
const getActiveTaskRiskLevel = (task: TaskItem, todayStr: string) => {
  if (task.manualRiskLevel) return task.manualRiskLevel;
  
  const deadline = task.deadline;
  const targetDate = task.targetDate;
  
  if (deadline) {
    if (deadline <= todayStr) return 'red';
    // If deadline is within 3 days
    const diffTime = new Date(deadline).getTime() - new Date(todayStr).getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 3) return 'red';
  }
  
  if (targetDate) {
    if (targetDate < todayStr) return 'yellow';
  }
  
  return 'green';
};

// Helper to calculate Priority Score client-side
const calculatePriorityScore = (task: TaskItem, todayStr: string) => {
  let score = 0;
  
  // 1. Deadline Proximity (Most Important)
  if (task.deadline) {
    const diffTime = new Date(task.deadline).getTime() - new Date(todayStr).getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) {
      score = 100; // Past due or due today
    } else {
      // Subtract 2 points for every day remaining. 
      // Example: 7 days = 86 points. 30 days = 40 points.
      score = Math.max(20, 100 - (diffDays * 2));
    }
  } else {
    score = 10; // No deadline
  }
  
  // 2. Risk Level (ADHD Danger)
  const risk = getActiveTaskRiskLevel(task, todayStr);
  if (risk === 'red') score += 8;
  else if (risk === 'yellow') score += 4;
  
  // 3. Profit Impact (Project Importance)
  if (task.profitImpact === 'High') score += 5;
  else if (task.profitImpact === 'Medium') score += 2;
  
  // 4. Estimated Effort (Quick wins)
  const estMin = getFinalEstimatedMinutes(task) || 60;
  if (estMin <= 30) score += 3;
  else if (estMin <= 120) score += 1;
  
  // 5. Waiting status penalty
  if (task.waitingDays && task.waitingDays > 0) {
    score -= 15; // Deprioritize waiting tasks
  } else if (task.bottleneck) {
    score -= 10; // Deprioritize tasks with bottlenecks
  }
  
  // Normalize score between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score)));
};

// Helper to determine CSS Grid column offset in Gantt chart for target date and absolute deadline overlays
const getColumnOffset = (dateStr: string | null | undefined, today: Date | null) => {
  if (!dateStr || !today) return null;
  const startWindow = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  const msPerDay = 24 * 60 * 60 * 1000;
  const offset = Math.round((targetDate.getTime() - startWindow.getTime()) / msPerDay);
  if (offset < 0 || offset > 29) {
    return null;
  }
  return offset + 2; // Col 1 is Task Info, Col 2 is Day 0 (today)
};

