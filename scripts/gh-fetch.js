/**
 * gh-fetch.js – Standalone batch fetcher for GitHub Actions
 *
 * Reads/writes JSON files directly. No Express server needed.
 *
 * Usage:  node scripts/gh-fetch.js
 * Output: data/projects.json (updated), data/sync-report.json
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROJ_FILE = path.join(DATA_DIR, 'projects.json');
const SUPPLIER_FILE = path.join(DATA_DIR, 'suppliers.json');
const REPORT_FILE = path.join(DATA_DIR, 'sync-report.json');

// Ensure data directory exists (it is gitignored and not versioned)
fs.mkdirSync(DATA_DIR, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DELAY_MS = 12000;

function read(name) {
  const filePath = path.join(DATA_DIR, name);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function write(name, data) {
  const filePath = path.join(DATA_DIR, name);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function extractValue(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return String(v[0] != null ? v[0] : '');
  return String(v);
}

function extractPrice(v) {
  if (v == null) return null;
  if (Array.isArray(v)) v = v[0];
  if (v == null) return null;
  const cleaned = String(v).replace(/[,\sVND₫]/gi, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function fuzzyMatch(a, b) {
  if (!a || !b) return 0;
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wa = new Set(na.split(/\s+/));
  const wb = new Set(nb.split(/\s+/));
  let matches = 0;
  for (const w of wa) { if (wb.has(w)) matches++; }
  const total = Math.max(wa.size, wb.size);
  return total > 0 ? matches / total : 0;
}

async function fetchBiddingInfo(page, ibCode) {
  await page.goto(
    'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=index',
    { waitUntil: 'networkidle', timeout: 30000 }
  );
  await page.waitForTimeout(1500);
  await page.fill('input[name="keyword"]', ibCode);

  let responseData = null;
  const handler = async (r) => {
    try {
      if (responseData) return;
      const ct = (r.headers()['content-type'] || '').toLowerCase();
      if (r.status() === 200 && r.url().includes('contractor-selection') && ct.includes('application/json')) {
        const json = await r.json();
        const items = (json.page && json.page.content) || json.data || [];
        const match = items.find(i => (i.notifyNo || i.bidNo) === ibCode);
        if (match) responseData = match;
      }
    } catch {}
  };
  page.on('response', handler);
  await page.keyboard.press('Enter');

  for (let i = 0; i < 25; i++) {
    if (responseData) break;
    await page.waitForTimeout(1000);
  }
  page.removeListener('response', handler);
  if (!responseData) return null;

  const bidForm = extractValue(responseData.bidForm);
  const isRutGon = !!(bidForm && (bidForm.endsWith('RG') || bidForm.toLowerCase().includes('rút gọn') || bidForm.toLowerCase().includes('rut gon')));

  const processApply = extractValue(responseData.processApply);
  if (processApply && processApply.toUpperCase() !== 'QUA_MANG' && !isRutGon) {
    console.log(`    Non-online bid: ${ibCode} (processApply=${processApply})`);
    return null;
  }

  const result = {
    tenCongTrinh: extractValue(responseData.bidName),
    benMoiThau: extractValue(responseData.investorName),
    thoiGianDongThau: extractValue(responseData.bidCloseDate),
    giaDuToan: extractPrice(responseData.bidPrice || responseData.bidEstimatePrice || responseData.planItemPrice),
    diaDiem: '',
    giaTrungThau: extractPrice(responseData.bidWinningPrice),
    nhaThauTrung: extractValue(responseData.contractorName),
    items: [],
    itemsStatus: isRutGon ? 'not-found' : 'not-rut-gon'
  };

  // Try location from search result
  if (responseData.locations && responseData.locations.length > 0) {
    const loc = responseData.locations[0];
    const parts = [loc.wardName, loc.districtName, loc.provName].filter(Boolean);
    if (parts.length) result.diaDiem = parts.join(', ');
  }

  const tbmtId = extractValue(responseData.id);
  if (!tbmtId || !isRutGon) return result;

  // Fetch detail page items
  try {
    const qs = new URLSearchParams();
    qs.set('p_p_id', 'egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2');
    qs.set('p_p_lifecycle', '0');
    qs.set('p_p_state', 'normal');
    qs.set('p_p_mode', 'view');
    qs.set('_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render', 'detail-v2');
    qs.set('type', 'es-notify-contractor');
    qs.set('step', 'tbmt');
    qs.set('id', tbmtId);
    qs.set('notifyId', tbmtId);
    const passThroughParams = ['notifyNo','bidNo','stepCode','processApply','bidMode','planNo','bidForm','bidOpenId','inputResultId','bidPreOpenId','techReqId','bidPreNotifyResultId','pno','caseKHKQ','isInternet'];
    for (const param of passThroughParams) {
      const val = responseData[param];
      if (val != null && val !== '' && String(val) !== 'undefined') {
        qs.set(param, String(val));
      }
    }
    const detailUrl = 'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?' + qs.toString();
    await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);

    result.items = await page.evaluate(() => {
      const allTables = document.querySelectorAll('table.table-expand');
      for (const t of allTables) {
        const rows = t.querySelectorAll('tbody tr');
        if (rows.length === 0) continue;
        return Array.from(rows).map(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 4) return null;
          const clean = c => (c?.textContent || '').trim();
          const rawQty = clean(cells[3]).replace(/[.,\s]/g, '');
          return {
            tenHangHoa: clean(cells[1]),
            donViTinh: clean(cells[2]),
            soLuong: parseFloat(rawQty) || 1,
            ghiChu: clean(cells[9]),
            portalKyMaHieu: clean(cells[4]),
            portalNhanHieu: clean(cells[5]),
            portalHangSanXuat: clean(cells[6]),
            portalXuatXu: clean(cells[7]),
            portalNamSanXuat: clean(cells[8]),
            portalDiaDiemDuAn: clean(cells[10]),
            portalNgayGiaoSomNhat: clean(cells[11]),
            portalNgayGiaoMuonNhat: clean(cells[12]),
            portalYeuCauKhac: clean(cells[13])
          };
        }).filter(Boolean);
      }
      return [];
    });
    result.itemsStatus = result.items.length > 0 ? 'fetched' : 'not-found';
  } catch (e) {
    console.log('    Items parse error:', e.message);
  }

  return result;
}

function mergeItems(portalItems, existingItems) {
  return portalItems.map((pItem, idx) => {
    let bestMatch = null, bestScore = 0;
    for (const eItem of existingItems) {
      if (!eItem.tenHangHoa || !eItem.tenHangHoa.trim()) continue;
      const score = fuzzyMatch(pItem.tenHangHoa, eItem.tenHangHoa);
      if (score > 0.5 && score > bestScore) { bestScore = score; bestMatch = eItem; }
    }
    return {
      id: bestMatch ? bestMatch.id : require('uuid').v4(),
      stt: idx + 1,
      tenHangHoa: pItem.tenHangHoa,
      donViTinh: pItem.donViTinh || 'Gói',
      soLuong: pItem.soLuong || 1,
      donGiaNhap: bestMatch ? (bestMatch.donGiaNhap || 0) : 0,
      giaNhap: bestMatch ? (bestMatch.giaNhap || 0) : 0,
      nhaCungCap: bestMatch ? (bestMatch.nhaCungCap || '') : '',
      donGiaChao: bestMatch ? (bestMatch.donGiaChao || 0) : 0,
      trongSo: bestMatch ? (bestMatch.trongSo || 1) : 1,
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
}

async function main() {
  console.log('=== GH Fetch: Batch Portal Sync ===');
  console.log('Time:', new Date().toISOString());

  let browser;
  const report = { startedAt: new Date().toISOString(), updated: 0, failed: 0, skipped: 0, totalItems: 0, details: [] };

  try {
    const projData = read('projects.json');
    if (!projData || !projData.projects) {
      console.log('No projects.json found. Writing empty default.');
      write('projects.json', { projects: [] });
      report.error = 'Missing projects.json — created empty default';
      return;
    }
    const projectsWithIB = projData.projects.filter(p =>
      p.projectInfo && p.projectInfo.maDauThau && p.projectInfo.maDauThau.trim()
    );

    console.log('Projects with IB:', projectsWithIB.length);
    console.log();

    browser = await chromium.launch({
      headless: true,
      timeout: 30000,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote', '--disable-extensions']
    });

    const context = await browser.newContext({ userAgent: UA });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    for (let i = 0; i < projectsWithIB.length; i++) {
      const proj = projectsWithIB[i];
      const ib = proj.projectInfo.maDauThau.trim();
      const name = (proj.projectInfo.tenCongTrinh || proj.name || '').substring(0, 60);

      const hasPortalItems = proj.items && proj.items.some(it => it.portalKyMaHieu);
      if (hasPortalItems) {
        console.log(`[${i + 1}/${projectsWithIB.length}] SKIP [${ib}] ${name} — already synced`);
        report.skipped++;
        report.details.push({ ib, name, status: 'skipped', reason: 'already has portal items' });
        continue;
      }

      console.log(`[${i + 1}/${projectsWithIB.length}] FETCH [${ib}] ${name}...`);

      try {
        const info = await fetchBiddingInfo(page, ib);
        if (!info) {
          console.log(`    Not found on portal`);
          report.failed++;
          report.details.push({ ib, name, status: 'failed', reason: 'not found' });
        } else if (!info.items || info.items.length === 0) {
          console.log(`    No items (${info.itemsStatus})`);
          report.skipped++;
          report.details.push({ ib, name, status: 'skipped', reason: info.itemsStatus });
        } else {
          const matched = mergeItems(info.items, proj.items || []);
          proj.items = matched;
          const matchedCount = matched.filter(it => it.nhaCungCap).length;
          console.log(`    OK: ${info.items.length} items (${matchedCount} preserved prices)`);
          report.updated++;
          report.totalItems += info.items.length;
          report.details.push({ ib, name, status: 'ok', items: info.items.length, preservedPrices: matchedCount });
        }
      } catch (e) {
        console.log(`    ERROR: ${e.message}`);
        report.failed++;
        report.details.push({ ib, name, status: 'failed', reason: e.message });
      }

      write('projects.json', projData);

      if (i < projectsWithIB.length - 1) {
        const delay = DELAY_MS + Math.floor(Math.random() * 4000);
        process.stdout.write(`    Waiting ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
        console.log('done');
      }
    }

    await context.close();
  } catch (e) {
    console.error('Fatal error:', e.message);
    report.error = e.message;
  } finally {
    if (browser) await browser.close();
  }

  report.endedAt = new Date().toISOString();
  report.durationSec = Math.round((new Date(report.endedAt) - new Date(report.startedAt)) / 1000);

  console.log();
  console.log('=== SUMMARY ===');
  console.log('Updated:', report.updated);
  console.log('Failed:', report.failed);
  console.log('Skipped:', report.skipped);
  console.log('Total items added:', report.totalItems);
  console.log('Duration:', report.durationSec, 'seconds');

  write('sync-report.json', report);
  console.log('Report written to data/sync-report.json');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
