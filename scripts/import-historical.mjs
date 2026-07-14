import XLSX from 'xlsx';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const PROJ_FILE = path.join(DATA_DIR, 'projects.json');
const SUPPLIER_FILE = path.join(DATA_DIR, 'suppliers.json');
const EXCEL_DIR = '/Users/tuanbm/Downloads/phan tich thau';

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file) {
  try { return JSON.parse(readFileSync(file, 'utf-8')); }
  catch { return file === PROJ_FILE ? { projects: [] } : { suppliers: [] }; }
}

function writeJSON(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2));
}

// Parse ranking like "1/7" => { position: 1, total: 7 }
function parseRanking(rank) {
  if (!rank) return null;
  const m = String(rank).match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { position: parseInt(m[1]), total: parseInt(m[2]) };
}

function normalizeName(name) {
  if (!name) return '';
  return String(name).trim().toLowerCase().replace(/[\s\r\n]+/g, ' ').replace(/[.,;:!?()"']/g, '').trim();
}

function parsePrice(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[,\sVND₫]/gi, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n);
}

function getSuppliersSet(existing) {
  const set = new Map();
  for (const s of existing.suppliers) {
    set.set(normalizeName(s.name), s.id);
    for (const a of (s.aliases || [])) set.set(normalizeName(a), s.id);
  }
  return set;
}

// Load customer-facing fields name is based on the data sheet name mapping
const fieldNameMap = {
  'Máy chủ': 'Máy chủ',
  'Thiết bị CNTT': 'Thiết bị CNTT',
  'UPS': 'UPS',
  'Âm thanh': 'Thiết bị âm thanh',
  'HNTH': 'Hội nghị truyền hình',
  'Hội nghị \r\ntruyền hình': 'Hội nghị truyền hình',
  'Hình ảnh': 'Thiết bị hình ảnh',
  'thiết bị CNTT': 'Thiết bị CNTT',
  'Phần mềm': 'Phần mềm',
};

console.log('=== Import dữ liệu từ Excel ===\n');

// Read both Excel files
const f2Path = path.join(EXCEL_DIR, 'Tổng hợp gói thầu.xlsx');
const f1Path = path.join(EXCEL_DIR, 'Dữ liệu đánh giá nhà cung cấp_V3_Final.xlsx');

const wb2 = XLSX.readFile(f2Path);
const ws2 = wb2.Sheets['Du lieu goi thau'];
const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1 });

const wb1 = XLSX.readFile(f1Path);
const ws1 = wb1.Sheets['Số liệu'];
const rows1 = XLSX.utils.sheet_to_json(ws1, { header: 1 });

// Build lookup from file 1 by IB code (contains winning contractor)
const lookup1 = new Map();
for (let i = 3; i < rows1.length; i++) {
  const r = rows1[i];
  if (!r) continue;
  const ib = r[1];
  if (!ib) continue;
  const key = String(ib).trim();
  if (!lookup1.has(key)) {
    lookup1.set(key, {
      winningContractor: r[24] || null,
      supplier: r[23] || null,
      rank: r[5] || null
    });
  }
}

// Load existing data
let projData = readJSON(PROJ_FILE);
let suppData = readJSON(SUPPLIER_FILE);
const existingSuppliers = getSuppliersSet(suppData);
const existingIBs = new Set(projData.projects.map(p => p.projectInfo?.maDauThau).filter(Boolean));

let newProjects = 0;
let newSuppliers = 0;

// Remove previously imported projects (those not in the original 3)
const keepIds = new Set([
  'af1c8ff8-3e8b-4d6d-be51-6a19044a65a2',
  'b0e14686-1bf6-4d56-b102-1b3dd0a71a42',
  'ff10fff3-4a7c-40c0-8771-0a4fe320557e',
]);
projData.projects = projData.projects.filter(p => keepIds.has(p.id));
existingIBs.clear();
for (const p of projData.projects) {
  if (p.projectInfo?.maDauThau) existingIBs.add(p.projectInfo.maDauThau);
}

console.log(`Giữ lại ${projData.projects.length} dự án gốc, sẵn sàng import...\n`);

