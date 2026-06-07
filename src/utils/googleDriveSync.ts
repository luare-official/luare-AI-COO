import { StorageData } from './storageManager';

let gisLoaded = false;
let tokenClient: any = null;
let resolveTokenPromise: ((token: string) => void) | null = null;
let rejectTokenPromise: ((err: any) => void) | null = null;

/**
 * Load Google Identity Services (GIS) client script.
 */
export function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (gisLoaded || typeof window === 'undefined') {
      resolve();
      return;
    }
    
    // If google accounts is already loaded by another source
    if ((window as any).google?.accounts?.oauth2) {
      gisLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      gisLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Google Identity Services の読み込みに失敗しました。ネットワーク接続を確認してください。'));
    };
    document.head.appendChild(script);
  });
}

/**
 * Initialize the Google OAuth token client.
 */
export function initGoogleDriveSync(clientId: string): Promise<void> {
  return loadGisScript().then(() => {
    if (typeof window === 'undefined') return;
    if (!(window as any).google?.accounts?.oauth2) {
      throw new Error('Google Identity Services がロードされていません。');
    }

    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response: any) => {
        if (response.error) {
          if (rejectTokenPromise) {
            rejectTokenPromise(new Error(response.error_description || response.error));
          }
          return;
        }
        if (response.access_token) {
          // Token obtained successfully
          const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
          
          const keepLogin = localStorage.getItem('keep_google_login') !== 'false';
          if (keepLogin) {
            localStorage.setItem('gdrive_access_token', response.access_token);
            localStorage.setItem('gdrive_token_expires_at', String(expiresAt));
          } else {
            sessionStorage.setItem('gdrive_access_token', response.access_token);
            sessionStorage.setItem('gdrive_token_expires_at', String(expiresAt));
          }
          localStorage.setItem('gdrive_is_linked', 'true');

          if (resolveTokenPromise) {
            resolveTokenPromise(response.access_token);
          }
        } else {
          if (rejectTokenPromise) {
            rejectTokenPromise(new Error('AUTH_REQUIRED'));
          }
        }
      },
    });
  });
}

/**
 * Retrieve or request a valid access token.
 */
export function getAccessToken(interactive: boolean = true): Promise<string> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('ブラウザ環境でのみ実行可能です。'));
  }

  const keepLogin = localStorage.getItem('keep_google_login') !== 'false';
  const token = keepLogin
    ? localStorage.getItem('gdrive_access_token') || sessionStorage.getItem('gdrive_access_token')
    : sessionStorage.getItem('gdrive_access_token');
  
  const expiresAtStr = keepLogin
    ? localStorage.getItem('gdrive_token_expires_at') || sessionStorage.getItem('gdrive_token_expires_at')
    : sessionStorage.getItem('gdrive_token_expires_at');
    
  const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;

  // If token exists and is valid for at least another minute
  if (token && expiresAt > Date.now() + 60000) {
    return Promise.resolve(token);
  }

  if (!tokenClient) {
    return Promise.reject(new Error('Google 同期クライアントが初期化されていません。環境設定 (Google Client ID) を確認してください。'));
  }

  return new Promise((resolve, reject) => {
    resolveTokenPromise = resolve;
    rejectTokenPromise = reject;
    
    if (interactive) {
      // Request access token (opens Google accounts dialog)
      tokenClient.requestAccessToken();
    } else {
      // Try silent authentication. Will return an error via callback if interaction is required.
      tokenClient.requestAccessToken({ prompt: 'none' });
    }
  });
}

/**
 * Disconnect Google Drive linkage.
 */
export function disconnectGoogleDrive(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('gdrive_access_token');
  sessionStorage.removeItem('gdrive_token_expires_at');
  localStorage.removeItem('gdrive_access_token');
  localStorage.removeItem('gdrive_token_expires_at');
  localStorage.removeItem('gdrive_is_linked');
}

/**
 * Check if the user has previously linked Google Drive.
 */
export function isGdriveLinked(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('gdrive_is_linked') === 'true';
}

/**
 * Upload a new file (Multipart upload for metadata and content).
 */
async function uploadFile(token: string, data: StorageData): Promise<void> {
  const metadata = {
    name: 'ai-coo-data.json',
    mimeType: 'application/json',
  };

  const boundary = 'ai_coo_sync_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const body =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(data) +
    closeDelimiter;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: body,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Driveへのファイル作成に失敗しました: ${res.statusText} (${errorText})`);
  }
}

/**
 * Update the content of an existing file.
 */
async function updateFile(token: string, fileId: string, data: StorageData): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Drive上のファイルの更新に失敗しました: ${res.statusText} (${errorText})`);
  }
}

