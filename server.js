const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3456;
const DATA_DIR = path.join(__dirname, 'data');
const PROJ_FILE = path.join(DATA_DIR, 'projects.json');
const USER_FILE = path.join(DATA_DIR, 'users.json');
const SUPPLIER_FILE = path.join(DATA_DIR, 'suppliers.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

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

    const w1 = 0.6, w2 = 0.2, w3 = 0.2;
    const discountScore = avgDiscountRate != null ? Math.min(avgDiscountRate, 100) : 0;

    let priceScore = 0;
    if (totalItems > 0 && sumDonGiaNhap > 0) {
      const supplierAvgPrice = sumDonGiaNhap / totalItems;
      let totalIndustryAvg = 0, avgCount = 0;
      const allPrices = {};
      for (const proj of pData.projects) {
        if (!proj.items) continue;
        for (const item of proj.items) {
          if (item.donGiaNhap && item.tenHangHoa) {
            const key = normalizeSupplierName(item.tenHangHoa);
            if (!allPrices[key]) allPrices[key] = [];
            allPrices[key].push(item.donGiaNhap);
          }
        }
      }
      for (const key of Object.keys(itemHistory)) {
        if (allPrices[key]) {
          const avg = allPrices[key].reduce((s, p) => s + p, 0) / allPrices[key].length;
          totalIndustryAvg += avg;
          avgCount++;
        }
      }
      if (avgCount > 0 && totalIndustryAvg > 0) {
        const industryAvg = totalIndustryAvg / avgCount;
        priceScore = Math.max(0, (1 - supplierAvgPrice / industryAvg) * 100);
      }
    }

    const maxProjects = Math.max(1, sData.suppliers.reduce((max, sup) => {
      const supAliases = [sup.name, ...(sup.aliases || [])].map(a => normalizeSupplierName(a));
      const count = pData.projects.filter(p => p.items && p.items.some(item =>
        item.nhaCungCap && supAliases.includes(normalizeSupplierName(item.nhaCungCap))
      )).length;
      return Math.max(max, count);
    }, 1));
    const experienceScore = (projectIds.size / maxProjects) * 100;

    const score = w1 * discountScore + w2 * priceScore + w3 * experienceScore;

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
  try {
    const tag = execSync('git describe --tags --abbrev=0', { cwd: __dirname, encoding: 'utf8' }).trim();
    res.json({ version: tag });
  } catch {
    // Fallback: use short commit hash if no tags
    try {
      const hash = execSync('git rev-parse --short HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();
      res.json({ version: hash });
    } catch {
      res.json({ version: 'unknown' });
    }
  }
});

// --- Settings ---
app.get('/api/settings', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  const config = readData(CONFIG_FILE);
  res.json({ companyName: config.companyName || '' });
});
app.put('/api/settings', auth, adminOnly, (req, res) => {
  const config = readData(CONFIG_FILE);
  if (req.body.companyName !== undefined) config.companyName = req.body.companyName;
  writeData(CONFIG_FILE, config);
  res.json({ companyName: config.companyName });
});

