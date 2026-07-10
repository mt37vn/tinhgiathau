const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3456;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ projects: [] }, null, 2));

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch { return { projects: [] }; }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/projects', (req, res) => {
  const data = readData();
  res.json(data.projects.map(p => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  })));
});

app.get('/api/projects/:id', (req, res) => {
  const data = readData();
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json(project);
});

app.post('/api/projects', (req, res) => {
  const data = readData();
  const now = new Date().toISOString();
  const project = {
    id: uuidv4(),
    name: req.body.name || 'Dự án mới',
    createdAt: now,
    updatedAt: now,
    projectInfo: req.body.projectInfo || {
      tenCongTrinh: req.body.name || '',
      maDauThau: '',
      diaDiem: '',
      thoiGianThucHien: 90,
      nguoiPhuTrach: '',
      nguoiLap: '',
      ngayLap: ''
    },
    items: [
      { id: uuidv4(), stt: 1, tenHangHoa: '', donViTinh: 'Gói', soLuong: 1, donGiaNhap: 0, trongSo: 1, ghiChu: '' }
    ],
    params: {
      tiLeLNG: 30,
      phiBaoHanh: 5,
      phiBanHang: 2,
      phiCongTac: 0,
      hoaHongKD: 12.5,
      giaDuToan: 0
    }
  };
  data.projects.push(project);
  writeData(data);
  res.status(201).json(project);
});