/**
 * Merge local and cloud storage data.
 */
function mergeStorageData(local: StorageData, cloud: StorageData): StorageData {
  const mergedItemsMap = new Map<string, any>();
  
  // 1. Put all cloud items first
  (cloud.items || []).forEach(item => {
    if (item && item.id) {
      mergedItemsMap.set(item.id, item);
    }
  });

  // 2. Put local items, overwrite only if local item is newer
  (local.items || []).forEach(item => {
    if (item && item.id) {
      const existing = mergedItemsMap.get(item.id);
      if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) {
        mergedItemsMap.set(item.id, item);
      }
    }
  });

  // 3. Merge project summaries
  const mergedSummariesMap = new Map<string, any>();
  (cloud.projectSummaries || []).forEach(s => {
    if (s && s.projectName) {
      mergedSummariesMap.set(s.projectName, s);
    }
  });
  (local.projectSummaries || []).forEach(s => {
    if (s && s.projectName) {
      const existing = mergedSummariesMap.get(s.projectName);
      if (!existing || (s.progressRate || 0) > (existing.progressRate || 0)) {
        mergedSummariesMap.set(s.projectName, s);
      }
    }
  });

  return {
    schemaVersion: Math.max(local.schemaVersion || 0, cloud.schemaVersion || 0),
    savedAt: Date.now(),
    items: Array.from(mergedItemsMap.values()),
    projectSummaries: Array.from(mergedSummariesMap.values()),
  };
}

/**
 * Synchronize local data with Google Drive.
 */
export async function syncWithGoogleDrive(
  localData: StorageData,
  isFirstSync: boolean = false,
  interactive: boolean = true
): Promise<{
  action: 'synced_to_cloud' | 'loaded_from_cloud' | 'merged_data' | 'already_up_to_date';
  cloudData?: StorageData;
  localCount: number;
  cloudCount: number;
}> {
  const token = await getAccessToken(interactive);

  // 1. Search for the file in Google Drive
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='ai-coo-data.json'+and+trashed=false&spaces=drive&fields=files(id,name,modifiedTime)`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!searchRes.ok) {
    throw new Error(`Google Driveの検索に失敗しました: ${searchRes.statusText}`);
  }

  const searchJson = await searchRes.json();
  const file = searchJson.files && searchJson.files[0];

  // If the file does not exist, upload the current local data
  if (!file) {
    await uploadFile(token, localData);
    return { action: 'synced_to_cloud', localCount: localData.items?.length || 0, cloudCount: 0 };
  }

  const fileId = file.id;

  // 2. Download the existing file's media content
  const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!downloadRes.ok) {
    throw new Error(`Google Driveからのデータ読み込みに失敗しました: ${downloadRes.statusText}`);
  }

  let cloudData: StorageData;
  try {
    cloudData = await downloadRes.json();
  } catch (e) {
    // If the file is empty or corrupted, overwrite it with local data
    await updateFile(token, fileId, localData);
    return { action: 'synced_to_cloud', localCount: localData.items?.length || 0, cloudCount: 0 };
  }

  // 3. Count data items
  const localCount = localData.items?.length || 0;
  const cloudCount = cloudData.items?.length || 0;

  // Safeguard 1: If cloud is empty and local has data, always write local to cloud
  if (localCount > 0 && cloudCount === 0) {
    await updateFile(token, fileId, localData);
    return { action: 'synced_to_cloud', localCount, cloudCount };
  }

  // Safeguard 2: If local is empty and cloud has data, download cloud to local
  if (localCount === 0 && cloudCount > 0) {
    return { action: 'loaded_from_cloud', cloudData, localCount, cloudCount };
  }

  // Safeguard 3: If it's the first sync and both have data, merge them
  if (isFirstSync && localCount > 0 && cloudCount > 0) {
    const merged = mergeStorageData(localData, cloudData);
    await updateFile(token, fileId, merged);
    return { action: 'merged_data', cloudData: merged, localCount, cloudCount };
  }

  // 4. Otherwise compare savedAt timestamps
  const localTime = localData.savedAt || 0;
  const cloudTime = cloudData.savedAt || 0;

  if (cloudTime > localTime) {
    // Cloud data is newer
    return { action: 'loaded_from_cloud', cloudData, localCount, cloudCount };
  } else if (localTime > cloudTime) {
    // Local data is newer
    await updateFile(token, fileId, localData);
    return { action: 'synced_to_cloud', localCount, cloudCount };
  } else {
    // Timestamps are equal
    return { action: 'already_up_to_date', localCount, cloudCount };
  }
}
