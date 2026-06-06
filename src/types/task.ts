export type ItemType = 'task' | 'memo' | 'insight' | 'unclassified';
export type Priority = 'high' | 'medium' | 'low';
export type Status = 'pending' | 'completed' | 'not-doing-now';

export interface BaseItem {
  id: string;
  type: ItemType;
  rawInput: string;
  createdAt: number;
  updatedAt: number;
}

export interface TaskItem extends BaseItem {
  type: 'task';
  title: string;
  project: string; // "シリコンビブ卸事業", "Luareブログ自動化", "Luareホームページリニューアル", "税理士紹介ビジネス", "中国移住準備", "家庭関連タスク", "その他"
  priority: Priority;
  urgency: Priority;
  status: Status;
  requester: string; // "自分", "夫", "顧客" など
  deadline: string | null; // YYYY-MM-DD
  profitImpact: 'High' | 'Medium' | 'Low';
  progressRate: number; // 0 - 100
  cooScore?: number; // AI COO priority score (0-100)
  cooReason?: string; // AI COO reasoning
  
  // Phase 2-1: 拡張項目
  estimatedMinutes?: number; // 想定工数 (分単位)
  actualMinutes?: number;     // 実績工数 (分単位)
  waitingDays?: number;      // 待機日数
  waitingSince?: number;     // 待機開始のタイムスタンプ
  bottleneck?: string;       // ボトルネックの説明
  notes?: string;            // 手動メモ
  isDeadlineHandEdited?: boolean; // 手動で期限を変更したかのフラグ

  // Phase 3-1: ADHD 実行管理拡張
  targetDate?: string | null;     // 自分用目標期限
  manualAdhdMinutes?: number;     // 手動補正されたADHD工数 (分単位)
  manualRiskLevel?: 'green' | 'yellow' | 'red'; // 手動補正された危険度
}

export interface MemoItem extends BaseItem {
  type: 'memo';
  title: string;
  content: string;
  project?: string;
}

export interface InsightItem extends BaseItem {
  type: 'insight';
  title: string;
  content: string;
  extractedTaskIds?: string[]; // IDs of tasks extracted from this insight
}

export interface UnclassifiedItem extends BaseItem {
  type: 'unclassified';
}

export type AppItem = TaskItem | MemoItem | InsightItem | UnclassifiedItem;

export interface ProjectSummary {
  projectName: string;
  progressRate: number; // 0 - 100
  riskLevel: 'smooth' | 'warning' | 'danger' | 'stuck'; // 順調 | 注意 | 危険 | 停止
  maxBottleneck: string | null;
  nextAction: string | null;
  decisionDeadline: string | null;
  manualProgressRate?: number; // 手動補正進捗率
}