// --- Projects ---
app.get('/api/projects', auth, (req, res) => {
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
    params: { tiLeLNG: 30, phiDuThau: 330000, phiBaoHanh: 5, phiBanHang: 2, phiCongTac: 0, hoaHongKD: 12.5, giaDuToan: 0 }
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
  if (req.currentUser.role !== 'admin') {
    const isOwner = (project.projectInfo && project.projectInfo.nguoiLapId === req.currentUser.id)
      || (project.projectInfo && project.projectInfo.nguoiLap === req.currentUser.fullName);
    if (!isOwner)
      return res.status(403).json({ error: 'Chỉ sửa được dự án do mình tạo hoặc được phân công' });
  }
  const updated = { ...project, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  data.projects[idx] = updated;
  writeData(PROJ_FILE, data);
  if (updated.items) syncSuppliersFromItems(updated.items);
  res.json(data.projects[idx]);
});

app.patch('/api/projects/:id/submit', auth, (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const project = data.projects[idx];
  if (project.status !== 'draft' && project.status !== 'rejected')
    return res.status(400).json({ error: 'Chỉ trình duyệt dự án ở trạng thái dự thảo hoặc không duyệt' });
  const isOwner = (project.projectInfo && project.projectInfo.nguoiLapId === req.currentUser.id)
    || (project.projectInfo && project.projectInfo.nguoiLap === req.currentUser.fullName);
  if (!isOwner && req.currentUser.role !== 'admin')
    return res.status(403).json({ error: 'Chỉ người tạo mới được trình duyệt' });
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

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  let browser;
  try {
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

    const result = {
      tenCongTrinh: extractValue(responseData.bidName),
      benMoiThau: extractValue(responseData.investorName),
      thoiGianDongThau: extractValue(responseData.bidCloseDate),
      giaDuToan: extractPrice(responseData.bidPrice || responseData.bidEstimatePrice || responseData.planItemPrice),
      bidNo: extractValue(responseData.notifyNo || responseData.bidNo) || ibCode,
      diaDiem: '',
      giaTrungThau: extractPrice(responseData.bidWinningPrice),
      nhaThauTrung: extractValue(responseData.contractorName)
    };

    // Step 2: Fetch detail page for location and construction time
    const tbmtId = extractValue(responseData.id);
    if (tbmtId) {
      try {
        const detailUrl =
          'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?' +
          'p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2' +
          '&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view' +
          '&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2' +
          '&type=es-notify-contractor&step=tbmt' +
          '&id=' + tbmtId + '&notifyId=' + tbmtId;

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

    return res.json(result);
  } catch (error) {
    console.error('Fetch IB error:', error);
    return res.status(500).json({ error: 'Lỗi kết nối đến trang đấu thầu: ' + error.message });
  } finally {
    if (browser) await browser.close();
  }
});

// --- Fetch Bid Result by IB Code ---
app.get('/api/fetch-bid-result/:ibCode', auth, async (req, res) => {
  const ibCode = req.params.ibCode.trim();
  if (!ibCode) return res.status(400).json({ error: 'Mã IB không hợp lệ' });

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  let browser;
  try {
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
    return res.json(project);
  } catch (error) {
    project.bidResultFetchedAt = new Date().toISOString();
    project.bidResultFetchError = 'Lỗi kết nối: ' + error.message;
    project.updatedAt = new Date().toISOString();
    writeData(PROJ_FILE, data);
    return res.status(500).json({ error: project.bidResultFetchError });
  }
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
  if (info.diaDiem) h += '<tr><td>Địa điểm thi công</td><td>' + esc(info.diaDiem) + '</td></tr>';

  if (info.thoiGianDongThau) h += '<tr><td>Thời gian đóng thầu</td><td>' + esc(toDateTimeStr(info.thoiGianDongThau)) + '</td></tr>';
  h += '</table>';

  h += '<h3>II. Danh mục hàng hóa</h3><table><tr><th>STT</th><th>Tên hàng hóa</th><th>Thông số kỹ thuật</th><th>ĐVT</th><th>SL</th><th>Đơn giá nhập</th><th>Giá nhập</th><th>Nhà cung cấp</th><th>Giá chào</th><th>Trọng số</th></tr>';
  for (const item of items) {
    const gn = (item.soLuong || 0) * (item.donGiaNhap || 0);
    const dgc = tongTrongSo > 0 && (firstGiaNhap > 0 ? gn / firstGiaNhap : 0) > 0 ? Math.round(giaChaoToiThieu * (firstGiaNhap > 0 ? gn / firstGiaNhap : 0) / tongTrongSo) : 0;
    h += '<tr><td>' + (item.stt || '') + '</td><td>' + esc(item.tenHangHoa) + '</td><td>' + esc(item.ghiChu || '') + '</td><td>' + esc(item.donViTinh) + '</td>';
    h += '<td class="n">' + (item.soLuong || 0) + '</td><td class="n">' + fmt(item.donGiaNhap) + '</td>';
    h += '<td class="n">' + fmt(gn) + '</td><td>' + esc(item.nhaCungCap || '') + '</td>';
    const ts = firstGiaNhap > 0 ? gn / firstGiaNhap : 0;
    h += '<td class="n">' + fmt(dgc) + '</td><td class="n">' + ts.toFixed(2) + '</td></tr>';
  }
  let tongGN = 0, tongGC = 0;
  for (const item of items) { tongGN += (item.soLuong || 0) * (item.donGiaNhap || 0); const dgc2 = tongTrongSo > 0 && (firstGiaNhap > 0 ? (item.soLuong || 0) * (item.donGiaNhap || 0) / firstGiaNhap : 0) > 0 ? Math.round(giaChaoToiThieu * (firstGiaNhap > 0 ? (item.soLuong || 0) * (item.donGiaNhap || 0) / firstGiaNhap : 0) / tongTrongSo) : 0; tongGC += dgc2; }
  h += '<tr style="background:#eef2f7;font-weight:600"><td colspan="4" style="text-align:right">Tổng cộng</td><td class="n"></td><td class="n"></td><td class="n">' + fmt(tongGN) + '</td><td></td><td class="n">' + fmt(tongGC) + '</td><td class="n"></td></tr>';
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
  const statusLabels = { draft: 'Dự thảo', pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Không duyệt' };
  const statusClasses = { draft: 'status-draft', pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected' };
  const st = p.status || 'draft';
  h += '<div style="text-align:center;margin-bottom:12px"><span class="status-badge ' + (statusClasses[st] || 'status-draft') + '">' + (statusLabels[st] || 'Dự thảo') + '</span></div>';
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

app.listen(PORT, () => {
  console.log(`Phần mềm tính giá chào thầu v2 đang chạy tại: http://localhost:${PORT}`);
});