// Process rows from file 2 (Tổng hợp gói thầu)
for (let i = 2; i < rows2.length; i++) {
  const r = rows2[i];
  if (!r || !r[1]) continue;

  const ibCode = String(r[1]).trim();
  if (existingIBs.has(ibCode)) {
    console.log(`  ⏭ ${ibCode}: đã tồn tại`);
    continue;
  }

  const field = String(r[2] || '').trim();
  const investor = String(r[4] || '').trim();
  const rank = parseRanking(r[5]);
  const giaDuToan = parsePrice(r[6]);
  const giaChao = parsePrice(r[7]);
  const giaTrungThau = parsePrice(r[8]);
  const giaVon = parsePrice(r[9]);
  const cpTrienKhai = parsePrice(r[10]) || 0;
  const cpKhac = parsePrice(r[11]) || 0;
  const supplierRaw = r[21] || null;
  const fieldName = fieldNameMap[field] || field;

  // Get winning contractor from file 1 lookup
  const extra = lookup1.get(ibCode);
  const winningSupplier = extra?.winningContractor || null;

  // Determine win/lose
  let ketQua = null;
  let xepHang = null;
  if (rank) {
    xepHang = `${rank.position}/${rank.total}`;
    ketQua = rank.position === 1 ? 'win' : 'lose';
  }

  // Parse supplier names (may be comma-separated)
  const supplierNames = supplierRaw ? String(supplierRaw).split(/[,;\n\r]+/).map(s => s.trim()).filter(Boolean) : [];

  // Create project
  const now = new Date().toISOString();
  const project = {
    id: uuidv4(),
    name: `${fieldName} - ${investor || ibCode}`,
    createdAt: now,
    updatedAt: now,
    status: 'approved',
    projectInfo: {
      tenCongTrinh: `${fieldName}${investor ? ' - ' + investor : ''}`,
      maDauThau: ibCode,
      benMoiThau: investor || '',
      diaDiem: '',
      nguoiLap: 'Hệ thống',
      ngayLap: now.split('T')[0],
      thoiGianDongThau: '',
    },
    items: [{
      id: 'i1',
      stt: 1,
      tenHangHoa: fieldName,
      ghiChu: `Xếp hạng: ${xepHang || 'N/A'}`,
      donViTinh: 'Gói',
      soLuong: 1,
      donGiaNhap: giaVon || 0,
      giaNhap: giaVon || 0,
      nhaCungCap: supplierNames[0] || '',
      donGiaChao: giaChao || 0,
      trongSo: 1
    }],
    params: {
      tiLeLNG: 0,
      phiDuThau: 0,
      phiBaoHanh: 0,
      phiBanHang: 0,
      phiCongTac: cpTrienKhai,
      hoaHongKD: 0,
      giaDuToan: giaDuToan || 0
    },
    ketQuaTrungThau: ketQua,
    giaTrungThau: giaTrungThau,
    nhaThauTrung: winningSupplier || '',
    bidResultFetchedAt: now,
    bidResultFetchError: null,
  };

  projData.projects.push(project);
  newProjects++;
  console.log(`  ✅ ${ibCode}: ${fieldName}, ${xepHang || 'N/A'}${ketQua === 'win' ? ' 🏆 TRÚNG' : ketQua === 'lose' ? ' ❌ trượt' : ''}${winningSupplier ? ` (${winningSupplier.trim()})` : ''}`);

  // Register suppliers
  for (const sn of supplierNames) {
    const norm = normalizeName(sn);
    if (norm && !existingSuppliers.has(norm)) {
      const newSupp = { id: uuidv4(), name: sn.trim(), aliases: [], createdAt: now };
      suppData.suppliers.push(newSupp);
      existingSuppliers.set(norm, newSupp.id);
      newSuppliers++;
      console.log(`    📦 Supplier mới: ${sn.trim()}`);
    }
  }
}

// Clean up bogus suppliers (those that are actually reasons, not names)
const validSuppliers = suppData.suppliers.filter(s => {
  const n = normalizeName(s.name);
  return n && !n.includes('giá nhập') && !n.includes('địa điểm') && !n.includes('chưa tối ưu')
      && !n.includes('không đáp ứng') && !n.includes('không khai báo') && !n.includes('chưa tìm được');
});
suppData.suppliers = validSuppliers;

// Save
writeJSON(PROJ_FILE, projData);
writeJSON(SUPPLIER_FILE, suppData);

console.log(`\n=== Kết quả: ${newProjects} dự án mới, ${newSuppliers} supplier mới ===`);
