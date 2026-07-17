/**
 * trello-sync.js – Trello card sync utility
 *
 * Updates Trello card description/move list when project state changes
 * in the App Tính Giá. Fire-and-forget: errors are logged but never thrown.
 */

const fs = require('fs');
const path = require('path');

const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

function trelloApi(method, urlPath, data) {
  const base = 'https://api.trello.com/1';
  const url = new URL(base + urlPath);
  url.searchParams.set('key', TRELLO_API_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);

  return fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined
  }).then(r => {
    if (!r.ok) {
      console.error('[trello-sync] API error', r.status, r.statusText);
    }
    return r.json().catch(() => null);
  }).catch(e => {
    console.error('[trello-sync] Network error:', e.message);
    return null;
  });
}

function fmt(n) {
  if (n === 0 || !n) return '0';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function toDateStr(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return s;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

function buildDescription(project) {
  const info = project.projectInfo || {};
  const params = project.params || {};
  const items = project.items || [];

  const tongGiaNhap = items.reduce((s, i) => s + (i.soLuong || 0) * (i.donGiaNhap || 0), 0);
  const tiLeLNG = params.tiLeLNG || 0;
  const giaChaoToiThieu = tiLeLNG >= 100 ? 0 : (tiLeLNG > 0 ? Math.round(tongGiaNhap / (1 - tiLeLNG / 100)) : tongGiaNhap);
  const loiNhuanGop = giaChaoToiThieu - tongGiaNhap;

  const statusLabels = { draft: 'Đang chuẩn bị hồ sơ', pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Không duyệt' };
  const krLabels = { win: 'Trúng thầu', lose: 'Trượt thầu' };

  let desc = `### 📊 Kết quả tính giá dự thầu\n---\n`;
  desc += `- **Mã đấu thầu:** ${info.maDauThau || 'N/A'}\n`;
  desc += `- **Tên dự án:** ${info.tenCongTrinh || project.name || 'N/A'}\n`;
  desc += `- **Bên mời thầu:** ${info.benMoiThau || 'N/A'}\n`;
  desc += `- **Trạng thái:** ${statusLabels[project.status] || project.status}\n`;
  if (project.ketQuaTrungThau) {
    desc += `- **Kết quả:** ${krLabels[project.ketQuaTrungThau] || project.ketQuaTrungThau}\n`;
  }
  if (project.giaTrungThau) {
    desc += `- **Giá trúng thầu:** ${fmt(project.giaTrungThau)} VND\n`;
  }
  desc += `\n### 💰 Tính toán giá\n`;
  desc += `- **Tổng giá nhập:** ${fmt(tongGiaNhap)} VND\n`;
  desc += `- **Giá chào tối thiểu:** ${fmt(giaChaoToiThieu)} VND\n`;
  desc += `- **Lợi nhuận gộp:** ${fmt(loiNhuanGop)} VND\n`;
  desc += `- **Tỷ lệ LNG:** ${tiLeLNG}%\n`;

  if (items.length > 0) {
    desc += `\n### 📋 Danh mục hàng hóa\n`;
    desc += `| TT | Tên hàng hóa | ĐVT | SL | Đơn giá nhập | Giá chào |\n`;
    desc += `|----|-------------|-----|----|-------------|----------|\n`;
    for (const item of items) {
      const dgc = item.donGiaChao || 0;
      desc += `| ${item.stt || ''} | ${item.tenHangHoa || ''} | ${item.donViTinh || ''} | ${item.soLuong || 0} | ${fmt(item.donGiaNhap || 0)} | ${fmt(dgc)} |\n`;
    }
  }

  desc += `\n---\n*Tự động cập nhật từ Phần Mềm Tính Giá Chào Thầu*`;
  return desc;
}

async function updateTrelloCardDescription(trelloCardId, project) {
  if (!TRELLO_API_KEY || !TRELLO_TOKEN || !trelloCardId) return;
  const desc = buildDescription(project);
  console.log(`[trello-sync] Updating description for card ${trelloCardId}`);
  await trelloApi('PUT', `/cards/${trelloCardId}`, { desc });
}

async function moveTrelloCard(trelloCardId, listId) {
  if (!TRELLO_API_KEY || !TRELLO_TOKEN || !trelloCardId || !listId) return;
  console.log(`[trello-sync] Moving card ${trelloCardId} to list ${listId}`);
  await trelloApi('PUT', `/cards/${trelloCardId}`, { idList: listId });
}

async function syncProjectToTrello(project) {
  if (!TRELLO_API_KEY || !TRELLO_TOKEN) return;

  const trelloCardId = project.trello_card_id;
  if (!trelloCardId) return;

  const trelloListPreparing = process.env.TRELLO_LIST_PREPARING;

  // Update description with calculated results
  await updateTrelloCardDescription(trelloCardId, project);

  // Move card based on status
  const status = project.status || 'draft';
  if (status === 'draft' && trelloListPreparing) {
    await moveTrelloCard(trelloCardId, trelloListPreparing);
  } else if (status === 'approved' && process.env.TRELLO_LIST_APPROVED) {
    await moveTrelloCard(trelloCardId, process.env.TRELLO_LIST_APPROVED);
  }

  // Move card based on bid result
  const kr = project.ketQuaTrungThau;
  if (kr === 'win' && process.env.TRELLO_LIST_WIN) {
    await moveTrelloCard(trelloCardId, process.env.TRELLO_LIST_WIN);
  } else if (kr === 'lose' && process.env.TRELLO_LIST_LOSE) {
    await moveTrelloCard(trelloCardId, process.env.TRELLO_LIST_LOSE);
  }
}

module.exports = { updateTrelloCardDescription, moveTrelloCard, syncProjectToTrello };
