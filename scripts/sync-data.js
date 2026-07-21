const fs = require('fs');
const path = require('path');

const MAIN_URL = process.env.MAIN_SERVER_URL;
const SYNC_TOKEN = process.env.SYNC_TOKEN;
const INTERVAL = (parseInt(process.env.SYNC_INTERVAL, 10) || 30) * 1000;
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!MAIN_URL || !SYNC_TOKEN) {
  console.error('[sync] Thiếu MAIN_SERVER_URL hoặc SYNC_TOKEN trong .env');
  process.exit(1);
}

const FILES = [
  { key: 'projects', file: 'projects.json' },
  { key: 'users', file: 'users.json' },
  { key: 'suppliers', file: 'suppliers.json' },
  { key: 'config', file: 'config.json' },
  { key: 'scrapedBids', file: 'scraped-bids.json' }
];

function readLocalFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function sync() {
  const pushRejected = new Set();

  // Phase 1: Push local → server (luôn push, server quyết định accept/reject)
  for (const { key, file } of FILES) {
    const localPath = path.join(DATA_DIR, file);
    const localData = readLocalFile(localPath);
    if (!localData) continue;

    try {
      const resp = await fetch(`${MAIN_URL}/api/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Token': SYNC_TOKEN
        },
        body: JSON.stringify({ file: key, data: localData })
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.action === 'rejected') {
          pushRejected.add(key);
        }
      }
    } catch (e) {
      console.error(`[sync] Push ${key} error:`, e.message);
    }
  }

  // Phase 2: Pull server → local (bỏ qua file đã bị reject để giữ local changes)
  try {
    const resp = await fetch(`${MAIN_URL}/api/sync/pull`, {
      headers: { 'X-Sync-Token': SYNC_TOKEN }
    });
    if (!resp.ok) {
      console.error(`[sync] Pull failed: ${resp.status}`);
      return;
    }

    const serverData = await resp.json();
    for (const { key, file } of FILES) {
      if (pushRejected.has(key)) continue;

      const remote = serverData[key];
      if (!remote || !remote.updatedAt) continue;

      const localPath = path.join(DATA_DIR, file);
      const localData = readLocalFile(localPath);

      if (!localData || remote.updatedAt > localData.updatedAt) {
        fs.writeFileSync(localPath, JSON.stringify(remote, null, 2));
        console.log(`[sync] Updated local ${key} from server`);
      }
    }
  } catch (e) {
    console.error(`[sync] Pull error:`, e.message);
  }
}

console.log(`[sync] Bắt đầu đồng bộ mỗi ${INTERVAL / 1000}s với ${MAIN_URL}`);
sync();
setInterval(sync, INTERVAL);
