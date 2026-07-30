require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const trelloSync = require('./scripts/trello-sync');

const app = express();

// Concurrent Playwright fetch control – avoid OOM on shared server
let activeFetches = 0;
const MAX_FETCHES = 1;

const PORT = process.env.PORT || 3456;
const DATA_DIR = path.join(__dirname, 'data');
const PROJ_FILE = path.join(DATA_DIR, 'projects.json');
const USER_FILE = path.join(DATA_DIR, 'users.json');
const SUPPLIER_FILE = path.join(DATA_DIR, 'suppliers.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const SCRAPED_BIDS_FILE = path.join(DATA_DIR, 'scraped-bids.json');
const TBMT_API_BASE = 'https://hsmt.haproinfo.vn/api';
const TBMT_API_KEY = 'inf0@hapro';
const TBMT_DIR = path.join(DATA_DIR, 'tbmt-files');

app.use(express.json());
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'dauthau-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROJ_FILE)) fs.writeFileSync(PROJ_FILE, JSON.stringify({ projects: [] }, null, 2));
if (!fs.existsSync(SUPPLIER_FILE)) fs.writeFileSync(SUPPLIER_FILE, JSON.stringify({ suppliers: [] }, null, 2));
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({ companyName: 'CÔNG TY CỔ PHẦN THÔNG TIN HAPRO' }, null, 2));
if (!fs.existsSync(SCRAPED_BIDS_FILE)) fs.writeFileSync(SCRAPED_BIDS_FILE, JSON.stringify({ entries: [] }, null, 2));
if (!fs.existsSync(TBMT_DIR)) fs.mkdirSync(TBMT_DIR, { recursive: true });

function isRutGonProject(project) {
  const info = project.projectInfo;
  if (!info) return false;
  if (info.isRutGon) return true;
  if (info.hinhThucLCNT && (info.hinhThucLCNT.includes('rút gọn') || info.hinhThucLCNT.includes('rut gon'))) return true;
  if (info.bidForm && (info.bidForm === 'CGTTRG' || info.bidForm === 'CHTRG')) return true;
  if (project.items && project.items.some(i => i.portalKyMaHieu || i.portalNhanHieu || i.portalHangSanXuat)) return true;
  return false;
}

function cleanupExpiredUpcoming() {
  try {
    const projData = readData(PROJ_FILE);
    const now = new Date();
    const before = projData.projects.length;
    projData.projects = projData.projects.filter(p => {
      if (p.status !== 'upcoming') return true;
      const closeDate = p.projectInfo && p.projectInfo.thoiGianDongThau ? new Date(p.projectInfo.thoiGianDongThau) : null;
      if (!closeDate) return true;
      return closeDate >= now;
    });
    if (projData.projects.length !== before) {
      writeData(PROJ_FILE, projData);
      console.log(`[cleanup] Removed ${before - projData.projects.length} expired upcoming projects`);
    }
  } catch (e) { console.error('[cleanup] Error:', e.message); }
}
cleanupExpiredUpcoming();
// Sync existing suppliers from projects on startup
try {
  const existingProj = JSON.parse(fs.readFileSync(PROJ_FILE, 'utf-8'));
  const existingSupp = JSON.parse(fs.readFileSync(SUPPLIER_FILE, 'utf-8'));
  let changed = false;
  for (const proj of existingProj.projects) {
    if (!proj.items) continue;
    for (const item of proj.items) {
      if (item.nhaCungCap && item.nhaCungCap.trim()) {
        const id = getSupplierIdByName(item.nhaCungCap, existingSupp.suppliers);
        if (!id) {
          existingSupp.suppliers.push({
            id: uuidv4(),
            name: item.nhaCungCap.trim(),
            aliases: [],
            createdAt: new Date().toISOString()
          });
          changed = true;
        }
      }
    }
  }
  if (changed) fs.writeFileSync(SUPPLIER_FILE, JSON.stringify(existingSupp, null, 2));
} catch (e) { /* ignore startup sync errors */ }

if (!fs.existsSync(USER_FILE)) {
  const defaultUsers = [
    { id: uuidv4(), username: 'admin', password: bcrypt.hashSync('admin123', 10), fullName: 'CEO Admin', role: 'admin', createdAt: new Date().toISOString() },
    { id: uuidv4(), username: 'nhanvien', password: bcrypt.hashSync('nv123', 10), fullName: 'Nhân viên', role: 'employee', createdAt: new Date().toISOString() }
  ];
  fs.writeFileSync(USER_FILE, JSON.stringify({ users: defaultUsers }, null, 2));
}

function readData(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return file === PROJ_FILE ? { projects: [] } : { users: [] }; }
}
function writeData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  req.currentUser = req.session.user;
  next();
}

function adminOnly(req, res, next) {
  if (req.currentUser.role !== 'admin') return res.status(403).json({ error: 'Từ chối: chỉ admin' });
  next();
}

