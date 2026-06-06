import { AppItem, TaskItem, MemoItem, InsightItem, UnclassifiedItem, ProjectSummary } from '@/types/task';
import { v4 as uuidv4 } from 'uuid';

export async function testGeminiConnection(apiKey: string, modelName: string): Promise<boolean> {
  if (!apiKey) {
    throw new Error('APIキーが空です。');
  }
  
  const activeModel = modelName.trim() || 'gemini-2.5-flash-lite';
  let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: "ping" }]
        }]
      }),
    });
  } catch (err) {
    throw new Error('ネットワークエラーが発生しました。インターネット接続を確認してください。');
  }

  if (!response.ok && activeModel !== 'gemini-2.5-flash') {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: "ping" }]
          }]
        }),
      });
    } catch (fallbackErr) {
      throw new Error('フォールバックモデルへの接続中にネットワークエラーが発生しました。');
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    let parsedError;
    try {
      parsedError = JSON.parse(errText);
    } catch (e) {}
    
    const message = parsedError?.error?.message || 'APIキーまたはモデル名が無効です。';
    throw new Error(message);
  }

  return true;
}

export async function cooPrioritizeClientSide(items: AppItem[], apiKey: string, modelName: string): Promise<{ items: AppItem[], projectSummaries: ProjectSummary[], message: string }> {
  if (!apiKey) {
    throw new Error('Gemini APIキーが設定されていません。右上の設定アイコンからキーを設定してください。');
  }

  const dObj = new Date();
  const y = dObj.getFullYear();
  const m = String(dObj.getMonth() + 1).padStart(2, '0');
  const date = String(dObj.getDate()).padStart(2, '0');
  const currentTodayStr = `${y}-${m}-${date}`;

  const activeItems = items.filter(item => {
    if (item.type === 'task') {
      return item.status !== 'completed';
    }
    return true;
  });

  if (activeItems.length === 0) {
    return { items, projectSummaries: [], message: "評価する data がありません。タスクやメモを追加してください。" };
  }

  const itemsPayload = activeItems.map(item => {
    const base = {
      id: item.id,
      type: item.type,
      rawInput: item.rawInput,
      createdAt: item.createdAt,
    };
    if (item.type === 'task') {
      return {
        ...base,
        title: item.title,
        project: item.project,
        priority: item.priority,
        urgency: item.urgency,
        status: item.status,
        requester: item.requester,
        deadline: item.deadline,
        profitImpact: item.profitImpact,
        progressRate: item.progressRate,
        estimatedMinutes: item.estimatedMinutes,
        waitingDays: item.waitingDays,
        bottleneck: item.bottleneck,
      };
    }
    if (item.type === 'memo' || item.type === 'insight') {
      return {
        ...base,
        title: item.title,
        content: item.content,
      };
    }
    return base;
  });

  const prompt = `
あなたはユーザーの優秀なAI COO（最高執行責任者）兼社長秘書です。
ユーザーは複数の事業や家庭タスクを同時に抱えています：
- シリコンビブ卸事業
- Luareブログ自動化
- Luareホームページリニューアル
- 税理士紹介ビジネス
- 中国移住準備
- 家庭関連タスク
- その他

提供されたデータリスト（JSON）を解析し、以下の4つの処理をまとめて実行してください：

1. **未分類（unclassified）データの分類**:
   - 実行可能な行動（ToDo）が含まれていれば「task」
   - 自身のアイデア、考え、一時的な書き留めであれば「memo」
   - 外部AIの長文回答や詳細なレポートであれば「insight」
   に振り分けてください。それぞれに適切な「title」を設定し、メモや知見の場合は「content」に元の文章をセットしてください。またプロジェクト名（上記プロジェクトのいずれか。該当がなければ'その他'または'家庭関連タスク'）も割り当ててください。

2. **知見（insight）からの実行可能タスクの抽出**:
   - typeが 'insight' である長文について、そこに実行すべき具体的なタスクが含まれている場合、新しい「task」として切り出し、新規オブジェクト（status='pending'）として返してください。必ず \`extractedFromInsightId\` に該当する知見のIDを設定して紐づけてください。

3. **タスクの総合評価と詳細・工数の推定**:
   - すべてのタスク（新規分類されたもの、抽出されたもの、既存のpendingのもの）について、以下を推定・決定してください：
     - **優先度スコア (score)**: 0〜100、高いほど優先。締切が近いもの、夫からの依頼、利益インパクトの高いものを優先します。
     - **期限 (deadline)**: YYYY-MM-DD形式。以下のルールに従って厳密に決定してください：
       1. 現在日は ${y}年${dObj.getMonth() + 1}月（本日は${currentTodayStr}）である。
       2. AIが期限を推定する場合、過去の日付を絶対に設定しないでください（現在日 ${currentTodayStr} より前の日付は不可）。
       3. 「6月8日」「6/8」のように年がない日付は、現在日（${currentTodayStr}）以降の最も近い未来日として解釈してください。
       4. もし現在年のその日付がすでに過去なら、翌年（${y + 1}年など）として扱ってください。
       5. 期限が不明なタスクは、無理に日付を作らず \`null\` にしてください。
     - **想定工数 (estimatedMinutes)**: 作業完了に必要な想定時間（分単位の数値。例：30分なら 30, 2時間なら 120, 8時間なら 480。不明なら30）。
     - **待機日数 (waitingDays)**: 外部の承認、配送、審査などを「待つ」だけの待機リードタイム（日数の数値。例：GS1申請審査なら 12, 誰かからの回答待ちなら 3。待機不要なら0）。
     - **ボトルネック (bottleneck)**: 待機必要であれば、その具体的な原因・待ち相手（例: "GS1審査待ち", "夫の確認待ち" など。不要なら null）。
     - **「今やらないリスト」への選定**: 「今月はやらなくて良い」と判断したタスクは、statusを "not-doing-now" に変更してください。脳内メモリを空けるため、緊急でないものは積極的に落としてください。
     - **アドバイス理由 (reason)**: なぜその優先順位や仕分けにしたかの簡単な理由。

4. **プロジェクト全体の状況評価 (CEOダッシュボード用)**:
   - 各プロジェクト（「シリコンビブ卸事業」「Luareブログ自動化」「Luareホームページリニューアル」「税理士紹介ビジネス」「中国移住準備」「家庭関連タスク」「その他」のうち、該当するタスクが1つでも存在するアクティブなプロジェクトすべて）について、経営者視点で以下の評価を行ってください：
     - **進捗率 (progressRate)**: 0〜100の数値。タスク完了件数÷総タスク数の単純な比率ではなく、「事業立ち上げ・進行 of 全体的な達成度」を経営者目線で定性的に評価してください。（例：GS1申請審査が終わっていなければ、他の作業がどんなに終わっていても事業進捗は5%とする、など、致命的・依存関係の強いボトルネックを考慮すること）
     - **危険度/状態 (riskLevel)**: "smooth" (順調), "warning" (注意), "danger" (危険), "stuck" (停止) の4段階。
     - **最大ボトルネック (maxBottleneck)**: 現在、最も事業進行を妨げているボトルネック（例: "GS1審査待ち", "夫確認待ち", "採算未検証" など。なければ null）。
     - **次にやるべきこと (nextAction)**: AI COOとして最もクリティカルと考えるネクストアクションを1行で提示してください。（例: "卸売採算シミュレーションを完了する"）
     - **意思決定期限 (decisionDeadline)**: 最も重要な意思決定・対処が必要な期限（YYYY-MM-DD形式、なければ null）。期限設定は過去日を絶対に避け、現在日（${currentTodayStr}）以降の未来日とすること。

データリスト:
${JSON.stringify(itemsPayload, null, 2)}

以下のJSONフォーマットのみを返してください（マークダウンの\`\`\`jsonなどの枠線は絶対に含めず、純粋なJSONテキストのみにしてください）：


{
  "message": "今日のフォーカスやCOOからの全体的な一言アドバイス（2文程度）",
  "classifications": [
    {
      "id": "既存アイテムのID",
      "type": "task" | "memo" | "insight",
      "title": "わかりやすいタイトル（30文字以内）",
      "project": "プロジェクト名",
      "content": "メモや知見の内容（元の文章。taskの場合は不要）",
      "priority": "high" | "medium" | "low" (taskの場合のみ),
      "urgency": "high" | "medium" | "low" (taskの場合のみ),
      "requester": "自分" | "夫" | "顧客" など (taskの場合のみ),
      "deadline": "YYYY-MM-DD" | null (taskの場合のみ),
      "profitImpact": "High" | "Medium" | "Low" (taskの場合のみ),
      "progressRate": 進捗率数値0〜100 (taskの場合のみ),
      "status": "pending" | "not-doing-now" (taskの場合のみ),
      "score": スコア数値0〜100 (taskの場合のみ),
      "reason": "評価理由やCOOのアドバイス" (taskの場合のみ),
      "estimatedMinutes": 推定作業時間(数値、分単位) (taskの場合のみ),
      "waitingDays": 推定待機日数(数値) (taskの場合のみ),
      "bottleneck": "待機理由" | null (taskの場合のみ)
    }
  ],
  "extractedTasks": [
    {
      "title": "抽出されたタスクのタイトル",
      "project": "プロジェクト名",
      "priority": "high" | "medium" | "low",
      "urgency": "high" | "medium" | "low",
      "requester": "自分" | "夫" など,
      "deadline": "YYYY-MM-DD" | null,
      "profitImpact": "High" | "Medium" | "Low",
      "status": "pending",
      "progressRate": 0,
      "extractedFromInsightId": "元となった知見アイテムのID",
      "score": スコア数値0〜100,
      "reason": "抽出された理由やCOOのアドバイス",
      "estimatedMinutes": 推定作業時間(数値、分単位),
      "waitingDays": 推定待機日数(数値),
      "bottleneck": "待機理由" | null
    }
  ],
  "projectSummaries": [
    {
      "projectName": "プロジェクト名",
      "progressRate": 進捗率数値0〜100,
      "riskLevel": "smooth" | "warning" | "danger" | "stuck",
      "maxBottleneck": "ボトルネック理由" | null,
      "nextAction": "次にやること" | null,
      "decisionDeadline": "YYYY-MM-DD" | null
    }
  ]
}
`;

  const activeModel = modelName.trim() || 'gemini-2.5-flash-lite';
  let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      }),
    });
  } catch (error) {
    console.error(`First attempt with model ${activeModel} failed:`, error);
  }

  if ((!response || !response.ok) && activeModel !== 'gemini-2.5-flash') {
    console.warn(`Model ${activeModel} failed or unavailable. Falling back to gemini-2.5-flash...`);
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }),
      });
    } catch (fallbackError) {
      console.error('Fallback attempt to gemini-2.5-flash failed:', fallbackError);
    }
  }

  if (!response || !response.ok) {
    const errorText = response ? await response.text() : 'Network error';
    console.error('Gemini API Error:', errorText);
    throw new Error('Gemini APIの呼び出しに失敗しました。APIキーまたはモデル名を確認してください。');
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Geminiからの応答が空でした。');
  }

  try {
    const parsed = JSON.parse(rawText.trim());
    
    let updatedItems = items.map(item => {
      const classification = parsed.classifications?.find((c: any) => c.id === item.id);
      if (classification) {
        if (classification.type === 'task') {
          const oldTask = item as TaskItem;
          // Determine waitingSince timestamp
          const isNewlyWaiting = (classification.waitingDays && classification.waitingDays > 0) && (!oldTask.waitingDays || oldTask.waitingDays === 0);
          const waitingSince = isNewlyWaiting ? Date.now() : (oldTask.waitingSince || (classification.waitingDays && classification.waitingDays > 0 ? Date.now() : undefined));

          return {
            ...item,
            type: 'task',
            title: classification.title,
            project: classification.project || 'その他',
            priority: classification.priority || 'medium',
            urgency: classification.urgency || 'medium',
            status: classification.status || 'pending',
            requester: classification.requester || '自分',
            deadline: oldTask.isDeadlineHandEdited ? oldTask.deadline : (classification.deadline || null),
            profitImpact: classification.profitImpact || 'Medium',
            progressRate: classification.progressRate ?? 0,
            cooScore: classification.score,
            cooReason: classification.reason,
            estimatedMinutes: classification.estimatedMinutes ?? oldTask.estimatedMinutes,
            actualMinutes: oldTask.actualMinutes ?? 0,
            waitingDays: classification.waitingDays ?? oldTask.waitingDays,
            waitingSince: waitingSince,
            bottleneck: classification.bottleneck ?? oldTask.bottleneck,
            notes: oldTask.notes,
            isDeadlineHandEdited: oldTask.isDeadlineHandEdited,
            updatedAt: Date.now(),
          } as TaskItem;
        } else if (classification.type === 'memo') {
          const oldMemo = item as MemoItem;
          return {
            ...item,
            type: 'memo',
            title: classification.title,
            content: classification.content || item.rawInput,
            project: classification.project || 'その他',
            updatedAt: Date.now(),
          } as MemoItem;
        } else if (classification.type === 'insight') {
          const oldInsight = item as InsightItem;
          return {
            ...item,
            type: 'insight',
            title: classification.title,
            content: classification.content || item.rawInput,
            extractedTaskIds: oldInsight.extractedTaskIds,
            updatedAt: Date.now(),
          } as InsightItem;
        }
      }
      return item;
    });

    if (parsed.extractedTasks && Array.isArray(parsed.extractedTasks)) {
      const newTasks: TaskItem[] = parsed.extractedTasks.map((et: any) => {
        const hasWaiting = et.waitingDays && et.waitingDays > 0;
        return {
          id: uuidv4(),
          type: 'task',
          rawInput: `Extracted from Insight ${et.extractedFromInsightId}`,
          title: et.title,
          project: et.project || 'その他',
          priority: et.priority || 'medium',
          urgency: et.urgency || 'medium',
          status: 'pending',
          requester: et.requester || '自分',
          deadline: et.deadline || null,
          profitImpact: et.profitImpact || 'Medium',
          progressRate: et.progressRate || 0,
          cooScore: et.score,
          cooReason: et.reason,
          estimatedMinutes: et.estimatedMinutes || undefined,
          actualMinutes: 0,
          waitingDays: et.waitingDays || undefined,
          waitingSince: hasWaiting ? Date.now() : undefined,
          bottleneck: et.bottleneck || undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as TaskItem;
      });

      updatedItems = updatedItems.map(item => {
        if (item.type === 'insight') {
          const matchingTasks = newTasks.filter(nt => nt.rawInput.includes(item.id));
          if (matchingTasks.length > 0) {
            const taskIds = matchingTasks.map(t => t.id);
            return {
              ...item,
              extractedTaskIds: [...(item.extractedTaskIds || []), ...taskIds],
            } as InsightItem;
          }
        }
        return item;
      });

      updatedItems = [...newTasks, ...updatedItems];
    }

    const projectSummaries: ProjectSummary[] = parsed.projectSummaries || [];

    return {
      items: updatedItems,
      projectSummaries: projectSummaries,
      message: parsed.message || 'AI COOの整理が完了しました！',
    };
  } catch (error) {
    console.error('Failed to parse Gemini response', error);
    throw new Error('Geminiの出力結果の解析に失敗しました。もう一度お試しください。');
  }
}