app.put('/api/projects/:id', (req, res) => {
  const data = readData();
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.projects[idx] = { ...data.projects[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  writeData(data);
  res.json(data.projects[idx]);
});

app.delete('/api/projects/:id', (req, res) => {
  const data = readData();
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.projects.splice(idx, 1);
  writeData(data);
  res.json({ ok: true });
});

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(n) { if (n === 0 || !n) return '0'; return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

app.get('/share/:id', (req, res) => {
  const data = readData();
  const p = data.projects.find(pr => pr.id === req.params.id);
  if (!p) return res.status(404).send('<h1>Không tìm thấy dự án</h1>');

  const info = p.projectInfo || {};
  const params = p.params || {};
  const items = p.items || [];
  const tiLeLNG = params.tiLeLNG || 0;
  const phiBaoHanh = params.phiBaoHanh || 0;
  const phiBanHang = params.phiBanHang || 0;
  const phiCongTac = params.phiCongTac || 0;
  const hoaHongKD = params.hoaHongKD || 0;
  const giaDuToan = params.giaDuToan || 0;

  let tongGiaNhap = 0;
  for (const item of items) tongGiaNhap += (item.soLuong || 0) * (item.donGiaNhap || 0);

  const giaChaoToiThieu = tiLeLNG >= 100 ? 0 : (tiLeLNG > 0 ? Math.round(tongGiaNhap / (1 - tiLeLNG / 100)) : tongGiaNhap);
  const firstGiaNhap = items.length > 0 ? (items[0].soLuong || 0) * (items[0].donGiaNhap || 0) : 0;
  const tongTrongSo = items.reduce((s, item) => {
    const gn = (item.soLuong || 0) * (item.donGiaNhap || 0);
    return s + (firstGiaNhap > 0 ? gn / firstGiaNhap : 0);
  }, 0);

  const loiNhuanGop = giaChaoToiThieu - tongGiaNhap;
  const cpBaoHanh = Math.round(giaChaoToiThieu * phiBaoHanh / 100);
  const cpBanHang = Math.round(giaChaoToiThieu * phiBanHang / 100);
  const loiNhuanGopKD = loiNhuanGop - cpBaoHanh - cpBanHang - phiCongTac;
  const hhKD = loiNhuanGopKD > 0 ? Math.round(loiNhuanGopKD * hoaHongKD / 100) : 0;
  const loiNhuanRong = loiNhuanGopKD - hhKD;
  const tiLeLNRVon = tongGiaNhap > 0 ? loiNhuanRong / tongGiaNhap * 100 : 0;
  const tiLeGiamGia = giaDuToan > 0 ? (giaDuToan - giaChaoToiThieu) / giaDuToan * 100 : 0;

  let h = '<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  h += '<title>' + esc(p.name) + ' - Đề xuất giá dự thầu</title>';
  h += '<style>body{font-family:"Segoe UI",sans-serif;margin:20px 30px;color:#222;font-size:13px}';
  h += 'h1{font-size:18px;color:#1a3a5c;text-align:center;margin-bottom:2px}';
  h += 'h2{text-align:center;font-size:14px;color:#555;margin:0 0 16px;font-weight:400}';
  h += 'h3{color:#1a3a5c;margin:16px 0 6px;border-bottom:2px solid #1a3a5c;padding-bottom:3px;font-size:14px}';
  h += 'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:13px}';
  h += 'th{background:#1a3a5c;color:#fff;padding:6px 5px;text-align:left;white-space:nowrap;font-size:12px}';
  h += 'td{padding:4px 5px;border:1px solid #d0d5dd}';
  h += '.n{text-align:right}.i td{border:none;padding:2px 6px}.i td:first-child{font-weight:600;width:180px}';
  h += '.s td:first-child{font-weight:600;width:200px}';
  h += '.hl{font-size:16px;font-weight:800;color:#1a3a5c}.pr{color:#27ae60}';
  h += '.footer{text-align:center;font-size:11px;color:#999;margin-top:24px}';
  h += '@media print{body{margin:15px}button{display:none}}</style></head><body>';

  h += '<h1>CÔNG TY CỔ PHẦN THÔNG TIN HAPRO</h1><h2>ĐỀ XUẤT GIÁ DỰ THẦU</h2>';

  h += '<h3>I. Thông tin chung</h3><table class="i">';
  h += '<tr><td>Tên công trình / Dự án</td><td>' + esc(info.tenCongTrinh || p.name) + '</td></tr>';
  if (info.maDauThau) h += '<tr><td>Mã đấu thầu (IB)</td><td>' + esc(info.maDauThau) + '</td></tr>';
  h += '<tr><td>Giá dự toán</td><td>' + fmt(giaDuToan) + ' ₫</td></tr>';
  if (info.diaDiem) h += '<tr><td>Địa điểm thi công</td><td>' + esc(info.diaDiem) + '</td></tr>';
  if (info.thoiGianThucHien) h += '<tr><td>Thời gian thực hiện</td><td>' + info.thoiGianThucHien + ' ngày</td></tr>';
  if (info.nguoiLap) h += '<tr><td>Người lập đề xuất</td><td>' + esc(info.nguoiLap) + '</td></tr>';
  if (info.ngayLap) h += '<tr><td>Ngày lập</td><td>' + esc(info.ngayLap) + '</td></tr>';
  h += '</table>';

  h += '<h3>II. Danh mục hàng hóa</h3><table><tr><th>STT</th><th>Tên hàng hóa</th><th>ĐVT</th><th>SL</th><th>ĐG nhập</th><th>Giá nhập</th><th>TS</th><th>ĐG chào</th></tr>';
  for (const item of items) {
    const gn = (item.soLuong || 0) * (item.donGiaNhap || 0);
    const ts = firstGiaNhap > 0 ? gn / firstGiaNhap : 0;
    const dgc = tongTrongSo > 0 && ts > 0 ? Math.round(giaChaoToiThieu * ts / tongTrongSo) : 0;
    h += '<tr><td>' + (item.stt || '') + '</td><td>' + esc(item.tenHangHoa) + '</td><td>' + esc(item.donViTinh) + '</td>';
    h += '<td class="n">' + (item.soLuong || 0) + '</td><td class="n">' + fmt(item.donGiaNhap) + '</td>';
    h += '<td class="n">' + fmt(gn) + '</td><td class="n">' + ts.toFixed(2) + '</td>';
    h += '<td class="n">' + fmt(dgc) + '</td></tr>';
  }
  h += '</table>';

  h += '<h3>III. Tổng hợp giá</h3><table class="s">';
  h += '<tr><td>Giá chào tối thiểu</td><td class="n hl">' + fmt(giaChaoToiThieu) + ' ₫</td></tr>';
  h += '<tr><td>Tỉ lệ giảm giá</td><td class="n">' + tiLeGiamGia.toFixed(1) + '%</td></tr>';
  h += '<tr><td>Tổng giá nhập</td><td class="n">' + fmt(tongGiaNhap) + ' ₫</td></tr>';
  h += '<tr><td>Lợi nhuận gộp</td><td class="n pr">' + fmt(loiNhuanGop) + ' ₫</td></tr>';
  h += '<tr><td>Phí bảo hành</td><td class="n">' + fmt(cpBaoHanh) + ' (' + phiBaoHanh + '%)</td></tr>';
  h += '<tr><td>Phí bán hàng</td><td class="n">' + fmt(cpBanHang) + ' (' + phiBanHang + '%)</td></tr>';
  h += '<tr><td>Phí công tác</td><td class="n">' + fmt(phiCongTac) + ' ₫</td></tr>';
  h += '<tr><td>LN gộp KD</td><td class="n pr">' + fmt(loiNhuanGopKD) + ' ₫</td></tr>';
  h += '<tr><td>Hoa hồng KD</td><td class="n">' + fmt(hhKD) + ' (' + hoaHongKD + '%)</td></tr>';
  h += '<tr style="border-top:2px solid #1a3a5c"><td style="font-weight:700">Lợi nhuận ròng</td><td class="n pr hl">' + fmt(loiNhuanRong) + ' ₫</td></tr>';
  h += '<tr><td>Tỷ lệ LNR / Vốn</td><td class="n pr hl">' + tiLeLNRVon.toFixed(1) + '%</td></tr></table>';

  h += '<div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="padding:8px 24px;background:#2a5a8c;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer">🖨 In trang này</button></div>';

  h += '<div class="footer">Phần Mềm Tính Giá Chào Thầu</div></body></html>';

  res.send(h);
});

app.listen(PORT, () => {
  console.log(`Phần mềm tính giá chào thầu đang chạy tại: http://localhost:${PORT}`);
});
