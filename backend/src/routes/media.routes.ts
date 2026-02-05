import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import { emitContentUpdate } from '../events';
import db from '../db';
import { listObjects, uploadBuffer, deleteObject, objectExists } from '../storage/r2';

const router = Router();

const requireAdminSession = async (req: Request, res: Response, next: NextFunction) => {
  const sessionHeader = req.headers['x-admin-session'];
  const sessionToken = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
  const querySession = typeof req.query.adminSession === 'string' ? req.query.adminSession : '';
  const sessionValue = sessionToken || querySession;
  if (!sessionValue) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const session = await db.one<{ id?: string; expiresAt?: string; lastSeen?: string }>(
    'SELECT id, expiresAt, lastSeen FROM admin_sessions WHERE token = ? LIMIT 1',
    [sessionValue]
  );
  if (!session?.expiresAt) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session.id) {
      await db.exec('DELETE FROM admin_sessions WHERE id = ?', [session.id]);
    }
    return res.status(401).json({ error: 'Session expired' });
  }
  const settings = await db.one<{ sessionIdleMins?: number }>(
    'SELECT sessionIdleMins FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const idleMinutes = Math.min(240, Math.max(5, Number(settings?.sessionIdleMins || 20)));
  if (session.lastSeen) {
    const lastSeen = new Date(session.lastSeen).getTime();
    if (lastSeen + idleMinutes * 60 * 1000 <= Date.now()) {
      if (session.id) {
        await db.exec('DELETE FROM admin_sessions WHERE id = ?', [session.id]);
      }
      return res.status(401).json({ error: 'Session expired' });
    }
  }
  if (session.id) {
    await db.exec('UPDATE admin_sessions SET lastSeen = ? WHERE id = ?', [
      new Date().toISOString(),
      session.id
    ]);
  }
  return next();
};

const allowedTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }
    return cb(null, true);
  }
});

const replaceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }
    return cb(null, true);
  }
});

router.get('/', requireAdminSession, async (_req, res) => {
  try {
    const files = await listObjects();
    const assets = files.map((file) => ({
      name: file,
      path: `/uploads/${file}`
    }));
    return res.json(assets);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list uploads' });
  }
});

router.post('/upload', requireAdminSession, upload.array('files', 20), async (req, res) => {
  const files = (req.files || []) as Express.Multer.File[];
  if (files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  try {
    const uploaded = await Promise.all(
      files.map(async (file) => {
        const safeName = file.originalname.replace(/\s+/g, '-');
        const stamp = Date.now();
        const name = `${stamp}-${safeName}`;
        await uploadBuffer(name, file.buffer, file.mimetype);
        return { name, path: `/uploads/${name}` };
      })
    );
    emitContentUpdate('media');
    return res.json({ uploaded });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }
});

router.put('/:name', requireAdminSession, replaceUpload.single('file'), async (req, res) => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileName = path.basename(req.params.name);
  try {
    const exists = await objectExists(fileName);
    if (!exists) {
      return res.status(404).json({ error: 'Not found' });
    }
    await uploadBuffer(fileName, file.buffer, file.mimetype);
    emitContentUpdate('media');
    return res.json({ replaced: fileName, path: `/uploads/${fileName}` });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Replace failed' });
  }
});

router.delete('/:name', requireAdminSession, async (req, res) => {
  const fileName = path.basename(req.params.name);
  try {
    const exists = await objectExists(fileName);
    if (!exists) {
      return res.status(404).json({ error: 'Not found' });
    }
    await deleteObject(fileName);
    emitContentUpdate('media');
    return res.json({ deleted: fileName });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Delete failed' });
  }
});

export default router;
