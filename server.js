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
    projectInfo: {
      tenCongTrinh: req.body.name || '',
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

app.listen(PORT, () => {
  console.log(`Phần mềm tính giá chào thầu đang chạy tại: http://localhost:${PORT}`);
});
