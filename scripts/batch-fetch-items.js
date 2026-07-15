// Batch fetch portal items for all projects
// Usage: node scripts/batch-fetch-items.js
// Waits 8-12 seconds between fetches to avoid portal rate limiting

const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROJ_FILE = path.join(DATA_DIR, 'projects.json');
const PORT = 3456;
const DELAY_MS = 10000; // 10 seconds between fetches

function api(method, urlPath, body, cookies) {
  return new Promise((resolve, reject) => {
    const url = new URL('http://localhost:' + PORT + urlPath);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (url.search || ''),
      method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies || ''
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data.substring(0, 500) });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function extractCookie(setCookie) {
  if (!setCookie) return '';
  const match = setCookie[0].match(/connect\.sid=[^;]+/);
  return match ? match[0] : '';
}

function fuzzyMatch(name1, name2) {
  if (!name1 || !name2) return 0;
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  if (n1 === n2) return 1;
  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.8;
  // Word-level matching
  const words1 = new Set(n1.split(/\s+/));
  const words2 = new Set(n2.split(/\s+/));
  let matches = 0;
  for (const w of words1) {
    if (words2.has(w)) matches++;
  }
  const total = Math.max(words1.size, words2.size);
  return total > 0 ? matches / total : 0;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Batch Fetch Portal Items ===');
  console.log('Delay between requests:', DELAY_MS / 1000, 'seconds\n');

  // Step 1: Login
  console.log('[1] Logging in...');
  const loginRes = await api('POST', '/api/login', { username: 'test', password: 'test123' });
  if (loginRes.data.error) {
    console.error('Login failed:', loginRes.data.error);
    process.exit(1);
  }
  const cookie = extractCookie(loginRes.headers['set-cookie']);
  console.log('    Logged in as:', loginRes.data.user.fullName);

  // Step 2: Load projects
  const projData = JSON.parse(fs.readFileSync(PROJ_FILE, 'utf-8'));
  const projectsWithIB = projData.projects.filter(p => 
    p.projectInfo && p.projectInfo.maDauThau && p.projectInfo.maDauThau.trim()
  );
  console.log('[2] Projects to process:', projectsWithIB.length);
  console.log();

  let updated = 0;
  let failed = 0;
  let skipped = 0;
  let totalItemsAdded = 0;

  for (let i = 0; i < projectsWithIB.length; i++) {
    const proj = projectsWithIB[i];
    const ib = proj.projectInfo.maDauThau.trim();
    const projName = (proj.projectInfo.tenCongTrinh || proj.name || '').substring(0, 50);

    // Check if already has portal items
    const hasPortal = proj.items && proj.items.some(it => it.portalKyMaHieu);
    if (hasPortal) {
      console.log(`[${i+1}/${projectsWithIB.length}] SKIP [${ib}] ${projName} — already has portal items`);
      skipped++;
      continue;
    }

    console.log(`[${i+1}/${projectsWithIB.length}] FETCH [${ib}] ${projName}...`);

    try {
      // Step 3: Fetch bidding info (includes items now)
      const fetchRes = await api('GET', '/api/fetch-bidding-info/' + encodeURIComponent(ib), null, cookie);
      
      if (fetchRes.data.error) {
        console.log(`    ERROR: ${fetchRes.data.error}`);
        failed++;
      } else if (!fetchRes.data.items || fetchRes.data.items.length === 0) {
        console.log(`    No items found on portal`);
        skipped++;
      } else {
        const portalItems = fetchRes.data.items;
        const existingItems = proj.items || [];

        // Match portal items to existing items to preserve prices/suppliers
        const matchedItems = portalItems.map((pItem, idx) => {
          // Try to find best match in existing items
          let bestMatch = null;
          let bestScore = 0;
          for (const eItem of existingItems) {
            if (eItem.tenHangHoa && eItem.tenHangHoa.trim()) {
              const score = fuzzyMatch(pItem.tenHangHoa, eItem.tenHangHoa);
              if (score > 0.5 && score > bestScore) {
                bestScore = score;
                bestMatch = eItem;
              }
            }
          }

          return {
            id: pItem.id || uuidv4(),
            stt: idx + 1,
            tenHangHoa: pItem.tenHangHoa,
            donViTinh: pItem.donViTinh || 'Gói',
            soLuong: pItem.soLuong || 1,
            donGiaNhap: bestMatch ? (bestMatch.donGiaNhap || 0) : 0,
            giaNhap: bestMatch ? (bestMatch.giaNhap || 0) : 0,
            nhaCungCap: bestMatch ? (bestMatch.nhaCungCap || '') : '',
            donGiaChao: 0,
            trongSo: 1,
            ghiChu: pItem.ghiChu || '',
            portalKyMaHieu: pItem.portalKyMaHieu || '',
            portalNhanHieu: pItem.portalNhanHieu || '',
            portalHangSanXuat: pItem.portalHangSanXuat || '',
            portalXuatXu: pItem.portalXuatXu || '',
            portalNamSanXuat: pItem.portalNamSanXuat || '',
            portalDiaDiemDuAn: pItem.portalDiaDiemDuAn || '',
            portalNgayGiaoSomNhat: pItem.portalNgayGiaoSomNhat || '',
            portalNgayGiaoMuonNhat: pItem.portalNgayGiaoMuonNhat || '',
            portalYeuCauKhac: pItem.portalYeuCauKhac || ''
          };
        });

        // Update project
        proj.items = matchedItems;
        const matchInfo = matchedItems.filter(it => it.nhaCungCap).length;
        console.log(`    OK: ${portalItems.length} items from portal (${matchInfo} matched with existing prices)`);
        updated++;
        totalItemsAdded += portalItems.length;
      }
    } catch (e) {
      console.log(`    ERROR: ${e.message}`);
      failed++;
    }

    // Save progress after each project (incremental)
    fs.writeFileSync(PROJ_FILE, JSON.stringify(projData, null, 2));

    // Delay before next request (avoid rate limiting)
    if (i < projectsWithIB.length - 1) {
      const delay = DELAY_MS + Math.floor(Math.random() * 4000);
      process.stdout.write(`    Waiting ${Math.round(delay/1000)}s...`);
      await sleep(delay);
      console.log('done');
    }
  }

  console.log();
  console.log('=== SUMMARY ===');
  console.log('Updated:', updated);
  console.log('Failed:', failed);
  console.log('Skipped:', skipped);
  console.log('Total items added:', totalItemsAdded);
  console.log('Projects saved to:', PROJ_FILE);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
