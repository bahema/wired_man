import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { adminApi } from '../services/adminApi';
import { SMTP_PROVIDER_PRESETS } from '../data/smtpProviders';

type FormState = {
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  organizationName: string;
  adminEmail: string;
  smtpProvider: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  require2fa: boolean;
  verificationMethod: string;
  otpLength: string;
  otpExpiry: string;
  backupCodesEnabled: boolean;
  trustDuration: string;
  rememberDeviceDefault: boolean;
  alertsEnabled: boolean;
  alertRecipients: string;
  alertFrequency: string;
  maxFailedAttempts: string;
  cooldownSeconds: string;
  sessionIdleMins: string;
  sessionMaxHours: string;
};

export default function BossSettingsPage() {
  const initialState = useMemo<FormState>(
    () => ({
      senderName: 'Work Pays Boss',
      senderEmail: 'boss@workpays.com',
      replyToEmail: 'reply@workpays.com',
      organizationName: 'Work Pays',
      adminEmail: 'boss@workpays.com',
      smtpProvider: 'custom',
      smtpHost: '',
      smtpPort: '587',
      smtpSecure: false,
      smtpUser: '',
      smtpPass: '',
      smtpFrom: 'boss@workpays.com',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      require2fa: true,
      verificationMethod: 'email',
      otpLength: '6',
      otpExpiry: '10',
      backupCodesEnabled: true,
      trustDuration: '30',
      rememberDeviceDefault: true,
      alertsEnabled: true,
      alertRecipients: 'security@workpays.com',
      alertFrequency: 'instant',
      maxFailedAttempts: '3',
      cooldownSeconds: '30',
      sessionIdleMins: '20',
      sessionMaxHours: '8'
    }),
    []
  );
  const [formState, setFormState] = useState<FormState>(initialState);
  const [smtpLastKnownGood, setSmtpLastKnownGood] = useState<boolean | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [smtpHasBackup, setSmtpHasBackup] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpUrl, setTotpUrl] = useState('');
  const [totpMessage, setTotpMessage] = useState('');
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpVerifyStatus, setTotpVerifyStatus] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesConfirmed, setBackupCodesConfirmed] = useState(false);
  const [trustedMessage, setTrustedMessage] = useState('');
  const [smtpTestStatus, setSmtpTestStatus] = useState('');
  const [smtpTestStatusType, setSmtpTestStatusType] = useState<'success' | 'error' | ''>('');
  const [smtpFieldErrors, setSmtpFieldErrors] = useState<Partial<Record<'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPass' | 'smtpFrom', string>>>({});
  const [settingsLoadError, setSettingsLoadError] = useState('');
  const [singleAdminMode, setSingleAdminMode] = useState<boolean | null>(null);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const smtpBaselineRef = React.useRef<{
    smtpHost: string;
    smtpPort: string;
    smtpSecure: boolean;
    smtpUser: string;
    smtpFrom: string;
  } | null>(null);
  const [passwordTouched, setPasswordTouched] = useState({
    current: false,
    next: false,
    confirm: false
  });

  const applySettings = (settings: NonNullable<Awaited<ReturnType<typeof adminApi.getSettings>>>) => {
    setFormState((prev) => ({
      ...prev,
      senderName: settings.senderName,
      senderEmail: settings.senderEmail,
      replyToEmail: settings.replyToEmail,
      organizationName: settings.organizationName,
      adminEmail: settings.adminEmail,
      smtpProvider: settings.smtpProvider || 'custom',
      smtpHost: settings.smtpHost || '',
      smtpPort: settings.smtpPort ? String(settings.smtpPort) : '',
      smtpSecure: Boolean(settings.smtpSecure),
      smtpUser: settings.smtpUser || '',
      smtpPass: '',
      smtpFrom: settings.smtpFrom || settings.senderEmail,
      require2fa: settings.require2fa,
      verificationMethod: settings.verificationMethod,
      otpLength: String(settings.otpLength),
      otpExpiry: String(settings.otpExpiry),
      backupCodesEnabled: settings.backupCodesEnabled,
      trustDuration: String(settings.trustDuration),
      rememberDeviceDefault: settings.rememberDeviceDefault,
      alertsEnabled: settings.alertsEnabled,
      alertRecipients: settings.alertRecipients,
      alertFrequency: settings.alertFrequency,
      maxFailedAttempts: String(settings.maxFailedAttempts),
      cooldownSeconds: String(settings.cooldownSeconds),
      sessionIdleMins: String(settings.sessionIdleMins),
      sessionMaxHours: String(settings.sessionMaxHours)
    }));
    setSmtpLastKnownGood(settings.smtpLastKnownGood ?? null);
    setSmtpConfigured(settings.smtpConfigured ?? null);
    setSmtpHasBackup(Boolean(settings.smtpHasBackup));
    setSingleAdminMode(settings.singleAdminMode ?? null);
    smtpBaselineRef.current = {
      smtpHost: settings.smtpHost || '',
      smtpPort: settings.smtpPort ? String(settings.smtpPort) : '',
      smtpSecure: Boolean(settings.smtpSecure),
      smtpUser: settings.smtpUser || '',
      smtpFrom: settings.smtpFrom || settings.senderEmail
    };
  };

  const loadSettings = async (active?: { current: boolean }) => {
    try {
      const settings = await adminApi.getSettings();
      if (!settings || (active && !active.current)) return;
      applySettings(settings);
    } catch (error) {
      if (active && !active.current) return;
      const message = error instanceof Error ? error.message : 'Failed to load settings.';
      setErrorMessage(message);
      setSettingsLoadError(message);
    } finally {
      if (!active || active.current) {
        setLoadingSettings(false);
      }
    }
  };

  const updateField =
    (field: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value =
        event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value;
      setFormState((prev) => ({ ...prev, [field]: value }));
    };
  const updatePasswordField =
    (field: 'currentPassword' | 'newPassword' | 'confirmPassword', key: 'current' | 'next' | 'confirm') =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPasswordTouched((prev) => ({ ...prev, [key]: true }));
      setFormState((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    const preset = SMTP_PROVIDER_PRESETS.find((item) => item.id === next);
    if (!preset) {
      setFormState((prev) => ({ ...prev, smtpProvider: next }));
      return;
    }
    setFormState((prev) => ({
      ...prev,
      smtpProvider: preset.id,
      smtpHost: preset.host,
      smtpPort: String(preset.port),
      smtpSecure: preset.secure
    }));
  };

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const hasSmtpRequiredFields = Boolean(
    formState.smtpHost && formState.smtpPort && formState.smtpUser && formState.smtpFrom
  );
  const hasSmtpPassword = Boolean(formState.smtpPass);
  const isSmtpConfigured = hasSmtpRequiredFields && (hasSmtpPassword || smtpConfigured);
  const smtpStatus: 'not_configured' | 'configured' | 'verified' = isSmtpConfigured
    ? smtpLastKnownGood
      ? 'verified'
      : 'configured'
    : 'not_configured';
  const showOtpReadinessWarning =
    (formState.require2fa || formState.verificationMethod === 'email') && smtpStatus !== 'verified';
  const isGmailAuthError = /535|BadCredentials|5\.7\.8/i.test(smtpTestStatus);
  const formatSmtpError = (message: string) => {
    if (/535-5\.7\.8|BadCredentials/i.test(message)) {
      return `${message}\nGmail rejected the credentials. Confirm 2FA is on, use a 16-character app password, and match SMTP user to the Gmail address.`;
    }
    return message;
  };

  useEffect(() => {
    const active = { current: true };
    void loadSettings(active);
    return () => {
      active.current = false;
    };
  }, []);

  const handleReset = async () => {
    setStatusMessage('');
    setErrorMessage('');
    setLoadingSettings(true);
    await loadSettings();
    setStatusMessage('Settings reloaded from server.');
  };

  const handleSave = async () => {
    setStatusMessage('');
    setErrorMessage('');
    setSmtpTestStatus('');
    setSmtpTestStatusType('');
    setSmtpFieldErrors({});

    const emailsToCheck = [
      { label: 'Sender email', value: formState.senderEmail },
      { label: 'Reply-to email', value: formState.replyToEmail },
      { label: 'Admin login email', value: formState.adminEmail }
    ];

    const invalidEmail = emailsToCheck.find((entry) => !emailPattern.test(entry.value));
    if (invalidEmail) {
      setErrorMessage(`${invalidEmail.label} is not a valid email address.`);
      return;
    }

    if (formState.alertRecipients && !emailPattern.test(formState.alertRecipients)) {
      setErrorMessage('Alert recipients must be a valid email address.');
      return;
    }

    const otpLength = Number(formState.otpLength);
    const otpExpiry = Number(formState.otpExpiry);
    if (!Number.isFinite(otpLength) || otpLength < 4 || otpLength > 8) {
      setErrorMessage('OTP length must be between 4 and 8 digits.');
      return;
    }
    if (!Number.isFinite(otpExpiry) || otpExpiry < 1 || otpExpiry > 60) {
      setErrorMessage('OTP expiry must be between 1 and 60 minutes.');
      return;
    }

    const hasPasswordChange = formState.newPassword.length > 0 || formState.confirmPassword.length > 0;
    if (hasPasswordChange && formState.newPassword !== formState.confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    if (hasPasswordChange && formState.currentPassword.length === 0) {
      setErrorMessage('Enter your current password to set a new one.');
      return;
    }

    setSavingSettings(true);
    try {
      const baseline = smtpBaselineRef.current;
      const hasSmtpChanges =
        !baseline ||
        baseline.smtpHost !== formState.smtpHost ||
        baseline.smtpPort !== formState.smtpPort ||
        baseline.smtpSecure !== formState.smtpSecure ||
        baseline.smtpUser !== formState.smtpUser ||
        baseline.smtpFrom !== formState.smtpFrom;
      if (hasSmtpChanges || formState.smtpPass) {
        if (!formState.smtpPass.trim()) {
          setSavingSettings(false);
          setErrorMessage('Enter the SMTP password to save changes.');
          return;
        }
        const isGmailHost =
          formState.smtpProvider === 'gmail' ||
          formState.smtpHost.toLowerCase().includes('gmail');
        if (isGmailHost && formState.smtpPass.replace(/\s/g, '').length !== 16) {
          setSavingSettings(false);
          setErrorMessage('Gmail requires a 16-character app password.');
          return;
        }
      }
      const includePasswordChange = passwordTouched.current || passwordTouched.next || passwordTouched.confirm;
      const updatePayload: Parameters<typeof adminApi.updateSettings>[0] = {
        senderName: formState.senderName,
        senderEmail: formState.senderEmail,
        replyToEmail: formState.replyToEmail,
        organizationName: formState.organizationName,
        adminEmail: formState.adminEmail,
        smtpProvider: formState.smtpProvider,
        smtpHost: formState.smtpHost,
        smtpPort: formState.smtpPort,
        smtpSecure: formState.smtpSecure,
        smtpUser: formState.smtpUser,
        smtpPass: formState.smtpPass,
        smtpFrom: formState.smtpFrom,
        require2fa: formState.require2fa,
        verificationMethod: formState.verificationMethod,
        otpLength: Number(formState.otpLength),
        otpExpiry: Number(formState.otpExpiry),
        backupCodesEnabled: formState.backupCodesEnabled,
        trustDuration: Number(formState.trustDuration),
        rememberDeviceDefault: formState.rememberDeviceDefault,
        alertsEnabled: formState.alertsEnabled,
        alertRecipients: formState.alertRecipients,
        alertFrequency: formState.alertFrequency,
        maxFailedAttempts: Number(formState.maxFailedAttempts),
        cooldownSeconds: Number(formState.cooldownSeconds),
        sessionIdleMins: Number(formState.sessionIdleMins),
        sessionMaxHours: Number(formState.sessionMaxHours),
        ...(includePasswordChange
          ? {
              currentPassword: formState.currentPassword,
              newPassword: formState.newPassword,
              confirmPassword: formState.confirmPassword
            }
          : {})
      };
      await adminApi.updateSettings(updatePayload);
      await loadSettings();
      setFormState((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
      setPasswordTouched({ current: false, next: false, confirm: false });
      localStorage.setItem(
        'boss-sender-defaults',
        JSON.stringify({
          senderName: formState.senderName,
          senderEmail: formState.senderEmail,
          replyToEmail: formState.replyToEmail
        })
      );
      setStatusMessage('Settings saved. Use "Send Test Email" to verify SMTP.');
    } catch (error) {
      const payload = (error as { data?: { error?: string } }).data;
      const detail = payload?.error ? ` (${payload.error})` : '';
      const baseMessage =
        error instanceof Error ? `${error.message}${detail}` : `Failed to save settings.${detail}`;
      setErrorMessage(formatSmtpError(baseMessage));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTotpSetup = async () => {
    setTotpMessage('');
    setTotpVerifyStatus('');
    try {
      const result = await adminApi.setupTotp();
      setTotpSecret(result.secret);
      setTotpUrl(result.otpauthUrl);
      setTotpMessage('Authenticator app secret generated.');
    } catch (error) {
      setTotpMessage(error instanceof Error ? error.message : 'Failed to setup authenticator app.');
    }
  };

  const handleBackupCodes = async () => {
    try {
      const result = await adminApi.generateBackupCodes();
      setBackupCodes(result.codes || []);
      setBackupCodesConfirmed(false);
    } catch (error) {
      setTotpMessage(error instanceof Error ? error.message : 'Failed to generate backup codes.');
    }
  };

  const handleDownloadBackupCodes = () => {
    const content = backupCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bossdesk-backup-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBackupCodesConfirmed(true);
  };

  const handleTotpVerify = async () => {
    if (!totpVerifyCode.trim()) {
      setTotpVerifyStatus('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setTotpVerifyStatus('');
    try {
      await adminApi.verifyTotp(totpVerifyCode.trim());
      setTotpVerifyStatus('Authenticator app verified.');
    } catch (error) {
      setTotpVerifyStatus(error instanceof Error ? error.message : 'OTP verification failed.');
    }
  };

  const handleRevokeTrusted = async () => {
    setTrustedMessage('');
    try {
      await adminApi.revokeTrustedDevices();
      setTrustedMessage('Trusted devices revoked.');
      localStorage.removeItem('boss-trusted-device');
    } catch (error) {
      setTrustedMessage(error instanceof Error ? error.message : 'Failed to revoke trusted devices.');
    }
  };

  const handleSmtpTest = async () => {
    setSmtpTestStatus('');
    setSmtpTestStatusType('');
    setSmtpFieldErrors({});
    const nextErrors: Partial<Record<'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPass' | 'smtpFrom', string>> = {};
    if (!formState.smtpHost.trim()) nextErrors.smtpHost = 'SMTP host is required.';
    if (!formState.smtpPort.trim()) nextErrors.smtpPort = 'SMTP port is required.';
    if (!formState.smtpUser.trim()) nextErrors.smtpUser = 'SMTP username is required.';
    if (!formState.smtpPass.trim()) nextErrors.smtpPass = 'SMTP password is required.';
    if (!formState.smtpFrom.trim()) nextErrors.smtpFrom = 'From email is required.';
    if (Object.keys(nextErrors).length > 0) {
      setSmtpFieldErrors(nextErrors);
      setSmtpTestStatusType('error');
      setSmtpTestStatus('Fill in the required SMTP fields before testing.');
      return;
    }
    const recipient = formState.adminEmail || formState.senderEmail;
    if (!recipient) {
      setSmtpTestStatus('Enter an admin email to send the test.');
      setSmtpTestStatusType('error');
      return;
    }
    try {
      await adminApi.testSmtp(recipient);
      setSmtpTestStatus(`Test email sent to ${recipient}.`);
      setSmtpTestStatusType('success');
    } catch (error) {
      setSmtpTestStatus(error instanceof Error ? error.message : 'SMTP test failed.');
      setSmtpTestStatusType('error');
    }
  };

  const handleSmtpRestore = async () => {
    setSmtpTestStatus('');
    try {
      await adminApi.restoreSmtp();
      setSmtpTestStatus('SMTP settings restored to last verified config.');
      const settings = await adminApi.getSettings();
      if (settings) {
        setFormState((prev) => ({
          ...prev,
          smtpProvider: settings.smtpProvider || 'custom',
          smtpHost: settings.smtpHost || '',
          smtpPort: settings.smtpPort ? String(settings.smtpPort) : '',
          smtpSecure: Boolean(settings.smtpSecure),
          smtpUser: settings.smtpUser || '',
          smtpPass: '',
          smtpFrom: settings.smtpFrom || settings.senderEmail
        }));
        setSmtpLastKnownGood(settings.smtpLastKnownGood ?? null);
        setSmtpConfigured(settings.smtpConfigured ?? null);
        setSmtpHasBackup(Boolean(settings.smtpHasBackup));
      }
    } catch (error) {
      setSmtpTestStatus(error instanceof Error ? error.message : 'SMTP restore failed.');
    }
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Update admin login controls, security preferences, and sender defaults.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleReset} disabled={savingSettings || loadingSettings}>
              Reset
            </Button>
            <Button onClick={handleSave} disabled={savingSettings || loadingSettings}>
              {savingSettings ? 'Saving...' : 'Save Changes'}
            </Button>
            <div className="w-full text-xs text-slate-500">
              Save stores settings only. Use “Send Test Email” to verify SMTP.
            </div>
          </div>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}

        {showOtpReadinessWarning ? (
          <Card className="p-4 text-sm text-amber-700">
            OTP login emails require SMTP. Configure Email Sending and run “Send Test Email” to verify.
          </Card>
        ) : null}

        {statusMessage ? (
          <Card className="p-4 text-sm text-emerald-700">{statusMessage}</Card>
        ) : null}

        {loadingSettings ? (
          <Card className="p-4 text-sm text-slate-500">Loading settings...</Card>
        ) : null}

        {settingsLoadError ? (
          <Card className="p-4 text-sm text-amber-700">
            Settings could not load. Please log in again or refresh.
          </Card>
        ) : null}

        <Card className="p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Email Sending</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Configure sender identity and SMTP delivery.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                smtpStatus === 'verified'
                  ? 'bg-emerald-100 text-emerald-700'
                  : smtpStatus === 'configured'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              {smtpStatus === 'verified' ? 'Verified' : smtpStatus === 'configured' ? 'Configured' : 'Not configured'}
            </span>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sender Identity (headers only)</h4>
            <p className="mt-1 text-xs text-slate-500">
              These fields control the From/Reply-To headers shown to recipients. They do NOT authenticate SMTP.
              SMTP Username/Password below are the real mail server login.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input label="Sender name" value={formState.senderName} onChange={updateField('senderName')} />
              <div className="space-y-2">
                <Input
                  label="Sending email (webmail)"
                  type="email"
                  value={formState.senderEmail}
                  onChange={updateField('senderEmail')}
                />
                <p className="text-xs text-slate-500">Use the webmail address that sends campaigns.</p>
              </div>
              <div className="space-y-2">
                <Input
                  label="Reply-to email"
                  type="email"
                  value={formState.replyToEmail}
                  onChange={updateField('replyToEmail')}
                />
                <p className="text-xs text-slate-500">Replies and customer responses go here.</p>
              </div>
              <div className="rounded-xl border border-border-subtle bg-panel p-3 text-xs text-slate-600 dark:text-slate-300 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Sender Preview</p>
                <p className="mt-2 text-sm text-slate-900 dark:text-slate-100">
                  From: {formState.senderName || 'Sender'} &lt;{formState.smtpFrom || formState.senderEmail}&gt;
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Reply-to: {formState.replyToEmail || formState.senderEmail}
                </p>
              </div>
              <div className="space-y-2">
                <Input
                  label="Organization name"
                  value={formState.organizationName}
                  onChange={updateField('organizationName')}
                />
                <p className="text-xs text-slate-500">Shown in sender footers and templates.</p>
              </div>
              <div className="space-y-2">
                <Input
                  label="Admin login email (Gmail)"
                  type="email"
                  value={formState.adminEmail}
                  onChange={updateField('adminEmail')}
                />
                <p className="text-xs text-slate-500">This is the login email you use to access the Boss desk.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">SMTP Delivery (mail transport)</h4>
              <span className="text-xs font-semibold text-slate-500">
                {smtpLastKnownGood ? 'Verified' : 'Not verified'}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              SMTP credentials are required to send OTP, alerts, and password change emails.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-xs text-text-muted sm:text-sm sm:col-span-2">
                <span className="font-medium text-text">SMTP provider</span>
                <select
                  className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-text shadow-sm"
                  value={formState.smtpProvider}
                  onChange={handleProviderChange}
                >
                  {SMTP_PROVIDER_PRESETS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2 rounded-xl border border-border-subtle bg-panel p-3 text-xs text-slate-600 dark:text-slate-300">
                {SMTP_PROVIDER_PRESETS.find((preset) => preset.id === formState.smtpProvider)?.note ||
                  'Configure SMTP to match your provider.'}
              </div>
              <div className="space-y-1">
                <Input label="SMTP host" value={formState.smtpHost} onChange={updateField('smtpHost')} />
                {smtpFieldErrors.smtpHost ? (
                  <div className="text-xs text-red-600">{smtpFieldErrors.smtpHost}</div>
                ) : null}
              </div>
              <div className="space-y-1">
                <Input label="SMTP port" value={formState.smtpPort} onChange={updateField('smtpPort')} />
                {smtpFieldErrors.smtpPort ? (
                  <div className="text-xs text-red-600">{smtpFieldErrors.smtpPort}</div>
                ) : null}
              </div>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-panel-elevated p-3 text-sm text-slate-600 dark:text-slate-300 sm:col-span-2">
                <span className="font-medium text-slate-900 dark:text-slate-100">Use SSL/TLS (secure)</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={formState.smtpSecure}
                  onChange={updateField('smtpSecure')}
                />
              </label>
              <div className="space-y-1">
                <Input label="SMTP username" value={formState.smtpUser} onChange={updateField('smtpUser')} />
                {smtpFieldErrors.smtpUser ? (
                  <div className="text-xs text-red-600">{smtpFieldErrors.smtpUser}</div>
                ) : null}
              </div>
              <div className="space-y-1">
                <Input
                  label="SMTP password"
                  type={showSmtpPassword ? 'text' : 'password'}
                  value={formState.smtpPass}
                  onChange={updateField('smtpPass')}
                  autoComplete="new-password"
                  name="smtp-pass"
                />
                <div className="text-xs text-slate-500">
                  Stored securely and not shown here. Re-enter only if changing SMTP settings.
                </div>
                {smtpFieldErrors.smtpPass ? (
                  <div className="text-xs text-red-600">{smtpFieldErrors.smtpPass}</div>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={showSmtpPassword}
                  onChange={(event) => setShowSmtpPassword(event.target.checked)}
                />
                Show SMTP password
              </label>
              <div className="space-y-1">
                <Input label="From email" type="email" value={formState.smtpFrom} onChange={updateField('smtpFrom')} />
                {smtpFieldErrors.smtpFrom ? (
                  <div className="text-xs text-red-600">{smtpFieldErrors.smtpFrom}</div>
                ) : null}
              </div>
              {smtpConfigured === false ? (
                <p className="text-xs text-amber-600 sm:col-span-2">
                  SMTP is not configured yet. Sender profile can be saved now, but email delivery will fail
                  until SMTP is set.
                </p>
              ) : null}
              {smtpTestStatus ? (
                <div
                  className={`rounded-xl border px-3 py-2 text-xs sm:col-span-2 ${
                    smtpTestStatusType === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  <div className="font-semibold">Last Test Result</div>
                  <div className="mt-1 whitespace-pre-wrap">{smtpTestStatus}</div>
                </div>
              ) : null}
              {smtpTestStatusType === 'error' && isGmailAuthError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:col-span-2">
                  <div className="font-semibold">Gmail checklist:</div>
                  <ol className="mt-1 list-decimal pl-4 space-y-1">
                    <li>Turn on Google 2-Step Verification.</li>
                    <li>Create an App Password (16 characters).</li>
                    <li>SMTP username must be the SAME Gmail address that created the App Password.</li>
                    <li>
                      Use: smtp.gmail.com + port 465 + smtpSecure=true OR smtp.gmail.com + port 587 + smtpSecure=false.
                    </li>
                  </ol>
                  <div className="mt-2">Normal Gmail password will not work. Use an App Password.</div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <Button variant="outline" onClick={handleSmtpTest}>Send Test Email</Button>
                {smtpHasBackup ? (
                  <Button variant="outline" onClick={handleSmtpRestore}>Restore Last Verified</Button>
                ) : null}
                {smtpLastKnownGood === false ? (
                  <span className="text-xs text-amber-600">SMTP not verified. Run a test email.</span>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Security</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Admin login, sessions, 2FA, and recovery settings.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Password Change</h4>
            <p className="mt-1 text-xs text-slate-500">
              Update admin login credentials. Password updates apply on next login.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Input
                  label="Admin login email (Gmail)"
                  type="email"
                  value={formState.adminEmail}
                  onChange={updateField('adminEmail')}
                />
                <p className="text-xs text-slate-500">This is the login email you use to access the Boss desk.</p>
              </div>
              <div className="sm:col-span-2 grid gap-4 sm:grid-cols-3">
                <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                  <span className="font-medium text-text">Current password</span>
                  <div className="relative">
                    <input
                      className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 pr-16 text-text shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={formState.currentPassword}
                      onChange={updatePasswordField('currentPassword', 'current')}
                      autoComplete="off"
                      name="admin-current-password"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                    >
                      {showCurrentPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                  <span className="font-medium text-text">New password</span>
                  <div className="relative">
                    <input
                      className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 pr-16 text-text shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      type={showNewPassword ? 'text' : 'password'}
                      value={formState.newPassword}
                      onChange={updatePasswordField('newPassword', 'next')}
                      autoComplete="new-password"
                      name="admin-new-password"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                    >
                      {showNewPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                  <span className="font-medium text-text">Confirm password</span>
                  <div className="relative">
                    <input
                      className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 pr-16 text-text shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formState.confirmPassword}
                      onChange={updatePasswordField('confirmPassword', 'confirm')}
                      autoComplete="new-password"
                      name="admin-confirm-password"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Leave new password fields empty to keep the current password.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Current passwords are not viewable for security reasons. You can update it anytime above.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Password updates send a confirmation email to the admin address.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-panel-elevated p-3 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-slate-100">Single-admin mode (read-only)</span>
            <span className="rounded-full border border-border-subtle bg-panel px-3 py-1 text-xs font-semibold text-slate-600">
              {singleAdminMode ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Auto-enabled after the first admin is created. It cannot be changed from this screen.
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sessions</h4>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Session limits for admin sessions.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input
                  label="Session idle timeout (mins)"
                  type="number"
                  min="5"
                  value={formState.sessionIdleMins}
                  onChange={updateField('sessionIdleMins')}
                />
                <Input
                  label="Session max duration (hours)"
                  type="number"
                  min="1"
                  value={formState.sessionMaxHours}
                  onChange={updateField('sessionMaxHours')}
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Sessions expire when idle or after max duration.
              </p>
            </Card>

            <Card className="p-6">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Login Throttle</h4>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Control failed login throttling.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input
                  label="Max failed attempts"
                  type="number"
                  min="1"
                  value={formState.maxFailedAttempts}
                  onChange={updateField('maxFailedAttempts')}
                />
                <Input
                  label="Cooldown seconds"
                  type="number"
                  min="10"
                  value={formState.cooldownSeconds}
                  onChange={updateField('cooldownSeconds')}
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Failed logins can trigger cooldown.
              </p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">2FA & Verification</h4>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Require a verification step during login.
              </p>
              <div className="mt-4 space-y-4">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-panel-elevated p-3 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-slate-100">Require 2FA for admins</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={formState.require2fa}
                    onChange={updateField('require2fa')}
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-slate-100">Verification method</span>
                  <select
                    className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-2.5 text-sm text-slate-900 shadow-sm dark:text-slate-100"
                    value={formState.verificationMethod}
                    onChange={updateField('verificationMethod')}
                  >
                    <option value="email">Email OTP</option>
                    <option value="app">Authenticator App</option>
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="OTP length" value={formState.otpLength} onChange={updateField('otpLength')} />
                  <Input label="OTP expiry (minutes)" value={formState.otpExpiry} onChange={updateField('otpExpiry')} />
                </div>
                <p className="text-xs text-slate-500">
                  OTP length and expiry are enforced on login attempts.
                </p>
                <div className="grid gap-2">
                  <Button variant="outline" onClick={handleTotpSetup}>Setup Authenticator App</Button>
                  {totpMessage ? (
                    <p className="text-xs text-slate-500">{totpMessage}</p>
                  ) : null}
                  {totpSecret ? (
                    <div className="grid gap-2">
                      <Input
                        label="Authenticator code"
                        type="text"
                        value={totpVerifyCode}
                        onChange={(event) => setTotpVerifyCode(event.target.value)}
                      />
                      <Button variant="outline" onClick={handleTotpVerify}>
                        Verify Authenticator
                      </Button>
                      {totpVerifyStatus ? (
                        <p className="text-xs text-slate-500">{totpVerifyStatus}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {totpSecret ? (
                    <div className="rounded-xl border border-border-subtle bg-panel p-3 text-xs text-slate-600 dark:text-slate-300">
                      Secret: <span className="font-mono">{totpSecret}</span>
                      {totpUrl ? (
                        <p className="mt-2 break-all">OTP URL: {totpUrl}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Trusted Devices</h4>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Control how long trusted devices stay active.
              </p>
              <div className="mt-4 space-y-4">
                <label className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-slate-100">Trust duration</span>
                  <select
                    className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-2.5 text-sm text-slate-900 shadow-sm dark:text-slate-100"
                    value={formState.trustDuration}
                    onChange={updateField('trustDuration')}
                  >
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-panel-elevated p-3 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    Default to “remember this device”
                  </span>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={formState.rememberDeviceDefault}
                    onChange={updateField('rememberDeviceDefault')}
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Trusted devices bypass 2FA for the selected duration.
                </p>
                <Button variant="outline" onClick={handleRevokeTrusted}>Revoke All Trusted Devices</Button>
                {trustedMessage ? (
                  <p className="text-xs text-slate-500">{trustedMessage}</p>
                ) : null}
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Backup Codes</h4>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Generate backup codes for account recovery.
              </p>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-panel-elevated p-3 text-sm text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-900 dark:text-slate-100">Backup codes enabled</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={formState.backupCodesEnabled}
                  onChange={updateField('backupCodesEnabled')}
                />
              </label>
              <div className="mt-4 grid gap-2">
                <Button variant="outline" onClick={handleBackupCodes}>Generate Backup Codes</Button>
                {backupCodes.length ? (
                  <div className="rounded-xl border border-border-subtle bg-panel p-3 text-xs text-slate-600 dark:text-slate-300">
                    <p className="mb-2 font-medium text-slate-900 dark:text-slate-100">Backup codes</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {backupCodes.map((code) => (
                        <span key={code} className="font-mono">{code}</span>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={handleDownloadBackupCodes}>
                        Download Codes
                      </Button>
                      {backupCodesConfirmed ? (
                        <span className="text-xs text-emerald-600">Saved</span>
                      ) : (
                        <span className="text-xs text-slate-500">Save these codes somewhere safe.</span>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="p-6">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Login Alerts</h4>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Notify admins when new devices sign in.
              </p>
              <div className="mt-4 space-y-4">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-panel-elevated p-3 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-slate-100">Email alerts enabled</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={formState.alertsEnabled}
                    onChange={updateField('alertsEnabled')}
                  />
                </label>
                <Input
                  label="Alert recipients"
                  value={formState.alertRecipients}
                  onChange={updateField('alertRecipients')}
                />
                <p className="text-xs text-slate-500">Use a monitored inbox. One address for now.</p>
                <label className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-slate-100">Alert frequency</span>
                  <select
                    className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-2.5 text-sm text-slate-900 shadow-sm dark:text-slate-100"
                    value={formState.alertFrequency}
                    onChange={updateField('alertFrequency')}
                  >
                    <option value="instant">Instant</option>
                    <option value="daily">Daily digest</option>
                    <option value="weekly">Weekly summary</option>
                  </select>
                </label>
              </div>
            </Card>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

