import type { Request, Response } from 'express';
import {
  generateBackupCodes,
  getSettingsPayload,
  revokeTrustedDevices,
  setupTotp,
  verifyTotpCode,
  testSmtp,
  verifySmtp,
  restoreSmtp,
  getSmtpLogs,
  updateSettings
} from './service';

export const getSettings = async (_req: Request, res: Response) => {
  return res.json(await getSettingsPayload());
};

export const postTotpSetup = async (_req: Request, res: Response) => {
  const result = await setupTotp();
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};

export const postTotpVerify = async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'OTP code is required' });
  }
  const result = await verifyTotpCode(code);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};

export const postBackupCodes = async (_req: Request, res: Response) => {
  const result = await generateBackupCodes();
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};

export const postRevokeTrustedDevices = async (_req: Request, res: Response) => {
  const result = await revokeTrustedDevices();
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};

export const postSmtpTest = async (req: Request, res: Response) => {
  const { to } = req.body as { to?: string };
  if (!to || typeof to !== 'string') {
    return res.status(400).json({ error: 'Recipient email is required' });
  }
  const result = await testSmtp(to);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};

export const postSmtpVerify = async (req: Request, res: Response) => {
  const result = await verifySmtp(req.body as {
    smtpHost?: string;
    smtpPort?: number | string;
    smtpSecure?: boolean | string;
    smtpUser?: string;
    smtpPass?: string;
    smtpFrom?: string;
  });
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};

export const postSmtpRestore = async (_req: Request, res: Response) => {
  const result = await restoreSmtp();
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};

export const getSmtpLogsHandler = async (req: Request, res: Response) => {
  const limit = Number(req.query.limit || 50);
  return res.json(await getSmtpLogs(limit));
};

export const putSettings = async (req: Request, res: Response) => {
  const result = await updateSettings(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};