// --- Supplier helpers ---
function normalizeSupplierName(name) {
  if (!name) return '';
  let n = name.trim().toLowerCase();
  n = n.replace(/[.,;:!?()"']/g, ' ');
  n = n.replace(/\bcty\b/g, 'cong ty');
  n = n.replace(/\bcông ty\b/g, 'cong ty');
  n = n.replace(/\btnhh\b/g, 'trach nhiem huu han');
  n = n.replace(/\btrách nhiệm hữu hạn\b/g, 'trach nhiem huu han');
  n = n.replace(/\bcong ty\b/g, 'cong ty');
  n = n.replace(/\bco\b/g, '');
  n = n.replace(/\bltd\b/g, '');
  n = n.replace(/[^a-z0-9\s]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

function getSupplierIdByName(rawName, suppliers) {
  const normalized = normalizeSupplierName(rawName);
  if (!normalized) return null;
  for (const s of suppliers) {
    if (normalizeSupplierName(s.name) === normalized) return s.id;
    for (const a of (s.aliases || [])) {
      if (normalizeSupplierName(a) === normalized) return s.id;
    }
  }
  return null;
}

function ensureSupplier(rawName) {
  if (!rawName || !rawName.trim()) return null;
  const data = readData(SUPPLIER_FILE);
  const existingId = getSupplierIdByName(rawName, data.suppliers);
  if (existingId) return existingId;
  const newSupplier = {
    id: uuidv4(),
    name: rawName.trim(),
    aliases: [],
    createdAt: new Date().toISOString()
  };
  data.suppliers.push(newSupplier);
  writeData(SUPPLIER_FILE, data);
  return newSupplier.id;
}

function syncSuppliersFromItems(items) {
  if (!items || !items.length) return;
  for (const item of items) {
    if (item.nhaCungCap && item.nhaCungCap.trim()) {
      ensureSupplier(item.nhaCungCap);
    }
  }
}

function computeSupplierStats() {
  const sData = readData(SUPPLIER_FILE);
  const pData = readData(PROJ_FILE);
  const stats = {};

  for (const s of sData.suppliers) {
    const aliases = [s.name, ...(s.aliases || [])];
    const aliasLower = aliases.map(a => normalizeSupplierName(a));
    const projectIds = new Set();
    let totalItems = 0;
    let sumGiaNhap = 0;
    let sumDonGiaNhap = 0;
    let winCount = 0;
    let loseCount = 0;
    const itemHistory = {};
    const projectList = [];
    const discountRates = [];

    for (const proj of pData.projects) {
      if (!proj.items) continue;
      let foundInProject = false;
      const supplierItems = [];
      for (const item of proj.items) {
        if (!item.nhaCungCap) continue;
        if (aliasLower.includes(normalizeSupplierName(item.nhaCungCap))) {
          foundInProject = true;
          totalItems++;
          const gn = (item.soLuong || 0) * (item.donGiaNhap || 0);
          sumGiaNhap += gn;
          sumDonGiaNhap += item.donGiaNhap || 0;
          supplierItems.push(item);
          const key = normalizeSupplierName(item.tenHangHoa || '');
          if (key) {
            if (!itemHistory[key]) itemHistory[key] = { ten: item.tenHangHoa, count: 0, sumPrice: 0, minPrice: Infinity, maxPrice: 0, lastPrice: 0, lastDate: '' };
            itemHistory[key].count++;
            itemHistory[key].sumPrice += item.donGiaNhap || 0;
            if ((item.donGiaNhap || 0) < itemHistory[key].minPrice) itemHistory[key].minPrice = item.donGiaNhap || 0;
            if ((item.donGiaNhap || 0) > itemHistory[key].maxPrice) itemHistory[key].maxPrice = item.donGiaNhap || 0;
            itemHistory[key].lastPrice = item.donGiaNhap || 0;
            if (proj.updatedAt > itemHistory[key].lastDate) itemHistory[key].lastDate = proj.updatedAt;
          }
        }
      }
      if (foundInProject) {
        projectIds.add(proj.id);
        const kr = proj.ketQuaTrungThau;
        if (kr === 'win') winCount++;
        else if (kr === 'lose') loseCount++;

        if (kr === 'win' && proj.giaTrungThau && supplierItems.length > 0) {
          const totalGiaChao = supplierItems.reduce((sum, item) => sum + (item.donGiaChao || 0), 0);
          if (totalGiaChao > 0) {
            for (const item of supplierItems) {
              const dgc = item.donGiaChao || 0;
              const gn = (item.soLuong || 0) * (item.donGiaNhap || 0);
              const itemWinningPrice = proj.giaTrungThau * (dgc / totalGiaChao);
              if (itemWinningPrice > 0) {
                const discountRate = (itemWinningPrice - gn) / itemWinningPrice * 100;
                discountRates.push({
                  projectId: proj.id,
                  projectName: proj.name,
                  itemName: item.tenHangHoa,
                  itemWinningPrice: Math.round(itemWinningPrice),
                  itemCost: gn,
                  discountRate
                });
              }
            }
          }
        }

        projectList.push({
          id: proj.id,
          name: proj.name,
          maDauThau: proj.projectInfo?.maDauThau || '',
          status: proj.status,
          ketQuaTrungThau: kr || null,
          giaTrungThau: proj.giaTrungThau || null,
          xepHang: proj.xepHang || extractXepHang(proj.items) || null,
          updatedAt: proj.updatedAt
        });
      }
    }

    let avgDiscountRate = null;
    let minDiscountRate = null;
    let maxDiscountRate = null;
    let weightedDiscountRate = null;

    if (discountRates.length > 0) {
      const rates = discountRates.map(d => d.discountRate);
      avgDiscountRate = rates.reduce((s, r) => s + r, 0) / rates.length;
      minDiscountRate = Math.min(...rates);
      maxDiscountRate = Math.max(...rates);

      let weightedSum = 0, totalWeight = 0;
      for (const d of discountRates) {
        weightedSum += d.discountRate * d.itemWinningPrice;
        totalWeight += d.itemWinningPrice;
      }
      weightedDiscountRate = totalWeight > 0 ? weightedSum / totalWeight : avgDiscountRate;
    }

    const totalDecided = winCount + loseCount;
    const winRate = totalDecided > 0 ? (winCount / totalDecided * 100) : null;

    const itemStats = {};
    for (const key of Object.keys(itemHistory)) {
      const h = itemHistory[key];
      itemStats[key] = {
        tenHangHoa: h.ten,
        soLan: h.count,
        giaTrungBinh: h.count > 0 ? Math.round(h.sumPrice / h.count) : 0,
        giaThapNhat: h.minPrice === Infinity ? 0 : h.minPrice,
        giaCaoNhat: h.maxPrice,
        giaGanNhat: h.lastPrice,
        discountRate: null
      };
    }

    for (const d of discountRates) {
      const key = normalizeSupplierName(d.itemName);
      if (itemStats[key]) {
        itemStats[key].discountRate = Math.round(d.discountRate * 100) / 100;
        itemStats[key].itemWinningPrice = d.itemWinningPrice;
        itemStats[key].itemCost = d.itemCost;
      }
    }

    const discountScore = avgDiscountRate != null ? Math.min(avgDiscountRate, 100) : 0;

    const maxProjects = Math.max(1, sData.suppliers.reduce((max, sup) => {
      const supAliases = [sup.name, ...(sup.aliases || [])].map(a => normalizeSupplierName(a));
      const count = pData.projects.filter(p => p.items && p.items.some(item =>
        item.nhaCungCap && supAliases.includes(normalizeSupplierName(item.nhaCungCap))
      )).length;
      return Math.max(max, count);
    }, 1));
    const experienceScore = (projectIds.size / maxProjects) * 100;

    const maxWinCount = Math.max(1, sData.suppliers.reduce((max, sup) => {
      const supAliases = [sup.name, ...(sup.aliases || [])].map(a => normalizeSupplierName(a));
      let count = 0;
      for (const proj of pData.projects) {
        if (!proj.items || proj.ketQuaTrungThau !== 'win') continue;
        if (proj.items.some(item =>
          item.nhaCungCap && supAliases.includes(normalizeSupplierName(item.nhaCungCap))
        )) count++;
      }
      return Math.max(max, count);
    }, 1));

    const winScore = totalDecided > 0
      ? 0.5 * Math.min(winRate, 100) + 0.5 * (winCount / maxWinCount * 100)
      : 0;

    const score = 0.40 * winScore + 0.35 * discountScore + 0.25 * experienceScore;

    stats[s.id] = {
      supplierId: s.id,
      supplierName: s.name,
      totalProjects: projectIds.size,
      winCount,
      loseCount,
      totalDecided,
      winRate,
      totalItems,
      avgGiaNhap: totalItems > 0 ? Math.round(sumGiaNhap / totalItems) : 0,
      avgDonGiaNhap: totalItems > 0 ? Math.round(sumDonGiaNhap / totalItems) : 0,
      itemStats,
      projects: projectList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
      avgDiscountRate: avgDiscountRate != null ? Math.round(avgDiscountRate * 100) / 100 : null,
      minDiscountRate: minDiscountRate != null ? Math.round(minDiscountRate * 100) / 100 : null,
      maxDiscountRate: maxDiscountRate != null ? Math.round(maxDiscountRate * 100) / 100 : null,
      weightedDiscountRate: weightedDiscountRate != null ? Math.round(weightedDiscountRate * 100) / 100 : null,
      discountDetails: discountRates,
      score: Math.round(score * 100) / 100,
      stars: 0
    };
  }

  const scores = Object.values(stats).map(s => s.score).filter(s => s > 0);
  if (scores.length > 0) {
    scores.sort((a, b) => a - b);
    const total = scores.length;
    Object.values(stats).forEach(s => {
      if (s.score <= 0) { s.stars = 0; return; }
      const idx = scores.indexOf(s.score);
      const percentile = total > 1 ? idx / (total - 1) : 1;
      s.stars = percentile >= 0.8 ? 5 : percentile >= 0.6 ? 4 : percentile >= 0.4 ? 3 : percentile >= 0.2 ? 2 : 1;
    });
  }

  return stats;
}

// --- Supplier API ---
app.get('/api/suppliers', auth, (req, res) => {
  const sData = readData(SUPPLIER_FILE);
  const stats = computeSupplierStats();
  const result = sData.suppliers.map(s => ({
    id: s.id,
    name: s.name,
    aliases: s.aliases || [],
    createdAt: s.createdAt,
    stats: stats[s.id] || null
  }));
  res.json(result);
});

app.get('/api/suppliers/:id', auth, (req, res) => {
  const sData = readData(SUPPLIER_FILE);
  const supplier = sData.suppliers.find(s => s.id === req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });
  const stats = computeSupplierStats();
  res.json({
    id: supplier.id,
    name: supplier.name,
    aliases: supplier.aliases || [],
    createdAt: supplier.createdAt,
    stats: stats[supplier.id] || null
  });
});

app.put('/api/suppliers/:id/merge', auth, adminOnly, (req, res) => {
  const sData = readData(SUPPLIER_FILE);
  const target = sData.suppliers.find(s => s.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });
  const { aliasIds } = req.body;
  if (!aliasIds || !Array.isArray(aliasIds) || !aliasIds.length)
    return res.status(400).json({ error: 'Cần danh sách aliasIds' });
  for (const aliasId of aliasIds) {
    const idx = sData.suppliers.findIndex(s => s.id === aliasId);
    if (idx === -1) continue;
    const alias = sData.suppliers[idx];
    if (alias.name !== target.name) {
      if (!target.aliases.includes(alias.name)) target.aliases.push(alias.name);
      for (const a of (alias.aliases || [])) {
        if (!target.aliases.includes(a)) target.aliases.push(a);
      }
    }
    sData.suppliers.splice(idx, 1);
  }
  writeData(SUPPLIER_FILE, sData);
  res.json({ ok: true, supplier: target });
});

app.get('/api/suppliers/suggest/:itemName', auth, (req, res) => {
  const itemName = decodeURIComponent(req.params.itemName || '').trim().toLowerCase();
  if (!itemName) return res.json([]);
  const stats = computeSupplierStats();
  const sData = readData(SUPPLIER_FILE);
  const results = [];
  for (const s of sData.suppliers) {
    const st = stats[s.id];
    if (!st || !st.itemStats) continue;
    for (const key of Object.keys(st.itemStats)) {
      if (key.includes(itemName)) {
        results.push({
          supplierId: s.id,
          supplierName: s.name,
          tenHangHoa: st.itemStats[key].tenHangHoa,
          giaGanNhat: st.itemStats[key].giaGanNhat,
          giaTrungBinh: st.itemStats[key].giaTrungBinh,
          soLan: st.itemStats[key].soLan,
          winRate: st.winRate,
          avgDiscountRate: st.avgDiscountRate
        });
      }
    }
  }
  results.sort((a, b) => (b.soLan || 0) - (a.soLan || 0));
  res.json(results.slice(0, 10));
});

// --- Auth ---
app.post('/api/login', (req, res) => {
  const { username, password, remember } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Nhập tài khoản và mật khẩu' });
  const data = readData(USER_FILE);
  const user = data.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
  req.session.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  if (remember) {
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
  } else {
    req.session.cookie.maxAge = 24 * 60 * 60 * 1000;
  }
  req.session.save(err => {
    if (err) return res.status(500).json({ error: 'Lỗi lưu phiên đăng nhập' });
    res.json({ user: req.session.user });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  res.json({ user: req.session.user });
});

app.post('/api/change-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Nhập mật khẩu cũ và mới' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 4 ký tự' });
  const data = readData(USER_FILE);
  const user = data.users.find(u => u.id === req.currentUser.id);
  if (!user || !bcrypt.compareSync(oldPassword, user.password))
    return res.status(400).json({ error: 'Sai mật khẩu cũ' });
  user.password = bcrypt.hashSync(newPassword, 10);
  writeData(USER_FILE, data);
  res.json({ ok: true });
});

// --- User management ---
app.get('/api/users', auth, (req, res) => {
  const data = readData(USER_FILE);
  res.json(data.users.map(u => ({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, createdAt: u.createdAt })));
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const { username, password, fullName, role } = req.body;
  if (!username || !password || !fullName) return res.status(400).json({ error: 'Thiếu thông tin' });
  if (password.length < 4) return res.status(400).json({ error: 'Mật khẩu tối thiểu 4 ký tự' });
  const data = readData(USER_FILE);
  if (data.users.find(u => u.username === username)) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
  const user = { id: uuidv4(), username, password: bcrypt.hashSync(password, 10), fullName, role: role || 'employee', createdAt: new Date().toISOString() };
  data.users.push(user);
  writeData(USER_FILE, data);
  res.status(201).json({ id: user.id, username: user.username, fullName: user.fullName, role: user.role, createdAt: user.createdAt });
});

app.put('/api/users/:id', auth, adminOnly, (req, res) => {
  const data = readData(USER_FILE);
  const idx = data.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const u = data.users[idx];
  if (req.body.fullName !== undefined) u.fullName = req.body.fullName;
  if (req.body.role !== undefined) u.role = req.body.role;
  if (req.body.password) u.password = bcrypt.hashSync(req.body.password, 10);
  if (req.body.username !== undefined && req.body.username !== u.username) {
    if (data.users.find(x => x.username === req.body.username)) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
    u.username = req.body.username;
  }
  writeData(USER_FILE, data);
  res.json({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, createdAt: u.createdAt });
});

app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  if (req.currentUser.id === req.params.id) return res.status(400).json({ error: 'Không thể xoá chính mình' });
  const data = readData(USER_FILE);
  const idx = data.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  data.users.splice(idx, 1);
  writeData(USER_FILE, data);
  res.json({ ok: true });
});

// --- Version ---
app.get('/api/version', (req, res) => {
  if (process.env.APP_VERSION) return res.json({ version: process.env.APP_VERSION });
  try {
    const v = execSync(
      'git describe --tags --abbrev=0 || git rev-parse --short HEAD || echo unknown',
      { cwd: __dirname, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    res.json({ version: v || 'unknown' });
  } catch {
    res.json({ version: 'unknown' });
  }
});

// --- Settings ---
app.get('/api/settings', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  const config = readData(CONFIG_FILE);
  res.json({
    companyName: config.companyName || '',
    scraperKeywords: config.scraperKeywords || [],
    scraperLocations: config.scraperLocations || [],
    scraperMaxBidPrice: config.scraperMaxBidPrice || 2000000000,
    scraperMaxCardsPerKeyword: config.scraperMaxCardsPerKeyword || 5,
    scraperOnlyRutGon: config.scraperOnlyRutGon !== false
  });
});
app.put('/api/settings', auth, adminOnly, (req, res) => {
  const config = readData(CONFIG_FILE);
  if (req.body.companyName !== undefined) config.companyName = req.body.companyName;
  if (req.body.scraperKeywords !== undefined) config.scraperKeywords = req.body.scraperKeywords;
  if (req.body.scraperLocations !== undefined) config.scraperLocations = req.body.scraperLocations;
  if (req.body.scraperMaxBidPrice !== undefined) config.scraperMaxBidPrice = req.body.scraperMaxBidPrice;
  if (req.body.scraperMaxCardsPerKeyword !== undefined) config.scraperMaxCardsPerKeyword = req.body.scraperMaxCardsPerKeyword;
  if (req.body.scraperOnlyRutGon !== undefined) config.scraperOnlyRutGon = req.body.scraperOnlyRutGon;
  writeData(CONFIG_FILE, config);
  res.json({ ok: true });
});

// --- Scraper Config (no auth – called by GitHub Actions) ---
app.get('/api/scraper-config', (req, res) => {
  const config = readData(CONFIG_FILE);
  res.json({
    keywords: config.scraperKeywords || [
      "âm thanh", "hội nghị truyền hình", "phòng họp", "màn hình led",
      "thiết bị hội thảo", "micro", "máy tính", "thiết bị công nghệ thông tin",
      "phần mềm", "máy chủ"
    ],
    locations: config.scraperLocations || [],
    maxBidPrice: config.scraperMaxBidPrice || 2000000000,
    maxCardsPerKeyword: config.scraperMaxCardsPerKeyword || 5,
    onlyRutGon: config.scraperOnlyRutGon !== false
  });
});

// --- Processed/Discarded IDs (no auth – called by GitHub Actions) ---
app.get('/api/processed-ids', (req, res) => {
  const p = path.join(DATA_DIR, 'processed_ids.json');
  if (fs.existsSync(p)) return res.json(readData(p));
  res.json({ ids: [], updatedAt: null });
});
app.get('/api/discarded-ids', (req, res) => {
  const p = path.join(DATA_DIR, 'discarded_ids.json');
  if (fs.existsSync(p)) return res.json(readData(p));
  res.json({ ids: [], updatedAt: null });
});

// --- Project IDs (no auth) ---
app.get('/api/project-ids', (req, res) => {
  const p = path.join(DATA_DIR, 'projects.json');
  if (fs.existsSync(p)) {
    const data = readData(p);
    const ids = data.projects
      .filter(proj => !isRutGonProject(proj))
      .map(proj => ({
        id: proj.id,
        maDauThau: (proj.projectInfo && proj.projectInfo.maDauThau) || null,
      }));
    return res.json({ projects: ids, count: ids.length });
  }
  res.json({ projects: [], count: 0 });
});

// --- Receive Bid Data (no auth – called by GitHub Actions) ---
app.post('/api/receive-bid', (req, res) => {
  const { trello_card_id, bid_no, bid_name, items, projectInfo, scrapedAt } = req.body;
  if (!trello_card_id || !bid_no) {
    return res.status(400).json({ error: 'Thiếu trello_card_id hoặc bid_no' });
  }

  const data = readData(SCRAPED_BIDS_FILE);
  if (!data.entries) data.entries = [];

  const existingIdx = data.entries.findIndex(e =>
    e.trello_card_id === trello_card_id || e.bid_no === bid_no
  );

  const entry = {
    trello_card_id,
    bid_no,
    bid_name: bid_name || '',
    items: items || [],
    projectInfo: projectInfo || {},
    scrapedAt: scrapedAt || new Date().toISOString(),
    receivedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    entry.receivedAt = data.entries[existingIdx].receivedAt;
    data.entries[existingIdx] = entry;
  } else {
    data.entries.push(entry);
  }

  writeData(SCRAPED_BIDS_FILE, data);

  // Auto-link to existing project by maDauThau
  const projData = readData(PROJ_FILE);
  const matchingProj = projData.projects.find(p =>
    p.projectInfo && p.projectInfo.maDauThau === bid_no
  );
  if (matchingProj) {
    matchingProj.trello_card_id = trello_card_id;
    matchingProj.updatedAt = new Date().toISOString();
    writeData(PROJ_FILE, projData);
  } else {
    // Auto-create project with status 'upcoming' if close date hasn't passed
    const closeDate = projectInfo && projectInfo.thoiGianDongThau ? new Date(projectInfo.thoiGianDongThau) : null;
    if (!closeDate || closeDate >= new Date()) {
      const now = new Date().toISOString();
      const defaultItems = items && items.length > 0
        ? items.map((it, idx) => ({
            id: uuidv4(), stt: idx + 1,
            tenHangHoa: it.tenHangHoa || '',
            donViTinh: it.donViTinh || 'Gói',
            soLuong: it.soLuong || 1,
            donGiaNhap: 0, giaNhap: 0, nhaCungCap: '', donGiaChao: 0, trongSo: 1,
            ghiChu: it.ghiChu || '',
            portalKyMaHieu: it.portalKyMaHieu || '',
            portalNhanHieu: it.portalNhanHieu || '',
            portalHangSanXuat: it.portalHangSanXuat || '',
            portalXuatXu: it.portalXuatXu || '',
            portalNamSanXuat: it.portalNamSanXuat || '',
            portalDiaDiemDuAn: it.portalDiaDiemDuAn || '',
            portalNgayGiaoSomNhat: it.portalNgayGiaoSomNhat || '',
            portalNgayGiaoMuonNhat: it.portalNgayGiaoMuonNhat || '',
            portalYeuCauKhac: it.portalYeuCauKhac || ''
          }))
        : [{ id: uuidv4(), stt: 1, tenHangHoa: '', donViTinh: 'Gói', soLuong: 1, donGiaNhap: 0, trongSo: 1, ghiChu: '', nhaCungCap: '' }];

      const newProject = {
        id: uuidv4(),
        name: projectInfo && projectInfo.tenCongTrinh ? projectInfo.tenCongTrinh : (bid_name || bid_no),
        createdAt: now, updatedAt: now,
        status: 'upcoming',
        trello_card_id,
        projectInfo: {
          tenCongTrinh: projectInfo && projectInfo.tenCongTrinh ? projectInfo.tenCongTrinh : (bid_name || ''),
          maDauThau: bid_no,
          benMoiThau: projectInfo && projectInfo.benMoiThau ? projectInfo.benMoiThau : '',
          thoiGianDongThau: projectInfo && projectInfo.thoiGianDongThau ? projectInfo.thoiGianDongThau : '',
          diaDiem: projectInfo && projectInfo.diaDiem ? projectInfo.diaDiem : '',
          giaDuToan: projectInfo && projectInfo.giaDuToan ? projectInfo.giaDuToan : 0
        },
        items: defaultItems,
        params: { tiLeLNG: 30, phiDuThau: 330000, phiBaoHanh: 5, phiBanHang: 2, phiCongTac: 0, hoaHongKD: 12.5, giaDuToan: 0 }
      };
      projData.projects.push(newProject);
      writeData(PROJ_FILE, projData);
    }
  }

  // Cleanup expired upcoming projects
  cleanupExpiredUpcoming();

  res.json({ ok: true });
});

const TRELLO_TARGET_LIST_ID = process.env.TRELLO_LIST_PREPARING || '68d3612e827180de2333db25';

// --- Trello sync helpers ---
function trelloApiUrl(path) {
  const url = new URL('https://api.trello.com/1' + path);
  url.searchParams.set('key', process.env.TRELLO_API_KEY || '');
  url.searchParams.set('token', process.env.TRELLO_TOKEN || '');
  return url.toString();
}

// --- Trello Sync: read cards from "Đang chuẩn bị hồ sơ" and create/update projects ---
app.post('/api/trello/sync', auth, async (req, res) => {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  const listId = process.env.TRELLO_LIST_PREPARING;
  if (!apiKey || !token || !listId) {
    return res.status(400).json({ error: 'Thiếu cấu hình Trello (API key, token, hoặc list ID)' });
  }

  try {
    const listUrl = `https://api.trello.com/1/lists/${listId}/cards?key=${apiKey}&token=${token}&fields=id,name,desc,due`;
    const r = await fetch(listUrl);
    if (!r.ok) return res.status(502).json({ error: 'Trello API error', status: r.status });
    const cards = await r.json();

    const projData = readData(PROJ_FILE);
    const now = new Date().toISOString();
    const result = { synced: 0, created: 0, updated: 0, errors: [] };

    for (const card of cards) {
      try {
        // Extract bid_no from card name: "[IB...] Tên dự án"
        const nameMatch = card.name.match(/\[([^\]]+)\]/);
        const bidNo = nameMatch ? nameMatch[1] : '';

        // Parse description for project info
        const desc = card.desc || '';
        const bidName = card.name.replace(/\[([^\]]+)\]\s*/, '').trim();

        const investRegex = /\*\*Bên mời thầu:\*\*\s*(.+)/i;
        const investMatch = desc.match(investRegex);
        const closeRegex = /\*\*Đóng thầu:\*\*\s*(.+)/i;
        const closeMatch = desc.match(closeRegex);
        const benMoiThau = investMatch ? investMatch[1].replace(/\\n/g, '').trim() : '';
        const thoiGianDongThau = closeMatch ? closeMatch[1].replace(/\\n/g, '').trim() : '';

        // Find existing project by trello_card_id, or by maDauThau if bidNo is available
        let existing = projData.projects.find(p => p.trello_card_id === card.id);
        if (!existing && bidNo) {
          existing = projData.projects.find(p => p.projectInfo && p.projectInfo.maDauThau === bidNo);
        }

        if (existing) {
          // Update project metadata unconditionally
          if (existing.status === 'upcoming') {
            existing.status = 'draft';
          }
          existing.updatedAt = now;
          if (!existing.projectInfo) existing.projectInfo = {};
          // Reset nguoiLap on Trello-synced projects — auto-assigned on first submit
          existing.projectInfo.nguoiLap = '';
          existing.projectInfo.nguoiLapId = '';
          if (benMoiThau) existing.projectInfo.benMoiThau = benMoiThau;
          if (thoiGianDongThau) existing.projectInfo.thoiGianDongThau = thoiGianDongThau;
          if (bidNo) existing.projectInfo.maDauThau = bidNo;
          if (!existing.trello_card_id) existing.trello_card_id = card.id;
          result.updated++;
        } else {
          // Create new project
          const newProject = {
            id: uuidv4(),
            name: bidName || bidNo || 'Dự án từ Trello',
            createdAt: now,
            updatedAt: now,
            status: 'draft',
            trello_card_id: card.id,
            projectInfo: {
              tenCongTrinh: bidName || '',
              maDauThau: bidNo || '',
              benMoiThau: benMoiThau || '',
              thoiGianDongThau: thoiGianDongThau || '',
              nguoiLap: '',
              nguoiLapId: '',
              ngayLap: now.split('T')[0],
              diaDiem: '',
              noiDungTrinh: ''
            },
            items: [{ id: uuidv4(), stt: 1, tenHangHoa: '', donViTinh: 'Gói', soLuong: 1, donGiaNhap: 0, trongSo: 1, ghiChu: '', nhaCungCap: '' }],
            params: { tiLeLNG: 30, phiDuThau: 330000, phiBaoHanh: 5, phiBanHang: 2, phiCongTac: 0, hoaHongKD: 12.5, giaDuToan: 0 }
          };
          projData.projects.push(newProject);
          result.created++;
        }
        result.synced++;
      } catch (cardErr) {
        result.errors.push({ cardId: card.id, error: cardErr.message });
      }
    }

    writeData(PROJ_FILE, projData);
    res.json(result);
  } catch (error) {
    console.error('[trello-sync] Sync error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Trello Butler Webhook (move card → sync project status) ---
app.post('/api/trello/butler-webhook', async (req, res) => {
  const { trello_card_id } = req.body;
  if (!trello_card_id) return res.status(400).json({ error: 'Thiếu trello_card_id' });

  try {
    // Fetch card info from Trello API
    const url = `https://api.trello.com/1/cards/${trello_card_id}?key=${process.env.TRELLO_API_KEY || ''}&token=${process.env.TRELLO_TOKEN || ''}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: 'Trello API error', status: r.status });

    const card = await r.json();
    const listId = card.idList;

    if (listId === TRELLO_TARGET_LIST_ID) {
      // Card moved to "Đang chuẩn bị hồ sơ" → update project
      const projData = readData(PROJ_FILE);
      const project = projData.projects.find(p => p.trello_card_id === trello_card_id);
      if (project && project.status === 'upcoming') {
        project.status = 'draft';
        project.updatedAt = new Date().toISOString();
        if (!project.projectInfo) project.projectInfo = {};
        writeData(PROJ_FILE, projData);
        console.log(`[trello-webhook] Card ${trello_card_id} → project ${project.projectInfo.maDauThau || project.id} status: upcoming → draft`);
        return res.json({ ok: true, projectId: project.id, status: 'draft' });
      }
      return res.json({ ok: true, message: 'No matching upcoming project found' });
    }

    res.json({ ok: true, message: `Card is in list ${listId}, not target ${TRELLO_TARGET_LIST_ID}` });
  } catch (error) {
    console.error('[trello-webhook] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Projects ---
app.get('/api/projects', auth, (req, res) => {
  cleanupExpiredUpcoming();
  const data = readData(PROJ_FILE);
  res.json(data.projects.map(p => ({
    id: p.id, name: (p.projectInfo && p.projectInfo.tenCongTrinh) || p.name || '', createdAt: p.createdAt, updatedAt: p.updatedAt,
    status: p.status || 'draft', approvedBy: p.approvedBy || null, approvedAt: p.approvedAt || null,
    maDauThau: (p.projectInfo && p.projectInfo.maDauThau) || null,
    benMoiThau: (p.projectInfo && p.projectInfo.benMoiThau) || null,
    thoiGianDongThau: (p.projectInfo && p.projectInfo.thoiGianDongThau) || null,
    ketQuaTrungThau: p.ketQuaTrungThau || null,
    giaTrungThau: p.giaTrungThau || null,
    nhaThauTrung: p.nhaThauTrung || null,
    bidPrice: p.bidPrice || null,
    stepCode: p.stepCode || null,
    stepCodeLabel: getStepCodeLabel(p.stepCode),
    xepHang: p.xepHang || extractXepHang(p.items)
  })));
});

app.get('/api/projects/:id', auth, (req, res) => {
  const data = readData(PROJ_FILE);
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json({
    ...project,
    stepCodeLabel: getStepCodeLabel(project.stepCode),
    xepHang: project.xepHang || extractXepHang(project.items)
  });
});

function getDefaultHoaHongKD(thoiGianDongThau) {
  if (!thoiGianDongThau || thoiGianDongThau >= '2026-04-01') return 12.5;
  return 10;
}

app.post('/api/projects', auth, (req, res) => {
  const data = readData(PROJ_FILE);
  const maDauThau = req.body.projectInfo && req.body.projectInfo.maDauThau ? req.body.projectInfo.maDauThau.trim() : '';
  if (maDauThau && data.projects.some(p => p.projectInfo && p.projectInfo.maDauThau === maDauThau))
    return res.status(400).json({ error: 'Mã đấu thầu đã tồn tại' });
  const now = new Date().toISOString();
  const project = {
    id: uuidv4(),
    name: req.body.name || 'Dự án mới',
    createdAt: now, updatedAt: now,
    status: 'draft',
    projectInfo: req.body.projectInfo || {
      tenCongTrinh: req.body.name || '', maDauThau: '', benMoiThau: '', noiDungTrinh: '',
      diaDiem: '', nguoiPhuTrach: '',
      nguoiLap: req.currentUser.fullName,
      nguoiLapId: req.currentUser.id,
      ngayLap: new Date().toISOString().split('T')[0],
      thoiGianDongThau: ''
    },
    items: [{ id: uuidv4(), stt: 1, tenHangHoa: '', donViTinh: 'Gói', soLuong: 1, donGiaNhap: 0, trongSo: 1, ghiChu: '', nhaCungCap: '' }],
    params: { tiLeLNG: 30, phiDuThau: 330000, phiBaoHanh: 5, phiBanHang: 2, phiCongTac: 0, hoaHongKD: getDefaultHoaHongKD(req.body.projectInfo && req.body.projectInfo.thoiGianDongThau), giaDuToan: 0 }
  };
  data.projects.push(project);
  writeData(PROJ_FILE, data);
  res.status(201).json(project);
});

app.put('/api/projects/:id', auth, (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const maDauThau = req.body.projectInfo && req.body.projectInfo.maDauThau ? req.body.projectInfo.maDauThau.trim() : '';
  if (maDauThau && data.projects.some((p, i) => i !== idx && p.projectInfo && p.projectInfo.maDauThau === maDauThau))
    return res.status(400).json({ error: 'Mã đấu thầu đã tồn tại' });
  const project = data.projects[idx];
  const updated = { ...project, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  // Transition upcoming to draft on first human interaction
  if (project.status === 'upcoming' && updated.status === 'upcoming') {
    updated.status = 'draft';
  }
  // Luôn cập nhật người lập đề xuất = người sửa lần cuối
  if (!updated.projectInfo) updated.projectInfo = {};
  updated.projectInfo.nguoiLap = req.currentUser.fullName;
  updated.projectInfo.nguoiLapId = req.currentUser.id;
  if (!updated.projectInfo.ngayLap) {
    updated.projectInfo.ngayLap = new Date().toISOString().split('T')[0];
  }
  data.projects[idx] = updated;
  writeData(PROJ_FILE, data);
  if (updated.items) syncSuppliersFromItems(updated.items);
  res.json(data.projects[idx]);
  trelloSync.syncProjectToTrello(data.projects[idx]).catch(() => {});
});

app.patch('/api/projects/:id/submit', auth, (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const project = data.projects[idx];
  if (project.status !== 'draft' && project.status !== 'rejected')
    return res.status(400).json({ error: 'Chỉ trình duyệt dự án ở trạng thái dự thảo hoặc không duyệt' });
  project.status = 'pending';
  project.updatedAt = new Date().toISOString();
  writeData(PROJ_FILE, data);
  res.json(project);
});

app.patch('/api/projects/:id/approve', auth, adminOnly, (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const project = data.projects[idx];
  if (project.status === 'approved') return res.status(400).json({ error: 'Dự án đã được duyệt' });
  const now = new Date().toISOString();
  project.status = 'approved';
  project.approvedBy = req.currentUser.fullName;
  project.approvedById = req.currentUser.id;
  project.approvedAt = now;
  project.updatedAt = now;
  if (!project.projectInfo) project.projectInfo = {};
  project.projectInfo.nguoiDuyet = req.currentUser.fullName;
  project.projectInfo.ngayDuyet = now.split('T')[0];
  writeData(PROJ_FILE, data);
  res.json(project);
  trelloSync.syncProjectToTrello(project).catch(() => {});
});

app.patch('/api/projects/:id/reject', auth, adminOnly, (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const project = data.projects[idx];
  if (project.status !== 'pending') return res.status(400).json({ error: 'Chỉ từ chối dự án đang chờ duyệt' });
  project.status = 'rejected';
  project.updatedAt = new Date().toISOString();
  writeData(PROJ_FILE, data);
  res.json(project);
  trelloSync.syncProjectToTrello(project).catch(() => {});
});

app.patch('/api/projects/:id/unapprove', auth, adminOnly, (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const project = data.projects[idx];
  if (project.status !== 'approved') return res.status(400).json({ error: 'Dự án chưa được duyệt' });
  project.status = 'rejected';
  delete project.approvedBy;
  delete project.approvedById;
  delete project.approvedAt;
  if (project.projectInfo) {
    delete project.projectInfo.nguoiDuyet;
    delete project.projectInfo.ngayDuyet;
  }
  project.updatedAt = new Date().toISOString();
  writeData(PROJ_FILE, data);
  res.json(project);
  trelloSync.syncProjectToTrello(project).catch(() => {});
});

app.delete('/api/projects/:id', auth, (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const project = data.projects[idx];
  if (req.currentUser.role !== 'admin') {
    const isOwner = (project.projectInfo && project.projectInfo.nguoiLapId === req.currentUser.id)
      || (project.projectInfo && project.projectInfo.nguoiLap === req.currentUser.fullName);
    if (!isOwner) return res.status(403).json({ error: 'Chỉ xoá được dự án do mình tạo' });
    if (project.status !== 'draft' && project.status !== 'rejected')
      return res.status(403).json({ error: 'Chỉ xoá được dự án ở trạng thái dự thảo' });
  }
  data.projects.splice(idx, 1);
  writeData(PROJ_FILE, data);
  res.json({ ok: true });
});

// --- Bid Result ---
app.patch('/api/projects/:id/bid-result', auth, adminOnly, (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const project = data.projects[idx];
  const { ketQuaTrungThau, giaTrungThau, nhaThauTrung } = req.body;
  if (ketQuaTrungThau !== undefined) {
    if (!['win', 'lose', null].includes(ketQuaTrungThau)) return res.status(400).json({ error: 'ketQuaTrungThau phải là "win", "lose" hoặc null' });
    project.ketQuaTrungThau = ketQuaTrungThau || null;
  }
  if (giaTrungThau !== undefined) project.giaTrungThau = giaTrungThau || null;
  if (nhaThauTrung !== undefined) project.nhaThauTrung = nhaThauTrung || null;
  project.updatedAt = new Date().toISOString();
  writeData(PROJ_FILE, data);
  res.json(project);
  trelloSync.syncProjectToTrello(project).catch(() => {});
});

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

// Recursively search for contractor lists (biên bản mở thầu, etc.)
function extractContractorList(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return null;

  // Direct array of contractors
  if (Array.isArray(obj)) {
    const items = obj.filter(i => i && typeof i === 'object' && i.contractorName);
    if (items.length > 0) {
      return items.map(i => ({
        contractorName: i.contractorName || i.winningBidder || i.winnerName || '',
        price: i.giaTrungThau || i.winningPrice || i.price || i.reofferPrice || null,
        isWinner: !!(i.isWinner || i.result === 'win' || i.giaTrungThau)
      }));
    }
  }

  // Search object properties
  const keys = Object.keys(obj);
  // Check common bid result field names first
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (lower.includes('contractor') || lower.includes('bidder') || lower.includes('nha thau') || lower.includes('nha_thau') || lower.includes('bidopen') || lower.includes('bidresult')) {
      const result = extractContractorList(obj[key], depth + 1);
      if (result) return result;
    }
  }
  // Then check all properties
  for (const key of keys) {
    const result = extractContractorList(obj[key], depth + 1);
    if (result) return result;
  }
  return null;
}

// --- Fetch Bidding Info by IB Code ---
app.get('/api/fetch-bidding-info/:ibCode', auth, async (req, res) => {
  const ibCode = req.params.ibCode.trim();
  if (!ibCode) return res.status(400).json({ error: 'Mã IB không hợp lệ' });

  // Local-first: check scraped-bids.json before hitting the portal
  try {
    const scrapedData = readData(SCRAPED_BIDS_FILE);
    const localEntry = scrapedData.entries && scrapedData.entries.find(e => e.bid_no === ibCode);
    if (localEntry) {
      const info = localEntry.projectInfo || {};
      return res.json({
        tenCongTrinh: info.tenCongTrinh || localEntry.bid_name || '',
        benMoiThau: info.benMoiThau || '',
        thoiGianDongThau: info.thoiGianDongThau || '',
        giaDuToan: info.giaDuToan || null,
        diaDiem: info.diaDiem || '',
        bidNo: ibCode,
        items: localEntry.items || [],
        itemsStatus: localEntry.items && localEntry.items.length > 0 ? 'fetched' : 'not-found',
        source: 'scraper',
        trello_card_id: localEntry.trello_card_id
      });
    }
  } catch (e) { /* ignore local check errors, fall through to portal */ }

  if (activeFetches >= MAX_FETCHES) return res.status(429).json({ error: 'Hệ thống đang xử lý yêu cầu khác. Vui lòng thử lại sau 30 giây.' });

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  let browser;
  try {
    activeFetches++;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: UA });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

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
          if (match) {
            responseData = match;
          }
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

    if (!responseData) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin cho mã IB: ' + ibCode });
    }

    const bidForm = extractValue(responseData.bidForm);
    const processApply = extractValue(responseData.processApply);
    const isRutGon = bidForm === 'CGTTRG' || bidForm === 'CHTRG' || (bidForm && (bidForm.toLowerCase().includes('rút gọn') || bidForm.toLowerCase().includes('rut gon')));
    const bidFormLabels = { 'CGTTRG': 'Chào hàng cạnh tranh rút gọn', 'CHTRG': 'Chào hàng cạnh tranh rút gọn', 'DTRR': 'Đấu thầu rộng rãi', 'DTHC': 'Đấu thầu hạn chế', 'DTTH': 'Đấu thầu thường', 'CHTH': 'Chào hàng cạnh tranh thường', 'MSTT': 'Mua sắm trực tiếp', 'CDH': 'Chỉ định thầu' };
    const bidFormLabel = bidFormLabels[bidForm] || ('Hình thức: ' + bidForm);
    const result = {
      tenCongTrinh: extractValue(responseData.bidName),
      benMoiThau: extractValue(responseData.investorName),
      thoiGianDongThau: extractValue(responseData.bidCloseDate),
      giaDuToan: extractPrice(responseData.bidPrice || responseData.bidEstimatePrice || responseData.planItemPrice),
      bidNo: extractValue(responseData.notifyNo || responseData.bidNo) || ibCode,
      diaDiem: '',
      giaTrungThau: extractPrice(responseData.bidWinningPrice),
      nhaThauTrung: extractValue(responseData.contractorName),
      bidForm,
      bidFormLabel,
      hinhThucLCNT: 'Hình thức LCNT: ' + bidFormLabel,
      processApply,
      isRutGon
    };

    // Step 2: Fetch detail page for location and construction time
    let items = [];
    const tbmtId = extractValue(responseData.id);
    if (tbmtId) {
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
        // Pass through all available fields from search result
        const passThroughParams = ['notifyNo','bidNo','stepCode','processApply','bidMode','planNo','bidForm','bidOpenId','inputResultId','bidPreOpenId','techReqId','bidPreNotifyResultId','pno','caseKHKQ','isInternet'];
        for (const param of passThroughParams) {
          const val = responseData[param];
          if (val != null && val !== '' && String(val) !== 'undefined') {
            qs.set(param, String(val));
          }
        }
        const detailUrl = 'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?' + qs.toString();

        let detailData = null;
        const detailHandler = async (r) => {
          try {
            if (detailData) return;
            const ct = (r.headers()['content-type'] || '').toLowerCase();
            if (r.status() === 200 && r.url().includes('lcnt_tbmt_ttc_ldt') && ct.includes('application/json')) {
              detailData = await r.json();
            }
          } catch {}
        };
        page.on('response', detailHandler);

        await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(3000);
        page.removeListener('response', detailHandler);

        // Only parse items table for rút gọn packages (CGTTRG)
        if (isRutGon) {
        try {
          items = await page.evaluate(() => {
            // Find all table-expand tables
            const allTables = document.querySelectorAll('table.table-expand');
            // Look for the one inside card-body.item-table (Mẫu 02A)
            for (const t of allTables) {
              const wrapper = t.closest('.card-body.item-table, .item-table');
              if (wrapper) {
                const rows = t.querySelectorAll('tbody tr');
                return Array.from(rows).map((row) => {
                  const cells = row.querySelectorAll('td');
                  if (cells.length < 4) return null;
                  const clean = (cell) => (cell?.textContent || '').trim();
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
            }
            // Fallback: any table-expand with enough columns
            for (const t of allTables) {
              const cells = t.querySelectorAll('thead th, thead td');
              const headerTexts = Array.from(cells).map(c => (c.textContent || '').trim());
              const hasItemHeader = headerTexts.some(h => h.includes('Danh mục hàng hóa') || h.includes('Đơn vị tính') || h.includes('Khối lượng'));
              if (hasItemHeader || cells.length >= 10) {
                const rows = t.querySelectorAll('tbody tr');
                return Array.from(rows).map((row) => {
                  const cells = row.querySelectorAll('td');
                  if (cells.length < 4) return null;
                  const clean = (cell) => (cell?.textContent || '').trim();
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
            }
            return [];
          });
          console.log('[fetch-bidding-info] detailUrl:', detailUrl);
          console.log('[fetch-bidding-info] items found:', items.length);
        } catch (e) {
          console.error('[fetch-bidding-info] items parse error:', e.message);
          items = [];
        }
        } // end if (isRutGon)

        if (detailData) {
          // Extract địa điểm from bidpBidLocationList
          if (detailData.bidpBidLocationList?.length > 0) {
            const loc = detailData.bidpBidLocationList[0];
            const parts = [];
            if (loc.wardName) parts.push(loc.wardName);
            if (loc.districtName) parts.push(loc.districtName);
            if (loc.provName) parts.push(loc.provName);
            result.diaDiem = parts.join(', ');
          }
          // Extract giá dự toán from detailData if not already set from search result
          if (!result.giaDuToan) {
            const dataObj = detailData.data || detailData;
            const planDetail = dataObj.bidpPlanDetail;
            if (planDetail) {
              const price = planDetail.bidPrice || planDetail.bidEstimatePrice || planDetail.planItemPrice || planDetail.price || planDetail.totalPrice || planDetail.planPrice || planDetail.sumPrice || planDetail.estimatedPrice || planDetail.amount || planDetail.totalPlanPrice || planDetail.projectPrice || planDetail.bidPlanPrice;
              if (price != null) {
                result.giaDuToan = extractPrice(price);
              }
            }
          }
        }

        // Fallback: extract địa điểm từ search result (cho gói rút gọn)
        if (!result.diaDiem && responseData.locations?.length > 0) {
          const loc = responseData.locations[0];
          const parts = [];
          if (loc.wardName) parts.push(loc.wardName);
          if (loc.districtName) parts.push(loc.districtName);
          if (loc.provName) parts.push(loc.provName);
          result.diaDiem = parts.join(', ');
        }
      } catch (e) {
        // Detail fetch failed — still return search result data
      }
    }

    // Fallback: extract giá dự toán from page HTML if JSON APIs didn't have it
    if (!result.giaDuToan && items.length > 0 && isRutGon) {
      try {
        const priceFromPage = await page.evaluate(() => {
          const pricePatterns = ['Giá gói thầu', 'Giá dự toán', 'Giá kế hoạch', 'Giá KHLCNT', 'Giá ước tính', 'Tổng giá', 'Tổng dự toán', 'Giá TBMT', 'Giá thông báo', 'Giá gói thầu (VND)'];
          const text = document.body.innerText;
          for (const pattern of pricePatterns) {
            const regex = new RegExp(pattern + '\\s*[:\\s]*\\s*([\\d.,]+)', 'i');
            const match = text.match(regex);
            if (match) {
              const cleaned = match[1].replace(/,/g, '');
              const num = parseFloat(cleaned);
              if (!isNaN(num) && num > 10000) return num;
            }
          }
          const spans = document.querySelectorAll('.detail-view span, .tbmt-info span, .info-row span, .content-row span');
          for (const span of spans) {
            const t = (span.textContent || '').trim();
            for (const pattern of pricePatterns) {
              if (t.includes(pattern)) {
                const parent = span.closest('div, tr, .row');
                if (parent) {
                  const text2 = parent.textContent || '';
                  const m = text2.match(/([\d.,]+)\s*(VND|₫|đồng)?/);
                  if (m) {
                    const cleaned = m[1].replace(/,/g, '');
                    const num = parseFloat(cleaned);
                    if (!isNaN(num) && num > 10000) return num;
                  }
                }
              }
            }
          }
          return null;
        });
        if (priceFromPage) {
          result.giaDuToan = Math.round(priceFromPage);
        }
      } catch (e) { /* ignore html price extraction errors */ }
    }

    result.items = items;
    if (isRutGon) {
      result.itemsStatus = items.length > 0 ? 'fetched' : 'not-found';
    } else {
      result.itemsStatus = 'not-rut-gon';
    }
    result.source = 'portal';
    // Attach trello_card_id if project has one linked
    const projData = readData(PROJ_FILE);
    const linkedProj = projData.projects.find(p => p.projectInfo && p.projectInfo.maDauThau === ibCode);
    if (linkedProj && linkedProj.trello_card_id) {
      result.trello_card_id = linkedProj.trello_card_id;
    }
    return res.json(result);
  } catch (error) {
    console.error('Fetch IB error:', error);
    return res.status(500).json({ error: 'Lỗi kết nối đến trang đấu thầu: ' + error.message });
  } finally {
    activeFetches--;
    if (browser) await browser.close();
  }
});

// --- Fetch Bid Result by IB Code ---
app.get('/api/fetch-bid-result/:ibCode', auth, async (req, res) => {
  const ibCode = req.params.ibCode.trim();
  if (!ibCode) return res.status(400).json({ error: 'Mã IB không hợp lệ' });
  if (activeFetches >= MAX_FETCHES) return res.status(429).json({ error: 'Hệ thống đang xử lý yêu cầu khác. Vui lòng thử lại sau 30 giây.' });

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  let browser;
  try {
    activeFetches++;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: UA });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    await page.goto(
      'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=index',
      { waitUntil: 'networkidle', timeout: 30000 }
    );
    await page.waitForTimeout(1500);
    await page.fill('input[name="keyword"]', ibCode);

    let searchResult = null;
    const searchHandler = async (r) => {
      try {
        if (searchResult) return;
        const ct = (r.headers()['content-type'] || '').toLowerCase();
        if (r.status() === 200 && r.url().includes('contractor-selection') && ct.includes('application/json')) {
          const json = await r.json();
          const items = (json.page && json.page.content) || json.data || [];
          const match = items.find(i => (i.notifyNo || i.bidNo) === ibCode);
          if (match) searchResult = match;
        }
      } catch {}
    };
    page.on('response', searchHandler);
    await page.keyboard.press('Enter');

    for (let i = 0; i < 25; i++) {
      if (searchResult) break;
      await page.waitForTimeout(1000);
    }
    page.removeListener('response', searchHandler);

    if (!searchResult) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin cho mã IB: ' + ibCode });
    }

    // Extract project info from search result
    const searchProjInfo = {
      tenCongTrinh: extractValue(searchResult.bidName),
      benMoiThau: extractValue(searchResult.investorName),
      thoiGianDongThau: extractValue(searchResult.bidCloseDate),
      diaDiem: '',
    };
    // Try to get location from search result
    if (searchResult.locations?.length > 0) {
      const loc = searchResult.locations[0];
      const parts = [];
      if (loc.wardName) parts.push(loc.wardName);
      if (loc.districtName) parts.push(loc.districtName);
      if (loc.provName) parts.push(loc.provName);
      searchProjInfo.diaDiem = parts.join(', ');
    }

    // Common response data
    const bidPrice = extractPrice(searchResult.bidPrice || searchResult.bidEstimatePrice || searchResult.planItemPrice);

    // Collect search result bid data (use as fallback if detail page fails)
    let searchResultData = null;
    if (searchResult.bidWinningPrice && Array.isArray(searchResult.bidWinningPrice) && searchResult.bidWinningPrice.length > 0) {
      searchResultData = {
        giaTrungThau: extractPrice(searchResult.bidWinningPrice),
        nhaThauTrung: extractValue(searchResult.contractorName),
        stepCode: extractValue(searchResult.stepCode)
      };
    }

    const tbmtId = String(searchResult.id || searchResult.notifyId || '');
    if (!tbmtId) {
      return res.status(404).json({ error: 'Không tìm thấy mã thông tin thầu' });
    }

    // Build detail URL — include ALL parameters from searchResult
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
    // Pass through ALL available fields from searchResult
    const passThroughParams = ['notifyNo','bidNo','stepCode','processApply','bidMode','planNo','bidForm','bidOpenId','inputResultId','bidPreOpenId','techReqId','bidPreNotifyResultId','pno','caseKHKQ','isInternet'];
    for (const param of passThroughParams) {
      const val = searchResult[param];
      if (val != null && val !== '' && String(val) !== 'undefined') {
        qs.set(param, String(val));
      }
    }
    const detailUrl = 'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?' + qs.toString();

    let detailData = null;
    let bidOnlineData = null;
    let bidOpenData = null;
    const captureResponse = async (r) => {
      try {
        const ct = (r.headers()['content-type'] || '').toLowerCase();
        if (r.status() !== 200) return;
        const url = r.url();
        if (!ct.includes('application/json')) return;
        const json = await r.json();
        if (!detailData && url.includes('lcnt_tbmt_ttc_ldt')) {
          detailData = json;
        }
        // Capture bid online data (contains reofferPrice for online bidding results)
        if (!bidOnlineData && url.includes('bidonline/get')) {
          const jstr = JSON.stringify(json);
          if (jstr.length > 200) bidOnlineData = json;
        }
        // Capture any large JSON response that might contain price data
        if (JSON.stringify(json).length > 1000 && !bidOpenData) {
          const jstr = JSON.stringify(json).toLowerCase();
          if ((jstr.includes('"price"') || jstr.includes('gia') || jstr.includes('bidder') || jstr.includes('contractor')) &&
              (jstr.includes('"name"') || jstr.includes('ten') || jstr.includes('bidder') || jstr.includes('contractor'))) {
            bidOpenData = json;
          }
        }
        // Capture all JSON responses that contain potential bidder data
        if (!bidOpenData && JSON.stringify(json).length > 500) {
          const jstr = JSON.stringify(json).toLowerCase();
          if (jstr.includes('bidopen') || jstr.includes('contractor') || jstr.includes('bidder') || jstr.includes('nhà thầu') || jstr.includes('giá dự thầu') || jstr.includes('reofferprice') || jstr.includes('bidresult')) {
            bidOpenData = json;
          }
        }
      } catch {}
    };
    page.on('response', captureResponse);
    await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Extract inputResultId / bidOpenId from page HTML via JS evaluation
    try {
      const ids = await page.evaluate(() => {
        const html = document.body.innerHTML;
        const inputMatch = html.match(/inputResultId[=:]["']?([a-f0-9-]{36})["']?/i);
        const bidOpenMatch = html.match(/bidOpenId[=:]["']?([a-f0-9-]{36})["']?/i);
        // Also check script variables
        const scriptTags = document.querySelectorAll('script');
        let inputId = inputMatch ? inputMatch[1] : null;
        let bidOpenId = bidOpenMatch ? bidOpenMatch[1] : null;
        for (const script of scriptTags) {
          const text = script.textContent || '';
          if (!inputId) {
            const m = text.match(/inputResultId['"]?\s*[:=]\s*['"]([a-f0-9-]{36})['"]/i);
            if (m) inputId = m[1];
          }
          if (!bidOpenId) {
            const m = text.match(/bidOpenId['"]?\s*[:=]\s*['"]([a-f0-9-]{36})['"]/i);
            if (m) bidOpenId = m[1];
          }
        }
        return { inputResultId: inputId, bidOpenId: bidOpenId };
      });
      if (ids.inputResultId || ids.bidOpenId) {
        if (ids.inputResultId) qs.set('inputResultId', ids.inputResultId);
        if (ids.bidOpenId) qs.set('bidOpenId', ids.bidOpenId);
        // Reset captured data before re-navigation
        detailData = null;
        bidOnlineData = null;
        bidOpenData = null;
        const newUrl = 'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?' + qs.toString();
        await page.goto(newUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        // Try clicking Mở thầu tab after re-navigation
        try {
          const tabEls = await page.locator('*').elementHandles();
          for (const el of tabEls) {
            const t = await el.textContent().catch(() => '').then(x => (x || '').toLowerCase().trim());
            if (t.includes('mở thầu') || t.includes('biên bản') || t == 'bid open') {
              await el.click().catch(() => {});
              await page.waitForTimeout(2000);
              break;
            }
          }
        } catch (e) {}
      }
    } catch (e) { /* ignore ID extraction errors */ }

    // Find and click the bid opening tab (by href = #bidOpeningMinutes)
    // Keep captureResponse active to catch XHR responses triggered by tab click
    try {
      const tabLink = await page.locator('[href="#bidOpeningMinutes"], [data-target="#bidOpeningMinutes"], a[href*="bidOpen"], [data-target*="bidOpen"]');
      if (await tabLink.count() > 0) {
        await tabLink.first().click({ force: true });
        await page.waitForTimeout(3000);
      } else {
        // Fallback: try by text content
        await page.evaluate(() => {
          const els = document.querySelectorAll('a, button, li, span, div[role="tab"]');
          for (const el of els) {
            const t = (el.textContent || '').toLowerCase().trim();
            if (t.includes('mở thầu') || t.includes('biên bản')) {
              el.click();
              return;
            }
          }
        });
        await page.waitForTimeout(3000);
      }
    } catch (e) { /* ignore tab activation */ }

    page.removeListener('response', captureResponse);

    // Collect from all sources before returning (to maximize data)
    let allContractors = [];
    let foundData = null;
    let source = '';

    // Helper to collect contractor list from any array
    const collectContractors = (list) => {
      if (!list || !list.length) return;
      for (const c of list) {
        if (c.contractorName || c.winningBidder || c.winnerName) {
          allContractors.push({
            contractorName: c.contractorName || c.winningBidder || c.winnerName || '',
            price: c.giaTrungThau || c.winningPrice || c.price || c.reofferPrice || null,
            isWinner: !!(c.isWinner || c.result === 'win')
          });
        }
      }
    };

    if (detailData) {
      // Check bidoPreNotifyContractorResult (thông báo kết quả)
      if (detailData.bidoPreNotifyContractorResult) {
        const r = detailData.bidoPreNotifyContractorResult;
        const p = r.giaTrungThau || r.winningPrice || r.resultPrice || r.price || null;
        if (p && !foundData) {
          foundData = { giaTrungThau: p, nhaThauTrung: r.contractorName || r.winningBidder || r.winnerName || '' };
          source = 'bidoPreNotifyContractorResult';
        }
        // Also collect from bidoPreNotifyContractorResult if it has contractor list
        if (r.bidContractorResultList || r.contractorResultList) {
          collectContractors(r.bidContractorResultList || r.contractorResultList);
        }
      }
      // Check bidoInvBiddingDTO.bidContractorResultList (danh sách nhà thầu)
      if (detailData.bidoInvBiddingDTO && detailData.bidoInvBiddingDTO.bidContractorResultList) {
        const list = detailData.bidoInvBiddingDTO.bidContractorResultList;
        collectContractors(list);
        if (!foundData) {
          const w = list.find(c => c.isWinner || c.result === 'win' || c.giaTrungThau) || list[0];
          const p = w && (w.giaTrungThau || w.winningPrice || w.price);
          if (p) {
            foundData = { giaTrungThau: p, nhaThauTrung: w.contractorName || w.winningBidder || '' };
            source = 'bidoInvBiddingDTO';
          }
        }
      }
    }

    // Extract from bid online data (online bidding re-offer results)
    if (bidOnlineData && !foundData) {
      const bodyStr = JSON.stringify(bidOnlineData);
      const priceMatch = bodyStr.match(/"reofferPrice"\s*:\s*(\d+)/i)
                     || bodyStr.match(/"price"\s*:\s*(\d{6,10})/i)
                     || bodyStr.match(/"giaTrungThau"\s*:\s*(\d+)/i);
      const nameMatch = bodyStr.match(/"contractorName"\s*:\s*"([^"]+)"/i);
      if (priceMatch) {
        const price = parseInt(priceMatch[1]);
        if (price > 100000 && price < 9999999999 && price !== 434639350) {
          foundData = { giaTrungThau: price, nhaThauTrung: nameMatch ? nameMatch[1] : '' };
          source = 'bidOnline';
        }
      }
    }

    // Try to extract contractor list from all remaining data sources
    for (const data of [bidOpenData, detailData]) {
      if (!data) continue;
      const contractors = extractContractorList(data);
      if (contractors && contractors.length > 0) {
        // Merge with existing contractors (avoid duplicates)
        const existingNames = new Set(allContractors.map(c => c.contractorName));
        for (const c of contractors) {
          if (!existingNames.has(c.contractorName)) {
            allContractors.push(c);
            existingNames.add(c.contractorName);
          }
        }
        if (!foundData) {
          const w = contractors.find(c => c.isWinner || c.result === 'win') || contractors[0];
          if (w && w.price) {
            foundData = { giaTrungThau: w.price, nhaThauTrung: w.contractorName || '' };
            source = 'bidOpenData';
          }
        }
      }
    }

    // Fallback: parse HTML from #bidOpeningMinutes contractor table
    // (the bid opening minutes tab renders contractor list as server-side HTML, not JSON)
    if (allContractors.length === 0) {
      try {
        const htmlContractors = await page.evaluate(() => {
          const result = [];
          const openingDiv = document.querySelector('#bidOpeningMinutes');
          if (!openingDiv) return result;
          const rows = openingDiv.querySelectorAll('table tbody tr');
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              const name = (cells[1]?.textContent || '').trim();
              const priceText = (cells[2]?.textContent || '').trim().replace(/\./g, '');
              const price = parseInt(priceText, 10);
              if (name && !isNaN(price) && price > 0) {
                result.push({ contractorName: name, price: price });
              }
            }
          });
          return result;
        });
        if (htmlContractors.length > 0) {
          const existingNames = new Set(allContractors.map(c => c.contractorName));
          for (const c of htmlContractors) {
            if (!existingNames.has(c.contractorName)) {
              allContractors.push(c);
              existingNames.add(c.contractorName);
            }
          }
          if (!foundData) {
            const w = htmlContractors[0];
            if (w && w.price) {
              foundData = { giaTrungThau: w.price, nhaThauTrung: w.contractorName || '' };
              source = 'htmlFallback';
            }
          }
        }
      } catch (e) { /* ignore HTML parsing errors */ }
    }

    if (foundData && foundData.giaTrungThau) {
      return res.json({
        bidPrice,
        giaTrungThau: foundData.giaTrungThau,
        nhaThauTrung: foundData.nhaThauTrung || '',
        contractorResultList: allContractors.length > 0 ? allContractors : undefined,
        found: true,
        source,
        projectInfo: searchProjInfo
      });
    }

    // Fallback to search result data if detail page had no contractor list
    if (searchResultData) {
      return res.json({ bidPrice, giaTrungThau: searchResultData.giaTrungThau, nhaThauTrung: searchResultData.nhaThauTrung || '', contractorResultList: allContractors.length > 0 ? allContractors : undefined, found: true, source: 'searchResult', projectInfo: searchProjInfo });
    }

    return res.json({ bidPrice, giaTrungThau: null, nhaThauTrung: null, found: false, error: 'Chưa có kết quả thầu công bố trên cổng thông tin', projectInfo: searchProjInfo });
  } catch (error) {
    console.error('Fetch bid result error:', error);
    return res.status(500).json({ error: 'Lỗi kết nối đến trang đấu thầu: ' + error.message });
  } finally {
    activeFetches--;
    if (browser) await browser.close();
  }
});

// --- Auto-fetch bid result for a project ---
app.post('/api/projects/:id/fetch-bid-result', auth, adminOnly, async (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy dự án' });
  const project = data.projects[idx];
  const ibCode = project.projectInfo?.maDauThau;
  if (!ibCode) return res.status(400).json({ error: 'Dự án chưa có mã đấu thầu (IB)' });

  try {
    const fetchRes = await fetch(`http://localhost:${PORT}/api/fetch-bid-result/${encodeURIComponent(ibCode)}`, {
      headers: { 'Cookie': req.headers.cookie || '' }
    });
    const result = await fetchRes.json();

    if (result.found && result.giaTrungThau) {
      project.giaTrungThau = result.giaTrungThau;
      project.nhaThauTrung = result.nhaThauTrung || null;
      if (result.bidPrice != null) project.bidPrice = result.bidPrice;
      if (result.stepCode) project.stepCode = result.stepCode;
      project.bidResultFetchedAt = new Date().toISOString();
      project.bidResultFetchError = null;
      // Update project info from portal search result
      if (result.projectInfo) {
        if (!project.projectInfo) project.projectInfo = {};
        if (result.projectInfo.tenCongTrinh) {
          project.projectInfo.tenCongTrinh = result.projectInfo.tenCongTrinh;
          project.name = result.projectInfo.tenCongTrinh;
        }
        if (result.projectInfo.benMoiThau) project.projectInfo.benMoiThau = result.projectInfo.benMoiThau;
        if (result.projectInfo.thoiGianDongThau) project.projectInfo.thoiGianDongThau = result.projectInfo.thoiGianDongThau;
        if (result.projectInfo.diaDiem) project.projectInfo.diaDiem = result.projectInfo.diaDiem;
        project.projectInfo.portalFetchedAt = new Date().toISOString();
      }
      // Auto-detect win/lose by comparing winning contractor with company name from config
      if (result.nhaThauTrung && project.ketQuaTrungThau == null) {
        const cfg = readData(CONFIG_FILE);
        const companyNorm = normalizeSupplierName(cfg.companyName || '');
        if (companyNorm) {
          const winnerNorm = normalizeSupplierName(result.nhaThauTrung);
          project.ketQuaTrungThau = (winnerNorm && (winnerNorm === companyNorm || winnerNorm.includes(companyNorm) || companyNorm.includes(winnerNorm))) ? 'win' : 'lose';
        }
      }
      // Extract company's bid price from contractor list (portal ranking data)
      if (result.contractorResultList && Array.isArray(result.contractorResultList)) {
        const cfg = readData(CONFIG_FILE);
        const companyNorm = normalizeSupplierName(cfg.companyName || '');
        if (companyNorm) {
          const ourEntry = result.contractorResultList.find(c => {
            const nameNorm = normalizeSupplierName(c.contractorName || '');
            return nameNorm && (nameNorm === companyNorm || nameNorm.includes(companyNorm) || companyNorm.includes(nameNorm));
          });
          if (ourEntry) {
            if (ourEntry.price != null) {
              project.giaChaoCongTy = ourEntry.price;
              project.giaChaoCongTyPortal = true;
            }
          }
        }
      }
    } else {
      project.bidResultFetchedAt = new Date().toISOString();
      project.bidResultFetchError = result.error || 'Không tìm thấy kết quả thầu';
    }
    project.updatedAt = new Date().toISOString();
    writeData(PROJ_FILE, data);
    trelloSync.syncProjectToTrello(project).catch(() => {});
    return res.json(project);
  } catch (error) {
    project.bidResultFetchedAt = new Date().toISOString();
    project.bidResultFetchError = 'Lỗi kết nối: ' + error.message;
    project.updatedAt = new Date().toISOString();
    writeData(PROJ_FILE, data);
    return res.status(500).json({ error: project.bidResultFetchError });
  }
});

// --- TBMT helpers ---
function cleanupTbmtPath(tbmtCode) {
  // Xóa file/directory cũ (có thể từ Docker chạy với quyền root) trước khi ghi mới
  const zipPath = path.join(TBMT_DIR, `${tbmtCode}.zip`);
  const extDir = path.join(TBMT_DIR, tbmtCode);
  try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch (e) { console.warn(`[tbmt] cleanup: cannot delete ${zipPath} — ${e.message}`); }
  try { if (fs.existsSync(extDir)) fs.rmSync(extDir, { recursive: true, force: true }); } catch (e) { console.warn(`[tbmt] cleanup: cannot delete ${extDir} — ${e.message}`); }
}

const AdmZip = require('adm-zip');

function extractZip(zipPath, extDir) {
  // Giải nén ZIP, giữ nguyên logic của scripts/extract-zip.py:
  // bỏ qua directory entries, chỉ lấy tên file cuối cùng (flatten), xử lý backslash paths
  fs.mkdirSync(extDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const base = entry.entryName.replace(/\\/g, '/').split('/').pop();
    if (!base) continue;
    const target = path.join(extDir, base);
    fs.writeFileSync(target, entry.getData());
  }
}

// --- TBMT File Download (tự động scan nếu chưa cache, giải nén ZIP) ---
app.post('/api/projects/:id/download-tbmt', auth, async (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy dự án' });

  const project = data.projects[idx];
  const tbmtCode = project.projectInfo && project.projectInfo.maDauThau;
  if (!tbmtCode) return res.status(400).json({ error: 'Dự án chưa có mã đấu thầu (IB)' });

  // Gói rút gọn không có file HSMT
  if (isRutGonProject(project)) {
    return res.status(400).json({ error: 'Gói thầu rút gọn không có hồ sơ mời thầu (HSMT) để tải' });
  }

  try {
    let apiRes = await fetch(`${TBMT_API_BASE}/files/${encodeURIComponent(tbmtCode)}`, {
      headers: { 'X-API-Key': TBMT_API_KEY }
    });

    if (apiRes.status === 404) {
      const body = await apiRes.json().catch(() => ({}));
      if (body.detail && body.detail.includes('Run POST /api/scan')) {
        console.log(`[download-tbmt] No cache for ${tbmtCode}, triggering scan...`);
        const scanRes = await fetch(`${TBMT_API_BASE}/scan/${encodeURIComponent(tbmtCode)}`, {
          method: 'POST',
          headers: { 'X-API-Key': TBMT_API_KEY }
        });
        if (!scanRes.ok) {
          const scanBody = await scanRes.json().catch(() => ({}));
          if (!(scanBody.detail && scanBody.detail.includes('in progress'))) {
            return res.status(502).json({ error: scanBody.detail || `Lỗi quét TBMT (${scanRes.status})` });
          }
        }
        const scanData = await scanRes.json().catch(() => ({}));
        const cooldownSec = scanData.cooldown_sec || 30;
        console.log(`[download-tbmt] Scan started, waiting ${cooldownSec}s...`);
        await new Promise(resolve => setTimeout(resolve, (cooldownSec + 3) * 1000));
        apiRes = await fetch(`${TBMT_API_BASE}/files/${encodeURIComponent(tbmtCode)}`, {
          headers: { 'X-API-Key': TBMT_API_KEY }
        });
        // After scan retry still fails — different message
        if (!apiRes.ok) {
          return res.status(502).json({ error: 'Không tìm thấy file TBMT sau khi quét. Có thể gói thầu này chưa có hồ sơ mời thầu (HSMT) trên hệ thống.' });
        }
      } else {
        return res.status(502).json({ error: body.detail || 'Không tìm thấy file TBMT cho mã này' });
      }
    }

    if (!apiRes.ok) {
      const body = await apiRes.json().catch(() => ({}));
      return res.status(502).json({ error: body.detail || `Lỗi từ máy chủ TBMT (${apiRes.status})` });
    }

    // Download the file buffer
    const buffer = Buffer.from(await apiRes.arrayBuffer());
    const extDir = path.join(TBMT_DIR, tbmtCode);

    // Check if it's a ZIP file (magic bytes PK\x03\x04)
    const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;

    if (isZip) {
      // Dọn dẹp file cũ trước khi ghi (tránh lỗi EACCES khi file thuộc quyền root từ Docker)
      cleanupTbmtPath(tbmtCode);
      // Save ZIP temporarily, extract via Python (handles backslash paths + unicode), then delete zip
      const zipPath = path.join(TBMT_DIR, `${tbmtCode}.zip`);
      fs.writeFileSync(zipPath, buffer);
      extractZip(zipPath, extDir);
      fs.unlinkSync(zipPath);

      // Read extracted files (skip macOS metadata files)
      const files = [];
      if (fs.existsSync(extDir)) {
        const entries = fs.readdirSync(extDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && !entry.name.startsWith('._') && !entry.name.startsWith('.DS_Store')) {
            const filePath = path.join(extDir, entry.name);
            const stat = fs.statSync(filePath);
            files.push({ name: entry.name, size: stat.size });
          }
        }
      }
      files.sort((a, b) => a.name.localeCompare(b.name));

      project.tbmtFile = {
        type: 'extracted',
        files,
        downloadedAt: new Date().toISOString()
      };
    } else {
      // Single file
      const disposition = apiRes.headers.get('content-disposition') || '';
      const nameMatch = disposition.match(/filename\s*=\s*["']?([^"'\s;]+)/i);
      const filename = nameMatch ? nameMatch[1] : `${tbmtCode}.pdf`;
      const filePath = path.join(TBMT_DIR, filename);
      // Dọn dẹp file cũ trước khi ghi
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { console.warn(`[tbmt] cleanup: cannot delete ${filePath} — ${e.message}`); }
      fs.writeFileSync(filePath, buffer);

      project.tbmtFile = {
        type: 'file',
        filename,
        size: buffer.length,
        downloadedAt: new Date().toISOString()
      };
    }

    project.updatedAt = new Date().toISOString();
    writeData(PROJ_FILE, data);
    res.json(project);
  } catch (error) {
    console.error('[download-tbmt] Error:', error.message);
    res.status(502).json({ error: error.message });
  }
});

// --- Serve TBMT File (hỗ trợ cả file đơn và file trong thư mục đã giải nén) ---
app.get('/api/tbmt-files/*', auth, (req, res) => {
  const relativePath = req.params[0];
  if (!relativePath) return res.status(400).json({ error: 'Thiếu đường dẫn file' });
  const resolved = path.resolve(path.join(TBMT_DIR, relativePath));
  if (!resolved.startsWith(path.resolve(TBMT_DIR))) {
    return res.status(403).json({ error: 'Từ chối' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'File không tồn tại' });
  }
  const ext = path.extname(resolved).toLowerCase();
  const mimeMap = { '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.txt': 'text/plain; charset=utf-8' };
  res.set('Content-Type', mimeMap[ext] || 'application/octet-stream');
  res.set('Content-Disposition', 'inline');
  res.sendFile(resolved);
});

function getStepCodeLabel(code) {
  const labels = {
    'notify-contractor-step-4-kqlcnt': 'Đã có kết quả thầu',
    'reoffer-price-step-1': 'Đang chờ kết quả'
  };
  return labels[code] || code || '';
}

function extractXepHang(items) {
  if (!items) return null;
  for (const item of items) {
    if (item.ghiChu) {
      const m = String(item.ghiChu).match(/Xếp\s*hạng\s*:\s*(\d+\s*\/\s*\d+)/i);
      if (m) return m[1];
    }
  }
  return null;
}

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(n) { if (n === 0 || !n) return '0'; return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function toDateStr(s) { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return s; const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yyyy = d.getFullYear(); return dd+'/'+mm+'/'+yyyy; }
function toDateTimeStr(s) { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return s; const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yyyy = d.getFullYear(); const h = String(d.getHours()).padStart(2,'0'); const m = String(d.getMinutes()).padStart(2,'0'); return dd+'/'+mm+'/'+yyyy+' '+h+':'+m; }

app.get('/share/:id', (req, res) => {
  const data = readData(PROJ_FILE);
  const p = data.projects.find(pr => pr.id === req.params.id);
  const cfg = readData(CONFIG_FILE);
  const companyName = cfg.companyName || 'CÔNG TY CỔ PHẦN THÔNG TIN HAPRO';
  if (!p) return res.status(404).send('<h1>Không tìm thấy dự án</h1>');
  const info = p.projectInfo || {};
  const params = p.params || {};
  const items = p.items || [];
  const tiLeLNG = params.tiLeLNG || 0;
  const phiDuThau = params.phiDuThau || 0;
  const phiBaoHanh = params.phiBaoHanh || 0;
  const phiBanHang = params.phiBanHang || 0;
  const phiCongTac = params.phiCongTac || 0;
  const hoaHongKD = params.hoaHongKD || 0;
  const giaDuToan = params.giaDuToan || 0;
  let tongGiaNhap = 0;
  for (const item of items) tongGiaNhap += (item.soLuong || 0) * (item.donGiaNhap || 0);
  const giaChaoToiThieu = tiLeLNG >= 100 ? 0 : (tiLeLNG > 0 ? Math.round(tongGiaNhap / (1 - tiLeLNG / 100)) : tongGiaNhap);
  const firstGiaNhap = items.length > 0 ? (items[0].soLuong || 0) * (items[0].donGiaNhap || 0) : 0;
  const tongTrongSo = items.reduce((s, item) => { const gn = (item.soLuong || 0) * (item.donGiaNhap || 0); return s + (firstGiaNhap > 0 ? gn / firstGiaNhap : 0); }, 0);
  const loiNhuanGop = giaChaoToiThieu - tongGiaNhap;
  const cpDuThau = phiDuThau;
  const cpBaoHanh = Math.round(giaChaoToiThieu * phiBaoHanh / 100);
  const cpBanHang = Math.round(giaChaoToiThieu * phiBanHang / 100);
  const cpCongTac = phiCongTac;
  const loiNhuanGopKD = loiNhuanGop - cpDuThau - cpBaoHanh - cpBanHang - cpCongTac;
  const hhKD = loiNhuanGopKD > 0 ? Math.round(loiNhuanGopKD * hoaHongKD / 100) : 0;
  const loiNhuanRong = loiNhuanGopKD - hhKD;
  const tiLeLNRVon = tongGiaNhap > 0 ? loiNhuanRong / tongGiaNhap * 100 : 0;
  const tiLeGiamGia = giaDuToan > 0 ? (giaDuToan - giaChaoToiThieu) / giaDuToan * 100 : 0;

  let h = '<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  h += '<title>' + esc(p.name) + ' - Đề xuất giá dự thầu</title>';
  h += '<style>body{font-family:"Segoe UI",sans-serif;margin:20px auto;color:#222;font-size:13px;max-width:900px;padding:0 20px}';
  h += 'h1{font-size:18px;color:#1a3a5c;text-align:center;margin-bottom:2px}';
  h += 'h2{text-align:center;font-size:14px;color:#555;margin:0 0 16px;font-weight:400}';
  h += 'h3{color:#1a3a5c;margin:16px 0 6px;border-bottom:2px solid #1a3a5c;padding-bottom:3px;font-size:14px}';
  h += 'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:13px}';
  h += 'th{background:#1a3a5c;color:#fff;padding:6px 5px;text-align:left;white-space:nowrap;font-size:12px}';
  h += 'td{padding:4px 5px;border:1px solid #d0d5dd}';
  h += '.n{text-align:right}.i td{border:none;padding:2px 6px}.i td:first-child{font-weight:600;width:180px}';
  h += '.s td:first-child{font-weight:600;width:240px}';
  h += '.hl{font-size:16px;font-weight:800;color:#1a3a5c}.pr{color:#27ae60}';
  h += '.footer{text-align:center;font-size:11px;color:#999;margin-top:24px}';
  h += '.status-badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.3px}.status-draft{background:#e8e8e8;color:#666}.status-pending{background:#fff3cd;color:#856404}.status-approved{background:#d4edda;color:#155724}.status-rejected{background:#f8d7da;color:#721c24}';
  h += '@media print{body{margin:0 auto;max-width:100%;padding:0}button{display:none}}</style></head><body>';

  h += '<h1>' + esc(companyName) + '</h1><h2>ĐỀ XUẤT GIÁ DỰ THẦU</h2>';
  h += '<h3>I. Thông tin chung</h3><table class="i">';
  h += '<tr><td>Tên công trình / Dự án</td><td>' + esc(info.tenCongTrinh || p.name) + '</td></tr>';
  if (info.maDauThau) h += '<tr><td>Mã đấu thầu (IB)</td><td>' + esc(info.maDauThau) + '</td></tr>';
  if (info.benMoiThau) h += '<tr><td>Bên mời thầu</td><td>' + esc(info.benMoiThau) + '</td></tr>';
  var hinhThuc = info.hinhThucLCNT || '';
  if (!hinhThuc && items && items.some(function(it) { return it.portalKyMaHieu || it.portalNhanHieu || it.portalHangSanXuat; })) {
    hinhThuc = 'Hình thức LCNT: Chào hàng cạnh tranh rút gọn';
  }
  if (hinhThuc) h += '<tr><td>Hình thức LCNT</td><td>' + esc(hinhThuc) + '</td></tr>';
  if (info.diaDiem) h += '<tr><td>Địa điểm thi công</td><td>' + esc(info.diaDiem) + '</td></tr>';

  if (info.thoiGianDongThau) h += '<tr><td>Thời gian đóng thầu</td><td>' + esc(toDateTimeStr(info.thoiGianDongThau)) + '</td></tr>';
  h += '</table>';

  h += '<h3>II. Danh mục hàng hóa</h3><table><tr><th>STT</th><th>Tên hàng hóa</th><th>ĐVT</th><th>SL</th><th>Đơn giá nhập</th><th>Giá nhập</th><th>Nhà cung cấp</th><th>Giá chào</th><th>Trọng số</th></tr>';
  for (const item of items) {
    const gn = (item.soLuong || 0) * (item.donGiaNhap || 0);
    const dgc = tongTrongSo > 0 && (firstGiaNhap > 0 ? gn / firstGiaNhap : 0) > 0 ? Math.round(giaChaoToiThieu * (firstGiaNhap > 0 ? gn / firstGiaNhap : 0) / tongTrongSo) : 0;
    // Build full item info: name + portal fields + specs
    let nameCell = '<strong>' + esc(item.tenHangHoa) + '</strong>';
    const infoLines = [];
    if (item.portalNhanHieu && item.portalNhanHieu !== 'Không có') infoLines.push('Nhãn hiệu: ' + esc(item.portalNhanHieu));
    if (item.portalHangSanXuat && item.portalHangSanXuat !== 'Không có') infoLines.push('Hãng SX: ' + esc(item.portalHangSanXuat));
    if (item.portalKyMaHieu && item.portalKyMaHieu !== 'Không có') infoLines.push('Ký mã hiệu: ' + esc(item.portalKyMaHieu));
    if (item.portalXuatXu && item.portalXuatXu !== 'Không có') infoLines.push('Xuất xứ: ' + esc(item.portalXuatXu));
    if (item.portalNamSanXuat && item.portalNamSanXuat !== 'Không có') infoLines.push('Năm SX: ' + esc(item.portalNamSanXuat));
    if (item.portalDiaDiemDuAn) infoLines.push('Địa điểm: ' + esc(item.portalDiaDiemDuAn));
    if (item.ghiChu) infoLines.push('Thông số KT: ' + esc(item.ghiChu));
    if (item.portalNgayGiaoSomNhat) infoLines.push('Giao sớm nhất: ' + esc(item.portalNgayGiaoSomNhat));
    if (item.portalNgayGiaoMuonNhat) infoLines.push('Giao muộn nhất: ' + esc(item.portalNgayGiaoMuonNhat));
    if (item.portalYeuCauKhac) infoLines.push('Yêu cầu khác: ' + esc(item.portalYeuCauKhac));
    if (infoLines.length > 0) {
      nameCell += '<br><small style="color:#444">' + infoLines.join('<br>') + '</small>';
    }
    h += '<tr><td>' + (item.stt || '') + '</td><td>' + nameCell + '</td><td>' + esc(item.donViTinh) + '</td>';
    h += '<td class="n">' + (item.soLuong || 0) + '</td><td class="n">' + fmt(item.donGiaNhap) + '</td>';
    h += '<td class="n">' + fmt(gn) + '</td><td>' + esc(item.nhaCungCap || '') + '</td>';
    const ts = firstGiaNhap > 0 ? gn / firstGiaNhap : 0;
    h += '<td class="n">' + fmt(dgc) + '</td><td class="n">' + ts.toFixed(2) + '</td></tr>';
  }
  let tongGN = 0, tongGC = 0;
  for (const item of items) { tongGN += (item.soLuong || 0) * (item.donGiaNhap || 0); const dgc2 = tongTrongSo > 0 && (firstGiaNhap > 0 ? (item.soLuong || 0) * (item.donGiaNhap || 0) / firstGiaNhap : 0) > 0 ? Math.round(giaChaoToiThieu * (firstGiaNhap > 0 ? (item.soLuong || 0) * (item.donGiaNhap || 0) / firstGiaNhap : 0) / tongTrongSo) : 0; tongGC += dgc2; }
  h += '<tr style="background:#eef2f7;font-weight:600"><td colspan="3" style="text-align:right">Tổng cộng</td><td class="n"></td><td class="n"></td><td class="n">' + fmt(tongGN) + '</td><td></td><td class="n">' + fmt(tongGC) + '</td><td class="n"></td></tr>';
  h += '</table>';

  h += '<h3>III. Hiệu quả dự án</h3><table class="s">';
  h += '<tr><td>Giá dự toán</td><td class="n hl">' + fmt(giaDuToan) + ' ₫</td></tr>';
  h += '<tr><td>Tỉ lệ giảm giá</td><td class="n" style="color:#e74c3c">-' + tiLeGiamGia.toFixed(1) + '%</td></tr>';
  h += '<tr><td>Giá chào tối thiểu</td><td class="n hl">' + fmt(giaChaoToiThieu) + ' ₫</td></tr>';
  h += '<tr><td>Tổng giá nhập</td><td class="n" style="color:#e74c3c">-' + fmt(tongGiaNhap) + ' ₫</td></tr>';
  const tiLeLNGActual = giaChaoToiThieu > 0 ? (loiNhuanGop / giaChaoToiThieu * 100) : 0;
  h += '<tr><td>Lợi nhuận gộp</td><td class="n pr">' + (loiNhuanGop >= 0 ? '' : '-') + fmt(Math.abs(loiNhuanGop)) + ' ₫</td></tr>';
  h += '<tr><td>Tỷ lệ LNG</td><td class="n pr">' + tiLeLNGActual.toFixed(1) + '%</td></tr>';
  h += '<tr><td>Phí dự thầu</td><td class="n" style="color:#e74c3c">-' + fmt(cpDuThau) + ' ₫</td></tr>';
  h += '<tr><td>Phí bảo hành</td><td class="n" style="color:#e74c3c">-' + fmt(cpBaoHanh) + ' (' + phiBaoHanh + '%)</td></tr>';
  h += '<tr><td>Phí bán hàng</td><td class="n" style="color:#e74c3c">-' + fmt(cpBanHang) + ' (' + phiBanHang + '%)</td></tr>';
  h += '<tr><td>Phí công tác/khác</td><td class="n" style="color:#e74c3c">-' + fmt(cpCongTac) + ' ₫</td></tr>';
  h += '<tr><td>Lợi nhuận gộp KD</td><td class="n pr">' + (loiNhuanGopKD >= 0 ? '' : '-') + fmt(Math.abs(loiNhuanGopKD)) + ' ₫</td></tr>';
  h += '<tr><td>Hoa hồng KD</td><td class="n" style="color:#e74c3c">-' + fmt(hhKD) + ' (' + hoaHongKD + '%)</td></tr>';
  h += '<tr style="border-top:2px solid #1a3a5c"><td style="font-weight:700">Lợi nhuận ròng</td><td class="n pr hl">' + (loiNhuanRong >= 0 ? '' : '-') + fmt(Math.abs(loiNhuanRong)) + ' ₫</td></tr>';
  h += '<tr><td>Tỷ lệ LNR / Vốn</td><td class="n pr hl">' + (tiLeLNRVon >= 0 ? '' : '-') + Math.abs(tiLeLNRVon).toFixed(1) + '%</td></tr></table>';

  let secIdx = 0;
  if (p.ketQuaTrungThau) {
    h += '<h3>' + ['IV','V','VI'][secIdx] + '. Kết quả thầu</h3><table class="s">';
    const krLabels = { win: 'Trúng thầu', lose: 'Trượt thầu' };
    h += '<tr><td>Kết quả</td><td class="n" style="font-weight:600;color:' + (p.ketQuaTrungThau === 'win' ? '#27ae60' : '#e74c3c') + '">' + (krLabels[p.ketQuaTrungThau] || p.ketQuaTrungThau) + '</td></tr>';
    if (p.giaTrungThau) h += '<tr><td>Giá trúng thầu</td><td class="n hl">' + fmt(p.giaTrungThau) + ' ₫</td></tr>';
    h += '</table>';
    secIdx++;
  }

  if (info.noiDungTrinh) {
    h += '<h3>' + ['IV','V','VI'][secIdx] + '. Nội dung trình</h3>';
    h += '<div style="border:1px solid #d0d5dd;border-radius:4px;padding:10px 14px;margin:8px 0;font-size:13px;line-height:1.6;white-space:pre-wrap">' + esc(info.noiDungTrinh) + '</div>';
    secIdx++;
  }

  h += '<h3>' + ['IV','V','VI'][secIdx] + '. Thông tin ký duyệt</h3>';
  const statusLabels = { draft: 'Đang chuẩn bị hồ sơ', pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Không duyệt' };
  const statusClasses = { draft: 'status-draft', pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected' };
  const st = p.status || 'draft';
  h += '<div style="text-align:center;margin-bottom:12px"><span class="status-badge ' + (statusClasses[st] || 'status-draft') + '">' + (statusLabels[st] || 'Đang chuẩn bị hồ sơ') + '</span></div>';
  h += '<table style="border:none;width:100%"><tr style="border:none">';
  h += '<td style="border:none;width:50%;vertical-align:top;padding:10px">';
  h += '<table class="i"><tr><td style="font-weight:600;width:160px">Người lập đề xuất</td><td>' + esc(info.nguoiLap || '') + '</td></tr>';
  h += '<tr><td style="font-weight:600">Ngày lập</td><td>' + esc(toDateStr(info.ngayLap)) + '</td></tr></table>';
  h += '</td><td style="border:none;width:50%;vertical-align:top;padding:10px">';
  const hasDuyet = info.nguoiDuyet || p.approvedBy;
  const ngayDuyet = info.ngayDuyet || (p.approvedAt ? p.approvedAt.split('T')[0] : '');
  h += '<table class="i"><tr><td style="font-weight:600;width:160px">Người duyệt đề xuất</td><td>' + esc(hasDuyet || '') + '</td></tr>';
  h += '<tr><td style="font-weight:600">Ngày duyệt</td><td>' + esc(toDateStr(ngayDuyet)) + '</td></tr></table>';
  h += '</td></tr></table>';

  h += '<div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="padding:8px 24px;background:#2a5a8c;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer">🖨 In trang này</button></div>';

  h += '<div class="footer">Phần Mềm Tính Giá Chào Thầu</div></body></html>';
  res.send(h);
});

// --- Auto-process imported projects ---
app.post('/api/projects/auto-process-imported', auth, adminOnly, (req, res) => {
  const data = readData(PROJ_FILE);
  const cfg = readData(CONFIG_FILE);
  const companyNorm = normalizeSupplierName(cfg.companyName || '');
  const now = new Date().toISOString();
  const reports = [];

  for (const project of data.projects) {
    if (!project.items || project.items.length === 0) continue;
    const items = project.items.filter(i => i.donGiaNhap && i.donGiaNhap > 0);
    if (items.length === 0) continue;

    const tongGiaNhap = items.reduce((s, i) => s + (i.soLuong || 0) * i.donGiaNhap, 0);
    if (tongGiaNhap <= 0) continue;

    // Determine target bid price (priority: giaChaoCongTy > giaTrungThau if won > donGiaChao)
    let targetBidPrice = project.giaChaoCongTy || null;
    let source = 'giaChaoCongTy';
    if (!targetBidPrice && project.ketQuaTrungThau === 'win' && project.giaTrungThau) {
      const winnerNorm = normalizeSupplierName(project.nhaThauTrung || '');
      if (winnerNorm && companyNorm && (winnerNorm === companyNorm || winnerNorm.includes(companyNorm) || companyNorm.includes(winnerNorm))) {
        targetBidPrice = project.giaTrungThau;
        source = 'giaTrungThau';
      }
    }
    if (!targetBidPrice) {
      targetBidPrice = items.reduce((s, i) => s + (i.donGiaChao || 0), 0);
      source = 'donGiaChao';
    }
    if (targetBidPrice <= 0) continue;

    // Floor instead of round: guarantee giaChaoToiThieu <= targetBidPrice
    const tiLeLNG = Math.floor((1 - tongGiaNhap / targetBidPrice) * 1000) / 10;
    if (tiLeLNG < 0 || tiLeLNG >= 100) continue;

    if (!project.params) project.params = {};
    const oldTiLeLNG = project.params.tiLeLNG || 0;
    project.params.tiLeLNG = tiLeLNG;

    // Recalculate donGiaChao for each item to match the new LNG
    const firstGiaNhap = items[0].soLuong * items[0].donGiaNhap;
    const _firstGiaNhap = firstGiaNhap;
    for (const item of items) {
      item.giaNhap = item.soLuong * item.donGiaNhap;
      item.trongSo = _firstGiaNhap > 0 ? item.giaNhap / _firstGiaNhap : 0;
    }
    const _tongTrongSo = items.reduce((s, i) => s + (i.trongSo || 0), 0);
    // Floor to ensure sum of donGiaChao never exceeds targetBidPrice
    const giaChaoToiThieu = Math.floor(tongGiaNhap / (1 - tiLeLNG / 100));
    for (const item of items) {
      item.donGiaChao = _tongTrongSo > 0 && item.trongSo > 0
        ? Math.round(giaChaoToiThieu * item.trongSo / _tongTrongSo) : 0;
    }

    project.status = 'approved';
    project.approvedBy = req.currentUser.fullName;
    project.approvedById = req.currentUser.id;
    project.approvedAt = now;
    project.updatedAt = now;

    if (!project.projectInfo) project.projectInfo = {};
    project.projectInfo.nguoiDuyet = req.currentUser.fullName;
    project.projectInfo.ngayDuyet = now.split('T')[0];

    reports.push({
      id: project.id,
      name: project.name,
      maDauThau: project.projectInfo?.maDauThau || '',
      oldTiLeLNG,
      tiLeLNG,
      tongGiaNhap,
      targetBidPrice,
      source
    });
  }

  writeData(PROJ_FILE, data);
  res.json({ processed: reports.length, reports });
});

// --- Report ---
app.get('/admin/report', auth, (req, res) => {
  const data = readData(PROJ_FILE);
  const cfg = readData(CONFIG_FILE);
  const companyName = cfg.companyName || 'CÔNG TY CỔ PHẦN THÔNG TIN HAPRO';

  function fmt(v) { if (v == null || v === '') return '-'; return Number(v).toLocaleString('vi-VN'); }
  function pct(v) { if (v == null || isNaN(v)) return '-'; return v.toFixed(1) + '%'; }
  function fmtChenh(a, b) {
    if (a == null || b == null || b === 0) return '';
    var c = (a - b) / b * 100;
    return (c >= 0 ? '+' : '') + c.toFixed(0) + '%';
  }

  const now = new Date().toLocaleDateString('vi-VN');
  let h = '<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  h += '<title>Phân tích kết quả đấu thầu</title>';
  h += '<style>body{font-family:"Segoe UI",sans-serif;margin:16px auto;color:#222;font-size:11px;max-width:100%;padding:0 8px}';
  h += 'h1{font-size:16px;color:#1a3a5c;text-align:center;margin-bottom:2px}h2{text-align:center;font-size:12px;color:#555;margin:0 0 12px;font-weight:400}';
  h += 'table{width:100%;border-collapse:collapse;margin:0;font-size:10px}';
  h += 'th{background:#1a3a5c;color:#fff;padding:5px 4px;text-align:left;white-space:nowrap;font-size:10px;position:sticky;top:0;z-index:1}';
  h += 'td{padding:3px 4px;border:1px solid #d0d5dd;vertical-align:top}';
  h += '.n{text-align:right;white-space:nowrap}';
  h += '.win{color:#27ae60;font-weight:700}.lose{color:#e74c3c;font-weight:700}';
  h += '.text-green{color:#27ae60;font-weight:600}.text-red{color:#e74c3c;font-weight:600}.text-yellow{color:#d68910;font-weight:600}';
  h += 'tr:nth-child(even){background:#f7f9fc}';
  h += '.summary{display:flex;gap:24px;justify-content:center;margin:8px 0 16px;font-size:12px;font-weight:600}';
  h += '.summary span{padding:6px 16px;border-radius:6px}.s-win{background:#d4edda;color:#155724}.s-lose{background:#f8d7da;color:#721c24}.s-na{background:#e8e8e8;color:#666}';
  h += '.footer{text-align:center;font-size:10px;color:#999;margin-top:16px}';
  h += '@media print{body{margin:0;padding:0;font-size:9px}th{font-size:9px;padding:3px 2px}td{font-size:9px;padding:2px}';
  h += 'button{display:none}@page{size:landscape;margin:8mm}}</style></head><body>';
  h += '<h1>' + esc(companyName) + '</h1><h2>PHÂN TÍCH KẾT QUẢ ĐẤU THẦU — ' + now + '</h2>';
  h += '<div style="text-align:center;margin-bottom:8px"><button onclick="window.print()" style="padding:6px 20px;background:#2a5a8c;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">In báo cáo</button></div>';

  var totalWin = 0, totalLose = 0;
  var loseGiaNhap = 0, loseGiaChao = 0, loseKhac = 0;

  h += '<table><thead><tr>';
  h += '<th>STT</th><th>Tên gói thầu</th><th>Kết quả</th><th>Phân tích / Gợi ý</th><th>Chỉ số chính</th>';
  h += '</tr></thead><tbody>';

  var sortedProjects = (data.projects || []).slice().sort(function(a, b) {
    var da = (a.projectInfo && a.projectInfo.thoiGianDongThau) || '';
    var db = (b.projectInfo && b.projectInfo.thoiGianDongThau) || '';
    if (da && !db) return -1;
    if (!da && db) return 1;
    return db.localeCompare(da);
  });

  let stt = 0;
  for (const p of sortedProjects) {
    if (!p.ketQuaTrungThau) continue;
    stt++;
    const info = p.projectInfo || {};
    const params = p.params || {};
    const items = p.items || [];

    const tongGiaNhap = items.reduce((s, i) => s + (i.soLuong || 0) * (i.donGiaNhap || 0), 0);

    // TiLeLNG: ưu tiên tính từ giaChaoCongTy nếu có (LNG thực tế), fallback params
    var tiLeLNG = params.tiLeLNG || 0;

    // Financial calculation: dùng giaTrungThau nếu trúng thầu, ngược lại dùng giaChaoToiThieu
    var giaBan = 0;
    if (p.ketQuaTrungThau === 'win' && p.giaTrungThau > 0) {
      giaBan = p.giaTrungThau;
      tiLeLNG = tongGiaNhap > 0 ? (1 - tongGiaNhap / giaBan) * 100 : 0;
    } else {
      const gc = p.giaChaoCongTy || items.reduce((s, i) => s + (i.donGiaChao || 0), 0);
      tiLeLNG = gc > 0 && tongGiaNhap > 0
        ? (1 - tongGiaNhap / gc) * 100
        : (params.tiLeLNG || 0);
      giaBan = tiLeLNG >= 100 ? 0 : (tiLeLNG > 0 ? Math.round(tongGiaNhap / (1 - tiLeLNG / 100)) : tongGiaNhap);
    }
    const giaChao = p.giaChaoCongTy || items.reduce((s, i) => s + (i.donGiaChao || 0), 0);

    const loiNhuanGop = giaBan - tongGiaNhap;
    const cpDuThau = params.phiDuThau || 0;
    const cpBaoHanh = Math.round(giaBan * (params.phiBaoHanh || 0) / 100);
    const cpBanHang = Math.round(giaBan * (params.phiBanHang || 0) / 100);
    const cpCongTac = params.phiCongTac || 0;
    const hoaHongKD = params.hoaHongKD || 0;
    const loiNhuanGopKD = loiNhuanGop - cpDuThau - cpBaoHanh - cpBanHang - cpCongTac;
    const hhKD = loiNhuanGopKD > 0 ? Math.round(loiNhuanGopKD * hoaHongKD / 100) : 0;
    const loiNhuanRong = loiNhuanGopKD - hhKD;
    const tiLeLNR = tongGiaNhap > 0 ? loiNhuanRong / tongGiaNhap * 100 : 0;

    const giaTrungThau = p.giaTrungThau;

    // Phân tích kết quả
    var ketQuaIcon = '-', ketQuaCls = '', phanTich = '', chiSo = '', phanTichCls = '';

    if (p.ketQuaTrungThau === 'win') {
      totalWin++;
      ketQuaIcon = '🟢 Trúng';
      ketQuaCls = 'win';
      var lnrLabel = '';
      if (tiLeLNR >= 15) lnrLabel = 'hiệu quả tốt';
      else if (tiLeLNR >= 5) lnrLabel = 'chấp nhận được';
      else if (tiLeLNR >= 0) lnrLabel = 'biên lợi nhuận thấp';
      else lnrLabel = 'lỗ (LNR âm)';
      phanTich = 'LNR ' + pct(tiLeLNR) + ' — ' + lnrLabel;
      phanTichCls = tiLeLNR >= 0 ? 'text-green' : 'text-red';
      chiSo = 'Giá chào ' + fmt(giaChao) + ' / TT ' + fmt(giaTrungThau) + ', LNG ' + pct(tiLeLNG);
    } else if (p.ketQuaTrungThau === 'lose' && giaTrungThau > 0) {
      totalLose++;
      ketQuaIcon = '🔴 Trượt';
      ketQuaCls = 'lose';
      if (tongGiaNhap >= giaTrungThau) {
        loseGiaNhap++;
        phanTich = 'Giá nhập cao hơn giá trúng thầu — không thể cạnh tranh';
        phanTichCls = 'text-red';
        chiSo = 'Nhập ' + fmt(tongGiaNhap) + ' / TT ' + fmt(giaTrungThau) + ' (' + fmtChenh(tongGiaNhap, giaTrungThau) + ')';
      } else if (giaChao > giaTrungThau) {
        loseGiaChao++;
        phanTich = 'Giá chào cao hơn giá trúng thầu — bỏ thầu quá cao';
        phanTichCls = 'text-yellow';
        chiSo = 'Chào ' + fmt(giaChao) + ' / TT ' + fmt(giaTrungThau) + ' (' + fmtChenh(giaChao, giaTrungThau) + ')';
      } else {
        loseKhac++;
        phanTich = 'Giá cạnh tranh — có thể do tiêu chí kỹ thuật / khác';
        phanTichCls = 'text-yellow';
        chiSo = 'Giá chào ' + fmt(giaChao) + ' / TT ' + fmt(giaTrungThau);
      }
    }

    h += '<tr>';
    h += '<td>' + stt + '</td>';
    h += '<td>' + esc(info.tenCongTrinh || p.name || 'Chưa đặt tên') + '</td>';
    h += '<td class="' + ketQuaCls + '">' + ketQuaIcon + '</td>';
    h += '<td class="' + phanTichCls + '">' + esc(phanTich) + '</td>';
    h += '<td class="n">' + esc(chiSo) + '</td>';
    h += '</tr>';
  }

  h += '</tbody></table>';
  h += '<div class="summary"><span class="s-win">🟢 Trúng: ' + totalWin + '</span><span class="s-lose">🔴 Trượt: ' + totalLose + '</span></div>';

  // ── Stacked bar chart: monthly win/lose overview ──
  var monthNames = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
  var nowDate = new Date();
  var monthly = [];
  for (var mi = 11; mi >= 0; mi--) {
    var md = new Date(nowDate.getFullYear(), nowDate.getMonth() - mi, 1);
    var mkey = md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0');
    monthly.push({ key: mkey, label: monthNames[md.getMonth()] + '/' + String(md.getFullYear()).slice(2), win: 0, lose: 0 });
  }

  for (var pi = 0; pi < (data.projects || []).length; pi++) {
    var pp = data.projects[pi];
    if (!pp.ketQuaTrungThau) continue;
    var closeStr = pp.projectInfo && pp.projectInfo.thoiGianDongThau;
    var pdt = closeStr ? new Date(closeStr) : null;
    if (!pdt || isNaN(pdt.getTime())) continue;
    var pkey = pdt.getFullYear() + '-' + String(pdt.getMonth() + 1).padStart(2, '0');
    for (var mi2 = 0; mi2 < monthly.length; mi2++) {
      if (monthly[mi2].key === pkey) {
        if (pp.ketQuaTrungThau === 'win') monthly[mi2].win++;
        else if (pp.ketQuaTrungThau === 'lose') monthly[mi2].lose++;
        break;
      }
    }
  }

  var maxTotal = 1;
  for (var mi3 = 0; mi3 < monthly.length; mi3++) {
    var mt = monthly[mi3].win + monthly[mi3].lose;
    if (mt > maxTotal) maxTotal = mt;
  }

  // Simple Y-step: 1, 2, 5, 10, 20, 50, 100, ...
  var yStep = 1;
  while (yStep * 5 < maxTotal) yStep *= (yStep * 2 < maxTotal ? 5 : 2);
  var yMax = Math.ceil(maxTotal / yStep) * yStep;

  var chartW = 700, chartH = 230, padL = 40, padR = 16, padT = 24, padB = 36;
  var plotW = chartW - padL - padR;
  var barGap = 4;
  var barW2 = Math.floor((plotW - barGap * (monthly.length + 1)) / monthly.length);
  var yScale = (chartH - padT - padB) / yMax;

  h += '<h3 style="text-align:center;font-size:14px;color:#1a3a5c;margin:24px 0 8px">SỐ GÓI THẦU THEO THÁNG</h3>';
  h += '<div style="overflow-x:auto;text-align:center">';
  h += '<svg width="' + chartW + '" height="' + chartH + '" viewBox="0 0 ' + chartW + ' ' + chartH + '" style="display:inline-block">';

  // Grid lines + Y labels
  for (var yv = 0; yv <= yMax; yv += yStep) {
    var yy = padT + (chartH - padT - padB) - yv * yScale;
    h += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (chartW - padR) + '" y2="' + yy + '" stroke="#e8e8e8" stroke-width="1"/>';
    h += '<text x="' + (padL - 6) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="9" fill="#888">' + yv + '</text>';
  }

  // Bars
  for (var mi4 = 0; mi4 < monthly.length; mi4++) {
    var mm = monthly[mi4];
    var bx = padL + barGap + mi4 * (barW2 + barGap);
    var bw = barW2;
    var hWin = mm.win * yScale;
    var hLose = mm.lose * yScale;
    var baseY2 = padT + (chartH - padT - padB);

    if (mm.win > 0) {
      h += '<rect x="' + bx + '" y="' + (baseY2 - hWin) + '" width="' + bw + '" height="' + hWin + '" fill="#27ae60" rx="1"/>';
    }
    if (mm.lose > 0) {
      h += '<rect x="' + bx + '" y="' + (baseY2 - hWin - hLose) + '" width="' + bw + '" height="' + hLose + '" fill="#e74c3c" rx="1"/>';
    }
    // X label
    h += '<text x="' + (bx + bw / 2) + '" y="' + (chartH - 6) + '" text-anchor="middle" font-size="9" fill="#555">' + mm.label + '</text>';
    // Count on top
    var totalM = mm.win + mm.lose;
    if (totalM > 0) {
      h += '<text x="' + (bx + bw / 2) + '" y="' + (baseY2 - hWin - hLose - 4) + '" text-anchor="middle" font-size="9" fill="#333" font-weight="600">' + totalM + '</text>';
    }
  }

  h += '</svg>';
  h += '<div style="font-size:11px;margin-top:4px"><span style="display:inline-block;width:12px;height:12px;background:#27ae60;border-radius:2px;vertical-align:middle;margin-right:4px"></span> Trúng <span style="display:inline-block;width:12px;height:12px;background:#e74c3c;border-radius:2px;vertical-align:middle;margin:0 4px 0 16px"></span> Trượt</div>';
  h += '</div>';

  // Pie chart
  var cx = 120, cy = 120, r = 100, pr = 0;
  function pieSlice(cx, cy, r, startAng, endAng, color, label) {
    var sa = startAng * Math.PI / 180, ea = endAng * Math.PI / 180;
    var x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
    var x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
    var large = (endAng - startAng) > 180 ? 1 : 0;
    var d = 'M' + cx + ',' + cy + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' Z';
    var midAng = (startAng + endAng) / 2 * Math.PI / 180;
    var lx = cx + (r * 0.65) * Math.cos(midAng), ly = cy + (r * 0.65) * Math.sin(midAng);
    return '<path d="' + d + '" fill="' + color + '" stroke="#fff" stroke-width="2"/>' +
      '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="12" font-weight="700">' + label + '</text>';
  }
  var slices = [];
  if (totalWin > 0) slices.push({ v: totalWin, c: '#27ae60', l: 'Trúng\n' + totalWin });
  if (loseGiaNhap > 0) slices.push({ v: loseGiaNhap, c: '#e74c3c', l: 'Trượt/Giá nhập cao' });
  if (loseGiaChao > 0) slices.push({ v: loseGiaChao, c: '#d68910', l: 'Trượt/Giá chào cao' });
  if (loseKhac > 0) slices.push({ v: loseKhac, c: '#8e44ad', l: 'Trượt/Khác' });
  var total = slices.reduce(function(s, sl) { return s + sl.v; }, 0);
  if (total > 0) {
    var pieSvg = '';
    var curAng = -90;
    for (var si = 0; si < slices.length; si++) {
      var ang = slices[si].v / total * 360;
      pieSvg += pieSlice(cx, cy, r, curAng, curAng + ang, slices[si].c, slices[si].v);
      curAng += ang;
    }
    h += '<div style="display:flex;align-items:center;justify-content:center;gap:32px;margin:20px 0">';
    h += '<svg width="260" height="260" viewBox="0 0 250 250">' + pieSvg + '</svg>';
    h += '<div style="font-size:11px;line-height:2">';
    var legendColors = { 'Trúng': '#27ae60', 'Giá nhập': '#e74c3c', 'Giá chào': '#d68910', 'Kỹ thuật': '#8e44ad' };
    for (var li = 0; li < slices.length; li++) {
      var pctVal = (slices[li].v / total * 100).toFixed(1);
      var lname = slices[li].l;
      h += '<div><span style="display:inline-block;width:12px;height:12px;background:' + slices[li].c + ';border-radius:2px;vertical-align:middle;margin-right:6px"></span><strong>' + lname + '</strong>: ' + slices[li].v + ' (' + pctVal + '%)</div>';
    }
    h += '</div></div>';
  }

  h += '<div class="footer">Phần Mềm Tính Giá Chào Thầu — Phân tích kết quả đấu thầu</div></body></html>';
  res.send(h);
});

// --- Admin: Batch Sync (Portal Fetch + TBMT Download) ---
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

function mergePortalItems(portalItems, existingItems) {
  return portalItems.map((pItem, idx) => {
    let bestMatch = null, bestScore = 0;
    for (const eItem of existingItems) {
      if (!eItem.tenHangHoa || !eItem.tenHangHoa.trim()) continue;
      const score = fuzzyMatch(pItem.tenHangHoa, eItem.tenHangHoa);
      if (score > 0.5 && score > bestScore) { bestScore = score; bestMatch = eItem; }
    }
    return {
      id: bestMatch ? bestMatch.id : uuidv4(),
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

app.post('/api/admin/sync-all', auth, adminOnly, async (req, res) => {
  const data = readData(PROJ_FILE);
  const projects = data.projects;

  const portalFetchCandidates = projects.filter(p => {
    if (!p.projectInfo || !p.projectInfo.maDauThau) return false;
    if (p.items && p.items.some(i => i.portalKyMaHieu)) return false;
    return true;
  });

  const tbmtCandidates = projects.filter(p => {
    if (!p.projectInfo || !p.projectInfo.maDauThau) return false;
    if (p.tbmtFile) return false;
    if (isRutGonProject(p)) return false;
    return true;
  });

  if (req.query.preview === 'true') {
    return res.json({
      preview: true,
      portalFetch: portalFetchCandidates.map(p => ({
        id: p.id, maDauThau: p.projectInfo.maDauThau,
        name: p.name || p.projectInfo.tenCongTrinh || '',
        benMoiThau: p.projectInfo.benMoiThau || '',
        thoiGianDongThau: p.projectInfo.thoiGianDongThau || ''
      })),
      tbmtDownload: tbmtCandidates.map(p => ({
        id: p.id, maDauThau: p.projectInfo.maDauThau,
        name: p.name || p.projectInfo.tenCongTrinh || '',
        hasPortalItems: !!(p.items && p.items.some(i => i.portalKyMaHieu))
      }))
    });
  }

  if (req.query.execute !== 'true') {
    return res.status(400).json({ error: 'Thiếu tham số: preview=true hoặc execute=true' });
  }

  const mode = req.query.mode || 'all';

  if (activeFetches >= MAX_FETCHES && portalFetchCandidates.length > 0 && mode !== 'tbmt') {
    return res.status(429).json({ error: 'Hệ thống đang xử lý yêu cầu Playwright khác. Vui lòng thử lại sau.' });
  }

  const portalResults = [];
  const tbmtResults = [];
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const startTime = Date.now();

  // Phase 1: Portal fetch (Playwright)
  let browser;
  try {
    if (portalFetchCandidates.length > 0 && (mode === 'all' || mode === 'portal')) {
      activeFetches++;
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote', '--disable-extensions'] });
      const context = await browser.newContext({ userAgent: UA });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);

      for (let i = 0; i < portalFetchCandidates.length; i++) {
        const project = portalFetchCandidates[i];
        const ib = project.projectInfo.maDauThau;
        const idx = i + 1;
        try {
          console.log(`[sync-all] [${idx}/${portalFetchCandidates.length}] Fetch portal: ${ib}`);
          await page.goto('https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=index', { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(1500);
          await page.fill('input[name="keyword"]', ib);

          let responseData = null;
          const handler = async (r) => {
            try {
              if (responseData) return;
              const ct = (r.headers()['content-type'] || '').toLowerCase();
              if (r.status() === 200 && r.url().includes('contractor-selection') && ct.includes('application/json')) {
                const json = await r.json();
                const items = (json.page && json.page.content) || json.data || [];
                const match = items.find(i => (i.notifyNo || i.bidNo) === ib);
                if (match) responseData = match;
              }
            } catch {}
          };
          page.on('response', handler);
          await page.keyboard.press('Enter');
          for (let w = 0; w < 25; w++) { if (responseData) break; await page.waitForTimeout(1000); }
          page.removeListener('response', handler);

          if (!responseData) {
            portalResults.push({ ib, name: project.name || ib, status: 'not_found', error: 'Không tìm thấy trên cổng' });
            console.log(`[sync-all]   Not found: ${ib}`);
            continue;
          }

          const tbmtId = extractValue(responseData.id);
          let items = [];
          if (tbmtId) {
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
                if (val != null && val !== '' && String(val) !== 'undefined') qs.set(param, String(val));
              }
              const detailUrl = 'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?' + qs.toString();
              await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 15000 });
              await page.waitForTimeout(3000);

              items = await page.evaluate(() => {
                const allTables = document.querySelectorAll('table.table-expand');
                for (const t of allTables) {
                  const wrapper = t.closest('.card-body.item-table, .item-table');
                  if (wrapper) {
                    const rows = t.querySelectorAll('tbody tr');
                    return Array.from(rows).map(row => {
                      const cells = row.querySelectorAll('td');
                      if (cells.length < 4) return null;
                      const clean = c => (c?.textContent || '').trim();
                      const rawQty = clean(cells[3]).replace(/[.,\s]/g, '');
                      return { tenHangHoa: clean(cells[1]), donViTinh: clean(cells[2]), soLuong: parseFloat(rawQty) || 1, ghiChu: clean(cells[9]), portalKyMaHieu: clean(cells[4]), portalNhanHieu: clean(cells[5]), portalHangSanXuat: clean(cells[6]), portalXuatXu: clean(cells[7]), portalNamSanXuat: clean(cells[8]), portalDiaDiemDuAn: clean(cells[10]), portalNgayGiaoSomNhat: clean(cells[11]), portalNgayGiaoMuonNhat: clean(cells[12]), portalYeuCauKhac: clean(cells[13]) };
                    }).filter(Boolean);
                  }
                }
                for (const t of allTables) {
                  const cells = t.querySelectorAll('thead th, thead td');
                  const headerTexts = Array.from(cells).map(c => (c.textContent || '').trim());
                  const hasItemHeader = headerTexts.some(h => h.includes('Danh mục hàng hóa') || h.includes('Đơn vị tính') || h.includes('Khối lượng'));
                  if (hasItemHeader || cells.length >= 10) {
                    const rows = t.querySelectorAll('tbody tr');
                    return Array.from(rows).map(row => {
                      const cells = row.querySelectorAll('td');
                      if (cells.length < 4) return null;
                      const clean = c => (c?.textContent || '').trim();
                      const rawQty = clean(cells[3]).replace(/[.,\s]/g, '');
                      return { tenHangHoa: clean(cells[1]), donViTinh: clean(cells[2]), soLuong: parseFloat(rawQty) || 1, ghiChu: clean(cells[9]), portalKyMaHieu: clean(cells[4]), portalNhanHieu: clean(cells[5]), portalHangSanXuat: clean(cells[6]), portalXuatXu: clean(cells[7]), portalNamSanXuat: clean(cells[8]), portalDiaDiemDuAn: clean(cells[10]), portalNgayGiaoSomNhat: clean(cells[11]), portalNgayGiaoMuonNhat: clean(cells[12]), portalYeuCauKhac: clean(cells[13]) };
                    }).filter(Boolean);
                  }
                }
                return [];
              });
            } catch (e) { items = []; }
          }

          if (items.length > 0) {
            const matched = mergePortalItems(items, project.items || []);
            project.items = matched;
            const preserved = matched.filter(it => it.nhaCungCap).length;
            portalResults.push({ ib, name: project.name || ib, status: 'ok', items: items.length, preservedPrices: preserved });
            console.log(`[sync-all]   OK: ${items.length} items (${preserved} preserved)`);
          } else {
            portalResults.push({ ib, name: project.name || ib, status: 'no_items', error: 'Không tìm thấy danh mục hàng hóa' });
            console.log(`[sync-all]   No items: ${ib}`);
          }
        } catch (e) {
          portalResults.push({ ib, name: project.name || ib, status: 'error', error: e.message });
          console.error(`[sync-all]   ERROR: ${ib} - ${e.message}`);
        }
        writeData(PROJ_FILE, data);
        if (i < portalFetchCandidates.length - 1) {
          const delay = 12000 + Math.floor(Math.random() * 4000);
          console.log(`[sync-all]   Waiting ${Math.round(delay/1000)}s...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
      await context.close();
    }
  } catch (e) {
    console.error('[sync-all] Portal fetch fatal:', e.message);
  } finally {
    if (portalFetchCandidates.length > 0) { activeFetches--; }
    if (browser) await browser.close();
  }

  // Phase 2: TBMT download
  if (mode === 'all' || mode === 'tbmt') {
  for (let i = 0; i < tbmtCandidates.length; i++) {
    const project = tbmtCandidates[i];
    const ib = project.projectInfo.maDauThau;
    const idx = i + 1;
    try {
      console.log(`[sync-all] [${idx}/${tbmtCandidates.length}] TBMT: ${ib}`);
      const apiRes = await fetch(`${TBMT_API_BASE}/files/${encodeURIComponent(ib)}`, {
        headers: { 'X-API-Key': TBMT_API_KEY }
      });
      if (apiRes.ok) {
        const buffer = Buffer.from(await apiRes.arrayBuffer());
        const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
        const extDir = path.join(TBMT_DIR, ib);
        if (isZip) {
          const zipPath = path.join(TBMT_DIR, `${ib}.zip`);
          fs.writeFileSync(zipPath, buffer);
          fs.mkdirSync(extDir, { recursive: true });
          execSync(`python3 "${path.join(__dirname, 'scripts', 'extract-zip.py')}" "${zipPath}" "${extDir}"`, { stdio: 'ignore' });
          fs.unlinkSync(zipPath);
          const files = [];
          if (fs.existsSync(extDir)) {
            const entries = fs.readdirSync(extDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isFile() && !entry.name.startsWith('._') && !entry.name.startsWith('.DS_Store')) {
                files.push({ name: entry.name, size: fs.statSync(path.join(extDir, entry.name)).size });
              }
            }
            files.sort((a, b) => a.name.localeCompare(b.name));
          }
          project.tbmtFile = { type: 'extracted', files, downloadedAt: new Date().toISOString() };
          tbmtResults.push({ ib, name: project.name || ib, status: 'downloaded', type: 'extracted', files: files.length });
          console.log(`[sync-all]   Downloaded ZIP: ${ib} (${files.length} files)`);
        } else {
          const disposition = apiRes.headers.get('content-disposition') || '';
          const nameMatch = disposition.match(/filename\s*=\s*["']?([^"'\s;]+)/i);
          const filename = nameMatch ? nameMatch[1] : `${ib}.pdf`;
          fs.writeFileSync(path.join(TBMT_DIR, filename), buffer);
          project.tbmtFile = { type: 'file', filename, size: buffer.length, downloadedAt: new Date().toISOString() };
          tbmtResults.push({ ib, name: project.name || ib, status: 'downloaded', type: 'file', filename });
          console.log(`[sync-all]   Downloaded file: ${ib} → ${filename}`);
        }
        delete project.tbmtDownloadInfo;
      } else if (apiRes.status === 404) {
        const body = await apiRes.json().catch(() => ({}));
        if (body.detail && body.detail.includes('Run POST /api/scan')) {
          await fetch(`${TBMT_API_BASE}/scan/${encodeURIComponent(ib)}`, { method: 'POST', headers: { 'X-API-Key': TBMT_API_KEY } });
          project.tbmtDownloadInfo = { status: 'scanning', scanTriggeredAt: new Date().toISOString(), lastCheckedAt: new Date().toISOString(), checkedCount: (project.tbmtDownloadInfo?.checkedCount || 0) + 1 };
          tbmtResults.push({ ib, name: project.name || ib, status: 'scan_triggered' });
          console.log(`[sync-all]   Scan triggered: ${ib}`);
        } else {
          project.tbmtDownloadInfo = { status: 'not_found', lastCheckedAt: new Date().toISOString(), checkedCount: (project.tbmtDownloadInfo?.checkedCount || 0) + 1 };
          tbmtResults.push({ ib, name: project.name || ib, status: 'not_found' });
          console.log(`[sync-all]   Not found: ${ib}`);
        }
      } else {
        tbmtResults.push({ ib, name: project.name || ib, status: 'error', error: `HTTP ${apiRes.status}` });
        console.log(`[sync-all]   Unexpected status ${apiRes.status}: ${ib}`);
      }
      project.updatedAt = new Date().toISOString();
    } catch (e) {
      tbmtResults.push({ ib, name: project.name || ib, status: 'error', error: e.message });
      console.error(`[sync-all]   ERROR: ${ib} - ${e.message}`);
    }
    writeData(PROJ_FILE, data);
    await new Promise(r => setTimeout(r, TBMT_CHECK_DELAY));
  }
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[sync-all] Done in ${durationSec}s — portal: ${portalResults.length}, tbmt: ${tbmtResults.length}`);
  res.json({ done: true, durationSec, portalFetch: portalResults, tbmtDownload: tbmtResults });
});

// --- Background TBMT auto-check ---
const TBMT_CHECK_DELAY = 2000;
const TBMT_RETRY_SCANNING_AFTER = 24 * 60 * 60 * 1000;
const TBMT_RETRY_NOT_FOUND_AFTER = 7 * 24 * 60 * 60 * 1000;

let tbmtCheckRunning = false;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkPendingTbmtFiles() {
  if (tbmtCheckRunning) { console.log('[tbmt-check] Skipped — previous run still in progress'); return; }
  tbmtCheckRunning = true;
  let checked = 0, downloaded = 0, scanTriggered = 0, notFound = 0;
  try {
    const data = readData(PROJ_FILE);
    const candidates = data.projects.filter(p => {
      if (!p.projectInfo || !p.projectInfo.maDauThau) return false;
      if (p.tbmtFile) return false;
      if (isRutGonProject(p)) return false;
      const info = p.tbmtDownloadInfo;
      if (info) {
        const elapsed = Date.now() - new Date(info.lastCheckedAt).getTime();
        if (info.status === 'scanning' && elapsed < TBMT_RETRY_SCANNING_AFTER) return false;
        if (info.status === 'not_found' && elapsed < TBMT_RETRY_NOT_FOUND_AFTER) return false;
      }
      return true;
    });
    console.log(`[tbmt-check] Found ${candidates.length} candidates`);
    let changed = false;
    for (const project of candidates) {
      const ib = project.projectInfo.maDauThau;
      checked++;
      try {
        const apiRes = await fetch(`${TBMT_API_BASE}/files/${encodeURIComponent(ib)}`, {
          headers: { 'X-API-Key': TBMT_API_KEY }
        });
        if (apiRes.ok) {
          const buffer = Buffer.from(await apiRes.arrayBuffer());
          const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
          const extDir = path.join(TBMT_DIR, ib);
          if (isZip) {
            // Dọn dẹp file cũ trước khi ghi
            cleanupTbmtPath(ib);
            const zipPath = path.join(TBMT_DIR, `${ib}.zip`);
            fs.writeFileSync(zipPath, buffer);
            extractZip(zipPath, extDir);
            fs.unlinkSync(zipPath);
            const files = [];
            if (fs.existsSync(extDir)) {
              const entries = fs.readdirSync(extDir, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isFile() && !entry.name.startsWith('._') && !entry.name.startsWith('.DS_Store')) {
                  const fp = path.join(extDir, entry.name);
                  files.push({ name: entry.name, size: fs.statSync(fp).size });
                }
              }
              files.sort((a, b) => a.name.localeCompare(b.name));
            }
            project.tbmtFile = { type: 'extracted', files, downloadedAt: new Date().toISOString() };
            console.log(`[tbmt-check] Downloaded ZIP + extracted: ${ib} (${files.length} files)`);
          } else {
            const disposition = apiRes.headers.get('content-disposition') || '';
            const nameMatch = disposition.match(/filename\s*=\s*["']?([^"'\s;]+)/i);
            const filename = nameMatch ? nameMatch[1] : `${ib}.pdf`;
            const filePath = path.join(TBMT_DIR, filename);
            try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { console.warn(`[tbmt-check] cleanup: cannot delete ${filePath} — ${e.message}`); }
            fs.writeFileSync(filePath, buffer);
            project.tbmtFile = { type: 'file', filename, size: buffer.length, downloadedAt: new Date().toISOString() };
            console.log(`[tbmt-check] Downloaded file: ${ib} → ${filename}`);
          }
          delete project.tbmtDownloadInfo;
          downloaded++;
        } else if (apiRes.status === 404) {
          const body = await apiRes.json().catch(() => ({}));
          if (body.detail && body.detail.includes('Run POST /api/scan')) {
            await fetch(`${TBMT_API_BASE}/scan/${encodeURIComponent(ib)}`, {
              method: 'POST', headers: { 'X-API-Key': TBMT_API_KEY }
            });
            project.tbmtDownloadInfo = {
              status: 'scanning',
              scanTriggeredAt: new Date().toISOString(),
              lastCheckedAt: new Date().toISOString(),
              checkedCount: (project.tbmtDownloadInfo?.checkedCount || 0) + 1
            };
            scanTriggered++;
            console.log(`[tbmt-check] Scan triggered: ${ib}`);
          } else {
            project.tbmtDownloadInfo = {
              status: 'not_found',
              lastCheckedAt: new Date().toISOString(),
              checkedCount: (project.tbmtDownloadInfo?.checkedCount || 0) + 1
            };
            notFound++;
            console.log(`[tbmt-check] Not found: ${ib}`);
          }
        } else {
          console.log(`[tbmt-check] Unexpected status ${apiRes.status} for ${ib}`);
        }
        project.updatedAt = new Date().toISOString();
        changed = true;
      } catch (err) {
        console.error(`[tbmt-check] Error for ${ib}:`, err.message);
      }
      await delay(TBMT_CHECK_DELAY);
    }
    if (changed) writeData(PROJ_FILE, data);
    console.log(`[tbmt-check] Done — checked: ${checked}, downloaded: ${downloaded}, scan-triggered: ${scanTriggered}, not-found: ${notFound}`);
  } catch (err) {
    console.error('[tbmt-check] Fatal error:', err.message);
  } finally {
    tbmtCheckRunning = false;
  }
}

function scheduleDailyAt6AM(fn) {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(19, 0, 0, 0);
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  const msUntilTarget = target - now;
  setTimeout(() => {
    fn();
    setInterval(fn, 24 * 60 * 60 * 1000);
  }, msUntilTarget);
}

scheduleDailyAt6AM(checkPendingTbmtFiles);

app.listen(PORT, () => {
  console.log(`Phần mềm tính giá chào thầu v2 đang chạy tại: http://localhost:${PORT}`);
});
