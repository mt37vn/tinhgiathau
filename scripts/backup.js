const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const projectRoot = path.join(__dirname, '..');
const DATA_DIR = path.join(projectRoot, 'data');
const DEFAULT_BACKUP_DIR = path.join(projectRoot, 'backup');

const LOG_PREFIX = '[backup]';

function log(msg) {
  console.log(`${LOG_PREFIX} ${msg}`);
}
function logError(msg) {
  console.error(`${LOG_PREFIX} Lỗi: ${msg}`);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayString(d) {
  const dt = d || new Date();
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

let backupRunning = false;

function backupDir() {
  return path.resolve(projectRoot, process.env.BACKUP_DIR || './backup');
}

async function createTarball(backupFile) {
  await execFileAsync('tar', ['-czf', backupFile, '-C', DATA_DIR, '.'], {
    maxBuffer: 1024 * 1024 * 100,
  });
}

function applyRetention(dir, keep) {
  const pattern = /^backup-(\d{4}-\d{2}-\d{2})\.tar\.gz$/;
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    logError(`Không đọc được thư mục backup: ${err.message}`);
    return;
  }
  const backups = files
    .filter((f) => pattern.test(f))
    .sort();
  if (backups.length <= keep) return;
  const toDelete = backups.slice(0, backups.length - keep);
  for (const f of toDelete) {
    try {
      fs.unlinkSync(path.join(dir, f));
      log(`Đã xoá backup cũ theo retention: ${f}`);
    } catch (err) {
      logError(`Không xoá được ${f}: ${err.message}`);
    }
  }
}

async function runGit(args, cwd) {
  await execFileAsync('git', args, { cwd, maxBuffer: 1024 * 1024 * 100 });
}

async function pushOffsite(backupFile, dateStr) {
  const repo = process.env.BACKUP_GIT_REPO;
  const token = process.env.BACKUP_GIT_TOKEN || process.env.GH_WORKFLOW_TOKEN;
  if (!repo || !token) {
    log('Bỏ qua đẩy offsite — thiếu BACKUP_GIT_REPO hoặc token.');
    return;
  }
  const cloneDir = path.join(backupDir(), 'repo');
  const remote = `https://x-access-token:${token}@github.com/${repo}.git`;

  if (!fs.existsSync(path.join(cloneDir, '.git'))) {
    log(`Clone repo offsite ${repo} ...`);
    await execFileAsync('git', ['clone', remote, cloneDir], {
      maxBuffer: 1024 * 1024 * 100,
    });
  }

  await runGit(['config', 'user.name', 'backup-bot'], cloneDir);
  await runGit(['config', 'user.email', 'backup@hapro.com.vn'], cloneDir);
  await runGit(['config', 'http.postBuffer', '524288000'], cloneDir);
  await runGit(['config', 'http.version', 'HTTP/1.1'], cloneDir);

  const lsRemote = await execFileAsync('git', ['ls-remote', 'origin', 'HEAD'], {
    cwd: cloneDir,
    maxBuffer: 1024 * 1024 * 100,
  });
  if (lsRemote.stdout.trim()) {
    await runGit(['pull', '--rebase', '--autostash'], cloneDir);
  } else {
    log('Remote chưa có commit, bỏ qua pull lần đầu.');
  }

  const dest = path.join(cloneDir, path.basename(backupFile));
  fs.copyFileSync(backupFile, dest);

  await runGit(['add', path.basename(backupFile)], cloneDir);
  const staged = await execFileAsync('git', ['diff', '--cached', '--quiet'], { cwd: cloneDir }).then(
    () => false,
    () => true,
  );
  if (staged) {
    await runGit(['commit', '-m', `backup: ${dateStr}`], cloneDir);
  }
  await runGit(['push'], cloneDir);
  log(`Đã đẩy backup lên GitHub (${repo}).`);
}

async function runBackup() {
  if (process.env.BACKUP_ENABLED === 'false') {
    log('BACKUP_ENABLED=false, bỏ qua.');
    return;
  }
  if (backupRunning) {
    log('Backup đang chạy, bỏ qua lần gọi này.');
    return;
  }
  backupRunning = true;
  const startedAt = Date.now();
  const dateStr = todayString();
  const dir = backupDir();
  const backupFile = path.join(dir, `backup-${dateStr}.tar.gz`);

  try {
    fs.mkdirSync(dir, { recursive: true });

    log(`Tạo backup ${path.basename(backupFile)} ...`);
    await createTarball(backupFile);

    const keep = parseInt(process.env.BACKUP_KEEP_LOCAL || '30', 10);
    applyRetention(dir, keep);

    await pushOffsite(backupFile, dateStr);

    log(`Hoàn tất backup (${((Date.now() - startedAt) / 1000).toFixed(1)}s).`);
  } catch (err) {
    logError(`Backup thất bại: ${err.message}`);
    try {
      if (fs.existsSync(backupFile)) {
        fs.unlinkSync(backupFile);
        log(`Đã xoá file backup lỗi: ${path.basename(backupFile)}`);
      }
    } catch (cleanupErr) {
      logError(`Không xoá được file backup lỗi: ${cleanupErr.message}`);
    }
  } finally {
    backupRunning = false;
  }
}

module.exports = { runBackup };
