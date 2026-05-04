const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

const isDev = !app.isPackaged;
let mainWindow;
let nextServer;
let db;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function cb(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'library.db');
  db = new sqlite3.Database(dbPath);
  await run(`CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    content TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    fileType TEXT NOT NULL,
    toc TEXT,
    cover TEXT,
    pdfPath TEXT,
    sourceFileName TEXT
  )`);
  await run(`CREATE TABLE IF NOT EXISTS chats (
    bookId TEXT PRIMARY KEY,
    messages TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS progress (
    bookId TEXT PRIMARY KEY,
    currentPage INTEGER NOT NULL,
    lastReadAt TEXT NOT NULL
  )`);
}

async function ensureBooksDir() {
  const dir = path.join(app.getPath('userData'), 'books');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function startNextServer() {
  if (isDev) return;
  const port = process.env.PORT || '3000';
  const appPath = app.getAppPath();
  const nextBin = path.join(appPath, 'node_modules', 'next', 'dist', 'bin', 'next');
  nextServer = spawn(process.execPath, [nextBin, 'start', '-p', port], {
    cwd: appPath,
    stdio: 'ignore',
    windowsHide: true,
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL('http://127.0.0.1:3000');
}

app.whenReady().then(async () => {
  await initDb();
  await startNextServer();
  createWindow();

  ipcMain.handle('books:save-file', async (_event, payload) => {
    const booksDir = await ensureBooksDir();
    const safeName = `${Date.now()}-${payload.fileName}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPath = path.join(booksDir, safeName);
    await fs.writeFile(fullPath, Buffer.from(payload.bytes));
    return { path: fullPath };
  });

  ipcMain.handle('books:read-file', async (_event, fullPath) => {
    const bytes = await fs.readFile(fullPath);
    return Array.from(bytes);
  });

  ipcMain.handle('library:get-all', async () => {
    const booksRows = await all('SELECT * FROM books ORDER BY datetime(createdAt) DESC');
    const chatsRows = await all('SELECT * FROM chats');
    const progressRows = await all('SELECT * FROM progress');

    const books = booksRows.map((row) => ({
      ...row,
      toc: row.toc ? JSON.parse(row.toc) : [],
    }));
    const chats = {};
    for (const row of chatsRows) {
      chats[row.bookId] = JSON.parse(row.messages);
    }
    const progress = {};
    for (const row of progressRows) {
      progress[row.bookId] = row.currentPage;
    }
    return { books, chats, progress };
  });

  ipcMain.handle('library:save-book', async (_event, book) => {
    await run(
      `INSERT INTO books (id,title,author,content,createdAt,fileType,toc,cover,pdfPath,sourceFileName)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title,
         author=excluded.author,
         content=excluded.content,
         createdAt=excluded.createdAt,
         fileType=excluded.fileType,
         toc=excluded.toc,
         cover=excluded.cover,
         pdfPath=excluded.pdfPath,
         sourceFileName=excluded.sourceFileName`,
      [
        book.id,
        book.title,
        book.author || '',
        book.content,
        book.createdAt,
        book.fileType,
        JSON.stringify(book.toc || []),
        book.cover || null,
        book.pdfPath || null,
        book.sourceFileName || null,
      ],
    );
    return { ok: true };
  });

  ipcMain.handle('library:delete-book', async (_event, bookId) => {
    const rows = await all('SELECT pdfPath FROM books WHERE id = ?', [bookId]);
    const pdfPath = rows[0]?.pdfPath;
    if (pdfPath) {
      try {
        await fs.unlink(pdfPath);
      } catch {
        // ignore delete errors
      }
    }
    await run('DELETE FROM books WHERE id = ?', [bookId]);
    await run('DELETE FROM chats WHERE bookId = ?', [bookId]);
    await run('DELETE FROM progress WHERE bookId = ?', [bookId]);
    return { ok: true };
  });

  ipcMain.handle('library:save-chat', async (_event, payload) => {
    await run(
      `INSERT INTO chats (bookId,messages,updatedAt) VALUES (?,?,?)
       ON CONFLICT(bookId) DO UPDATE SET
         messages=excluded.messages,
         updatedAt=excluded.updatedAt`,
      [payload.bookId, JSON.stringify(payload.messages || []), new Date().toISOString()],
    );
    return { ok: true };
  });

  ipcMain.handle('library:save-progress', async (_event, payload) => {
    await run(
      `INSERT INTO progress (bookId,currentPage,lastReadAt) VALUES (?,?,?)
       ON CONFLICT(bookId) DO UPDATE SET
         currentPage=excluded.currentPage,
         lastReadAt=excluded.lastReadAt`,
      [payload.bookId, payload.currentPage || 0, new Date().toISOString()],
    );
    return { ok: true };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (nextServer) nextServer.kill();
});


ipcMain.handle('books:open-in-default-viewer', async (_event, fullPath) => {
  const result = await shell.openPath(fullPath);
  return { ok: !result, message: result || null };
});
