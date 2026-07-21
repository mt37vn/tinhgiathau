/**
 * sync-data.js – Đồng bộ dữ liệu 2 chiều giữa local PC và main server
 *
 * Chạy định kỳ (mặc định 30s), push local changes lên server
 * và pull server changes về local. Last-writer-wins theo updatedAt.
 *
 * Usage:
 *   node scripts/sync-data.js
 *
 * Biến môi trường:
 *   MAIN_SERVER_URL    (required) URL server chính
 *   SYNC_TOKEN         (required) Shared secret
 *   SYNC_INTERVAL      (optional, default 30) giây giữa các lần sync
 */

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

let lastSync = {};

function readLocalFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function sync() {
  for (const { key, file } of FILES) {
    const localPath = path.join(DATA_DIR, file);

    // Phase 1: Push local → server
    const localData = readLocalFile(localPath);
    if (!localData) continue;

    const last = lastSync[key];
    if (!last || !localData.updatedAt || localData.updatedAt > last) {
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
          if (result.action === 'accepted') {
            lastSync[key] = localData.updatedAt;
          } else if (result.action === 'rejected' && result.serverUpdatedAt) {
            // Server không chấp nhận → local sẽ pull ở phase 2
            lastSync[key] = result.serverUpdatedAt;
          }
        } else {
          console.error(`[sync] Push ${key} failed: ${resp.status}`);
        }
      } catch (e) {
        console.error(`[sync] Push ${key} error:`, e.message);
      }
    }
  }

  // Phase 2: Pull server → local
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
      const remote = serverData[key];
      if (!remote || !remote.updatedAt) continue;

      const localPath = path.join(DATA_DIR, file);
      const localData = readLocalFile(localPath);

      if (!localData || remote.updatedAt > localData.updatedAt) {
        fs.writeFileSync(localPath, JSON.stringify(remote, null, 2));
        lastSync[key] = remote.updatedAt;
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
