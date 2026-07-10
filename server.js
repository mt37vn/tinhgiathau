const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3456;
const DATA_DIR = path.join(__dirname, 'data');
const PROJ_FILE = path.join(DATA_DIR, 'projects.json');
const USER_FILE = path.join(DATA_DIR, 'users.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'dauthau-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROJ_FILE)) fs.writeFileSync(PROJ_FILE, JSON.stringify({ projects: [] }, null, 2));
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
  res.json({ user: req.session.user });
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

// --- Projects ---
app.get('/api/projects', auth, (req, res) => {
  const data = readData(PROJ_FILE);
  res.json(data.projects.map(p => ({
    id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt,
    status: p.status || 'draft', approvedBy: p.approvedBy || null, approvedAt: p.approvedAt || null,
    createdBy: p.createdBy || null,
    maDauThau: (p.projectInfo && p.projectInfo.maDauThau) || null,
    benMoiThau: (p.projectInfo && p.projectInfo.benMoiThau) || null,
    thoiGianDongThau: (p.projectInfo && p.projectInfo.thoiGianDongThau) || null
  })));
});

app.get('/api/projects/:id', auth, (req, res) => {
  const data = readData(PROJ_FILE);
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(project);
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
    createdBy: req.currentUser.id,
    projectInfo: req.body.projectInfo || {
      tenCongTrinh: req.body.name || '', maDauThau: '', benMoiThau: '', noiDungTrinh: '',
      diaDiem: '', thoiGianThucHien: 0, nguoiPhuTrach: '',
      nguoiLap: req.currentUser.fullName,
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
    const isOwner = project.createdBy === req.currentUser.id || (project.projectInfo && project.projectInfo.nguoiLap === req.currentUser.fullName);
    if (project.status !== 'draft' && project.status !== 'rejected')
      return res.status(403).json({ error: 'Không thể sửa dự án ở trạng thái này' });
    if (!isOwner)
      return res.status(403).json({ error: 'Chỉ sửa được dự án do mình tạo hoặc được phân công' });
  }
  const updated = { ...project, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  data.projects[idx] = updated;
  writeData(PROJ_FILE, data);
  res.json(data.projects[idx]);
});

app.patch('/api/projects/:id/submit', auth, (req, res) => {
  const data = readData(PROJ_FILE);
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const project = data.projects[idx];
  if (project.status !== 'draft' && project.status !== 'rejected')
    return res.status(400).json({ error: 'Chỉ trình duyệt dự án ở trạng thái dự thảo hoặc không duyệt' });
  const isOwner = project.createdBy === req.currentUser.id || (project.projectInfo && project.projectInfo.nguoiLap === req.currentUser.fullName);
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
    const isOwner = project.createdBy === req.currentUser.id || (project.projectInfo && project.projectInfo.nguoiLap === req.currentUser.fullName);
    if (!isOwner) return res.status(403).json({ error: 'Chỉ xoá được dự án do mình tạo' });
    if (project.status !== 'draft' && project.status !== 'rejected')
      return res.status(403).json({ error: 'Chỉ xoá được dự án ở trạng thái dự thảo' });
  }
  data.projects.splice(idx, 1);
  writeData(PROJ_FILE, data);
  res.json({ ok: true });
});

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(n) { if (n === 0 || !n) return '0'; return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

app.get('/share/:id', (req, res) => {
  const data = readData(PROJ_FILE);
  const p = data.projects.find(pr => pr.id === req.params.id);
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

  h += '<h1>CÔNG TY CỔ PHẦN THÔNG TIN HAPRO</h1><h2>ĐỀ XUẤT GIÁ DỰ THẦU</h2>';
  h += '<h3>I. Thông tin chung</h3><table class="i">';
  h += '<tr><td>Tên công trình / Dự án</td><td>' + esc(info.tenCongTrinh || p.name) + '</td></tr>';
  if (info.maDauThau) h += '<tr><td>Mã đấu thầu (IB)</td><td>' + esc(info.maDauThau) + '</td></tr>';
  if (info.benMoiThau) h += '<tr><td>Bên mời thầu</td><td>' + esc(info.benMoiThau) + '</td></tr>';
  if (info.diaDiem) h += '<tr><td>Địa điểm thi công</td><td>' + esc(info.diaDiem) + '</td></tr>';
  if (info.thoiGianThucHien) h += '<tr><td>Thời gian thực hiện</td><td>' + info.thoiGianThucHien + ' ngày</td></tr>';
  if (info.thoiGianDongThau) h += '<tr><td>Thời gian đóng thầu</td><td>' + esc(info.thoiGianDongThau) + '</td></tr>';
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

  if (info.noiDungTrinh) {
    h += '<h3>IV. Nội dung trình</h3>';
    h += '<div style="border:1px solid #d0d5dd;border-radius:4px;padding:10px 14px;margin:8px 0;font-size:13px;line-height:1.6;white-space:pre-wrap">' + esc(info.noiDungTrinh) + '</div>';
  }

  h += '<h3>V. Thông tin ký duyệt</h3>';
  const statusLabels = { draft: 'Dự thảo', pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Không duyệt' };
  const statusClasses = { draft: 'status-draft', pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected' };
  const st = p.status || 'draft';
  h += '<div style="text-align:center;margin-bottom:12px"><span class="status-badge ' + (statusClasses[st] || 'status-draft') + '">' + (statusLabels[st] || 'Dự thảo') + '</span></div>';
  h += '<table style="border:none;width:100%"><tr style="border:none">';
  h += '<td style="border:none;width:50%;vertical-align:top;padding:10px">';
  h += '<table class="i"><tr><td style="font-weight:600;width:160px">Người lập đề xuất</td><td>' + esc(info.nguoiLap || '') + '</td></tr>';
  h += '<tr><td style="font-weight:600">Ngày lập</td><td>' + esc(info.ngayLap || '') + '</td></tr></table>';
  h += '</td><td style="border:none;width:50%;vertical-align:top;padding:10px">';
  const hasDuyet = info.nguoiDuyet || p.approvedBy;
  const ngayDuyet = info.ngayDuyet || (p.approvedAt ? p.approvedAt.split('T')[0] : '');
  h += '<table class="i"><tr><td style="font-weight:600;width:160px">Người duyệt đề xuất</td><td>' + esc(hasDuyet || '') + '</td></tr>';
  h += '<tr><td style="font-weight:600">Ngày duyệt</td><td>' + esc(ngayDuyet || '') + '</td></tr></table>';
  h += '</td></tr></table>';

  h += '<div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="padding:8px 24px;background:#2a5a8c;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer">🖨 In trang này</button></div>';

  h += '<div class="footer">Phần Mềm Tính Giá Chào Thầu</div></body></html>';
  res.send(h);
});

app.listen(PORT, () => {
  console.log(`Phần mềm tính giá chào thầu v2 đang chạy tại: http://localhost:${PORT}`);
});
