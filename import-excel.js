const XLSX = require('xlsx');
const http = require('http');

const EXCEL_PATH = '/Users/tuanbm/Downloads/PA-SQL-SawacoGiaDinh.xlsx';
const API_BASE = 'http://localhost:3456';
const USERNAME = 'tuanbm';
const PASSWORD = 'admin123';

function api(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3456,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (cookie) opts.headers.Cookie = cookie;
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        const parsed = JSON.parse(data);
        parsed._cookie = setCookie ? setCookie[0].split(';')[0] : undefined;
        resolve(parsed);
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('Reading Excel...');
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['De xuat gia du thau'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const label = (data[4] || [])[0] || '';
  const projectName = 'PA - SQL Server - Sawaco Gia Định';

  const diaDiem = (data[5] || [])[2] || '';
  const thoiGianMatch = String((data[6] || [])[2] || '').match(/(\d+)/);
  const thoiGianThucHien = thoiGianMatch ? parseInt(thoiGianMatch[1]) : 90;
  const nguoiLap = (data[8] || [])[6] || '';
  const ngayLapRaw = (data[9] || [])[11];
  let ngayLap = '';
  if (ngayLapRaw && typeof ngayLapRaw === 'number' && ngayLapRaw > 40000) {
    const d = new Date(Math.round((ngayLapRaw - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) ngayLap = d.toISOString().split('T')[0];
  }

  const items = [];
  for (let i = 12; i < data.length; i++) {
    const row = data[i];
    if (row[0] !== null && row[0] !== undefined && row[0] !== '' && typeof row[0] === 'number') {
      if (row[1]) {
        items.push({
          tenHangHoa: String(row[1] || '').trim(),
          donViTinh: String(row[7] || 'Gói').trim(),
          soLuong: row[8] || 1,
          donGiaNhap: row[9] || 0
        });
      }
    }
  }

  let tiLeLNG = 0, giaDuToan = 0, phiBaoHanh = 0, phiBanHang = 0, phiCongTac = 0, hoaHongKD = 0;
  for (let i = 12; i < data.length; i++) {
    const row = data[i];
    const label13 = row[13] ? String(row[13]).trim() : '';
    const val14 = row[14] || 0;
    if (label13.includes('Tỉ lệ LNG')) tiLeLNG = val14 * 100;
    if (label13.includes('Giá dự toán')) giaDuToan = val14;
    if (label13.includes('Chi phí bảo hành')) phiBaoHanh = (row[15] || 0) * 100;
    if (label13.includes('Chi phí bán hàng')) phiBanHang = (row[15] || 0) * 100;
    if (label13.includes('Chi phí công tác')) phiCongTac = val14;
    if (label13.includes('Hoa hồng KD')) hoaHongKD = (row[15] || 0) * 100;
  }

  const projectData = {
    name: projectName,
    projectInfo: {
      tenCongTrinh: projectName,
      maDauThau: 'SQL Server Sawaco Gia Định',
      diaDiem,
      thoiGianThucHien,
      nguoiLap,
      ngayLap
    },
    items: items.length > 0 ? items : [{ tenHangHoa: '', donViTinh: 'Gói', soLuong: 1, donGiaNhap: 0 }],
    params: {
      tiLeLNG: tiLeLNG || 20,
      phiBaoHanh: phiBaoHanh || 5,
      phiBanHang: phiBanHang || 2,
      phiCongTac: phiCongTac || 0,
      hoaHongKD: hoaHongKD || 12.5,
      giaDuToan: giaDuToan || 0
    }
  };

  console.log('Logging in...');
  const login = await api('POST', '/api/login', { username: USERNAME, password: PASSWORD });
  if (login.error) { console.error('Login failed:', login.error); return; }
  const cookie = login._cookie;
  console.log('Logged in as:', login.user.fullName);

  console.log('Creating project:', projectName);
  const created = await api('POST', '/api/projects', { name: projectName }, cookie);
  if (created.error) { console.error('Create failed:', created.error); return; }
  console.log('Created with ID:', created.id);

  console.log('Updating with full data...');
  const updated = await api('PUT', '/api/projects/' + created.id, projectData, cookie);
  if (updated.error) { console.error('Update failed:', updated.error); return; }
  console.log('  Items:', updated.items.length);
  console.log('  LNG:', updated.params.tiLeLNG + '%');
  console.log('  Budget:', updated.params.giaDuToan);
  console.log('  Status:', updated.status);
  console.log('  Done!');
}

main().catch(console.error);
