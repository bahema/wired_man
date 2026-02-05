import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { publicApi } from '../services/publicApi';

export default function BossLoginPage() {
  const sessionKey = 'boss-admin-session';
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [emailValue, setEmailValue] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [adminCreated, setAdminCreated] = useState(() => {
    const stored = localStorage.getItem('admin-created');
    return stored === 'true';
  });
  const [signupEnabled, setSignupEnabled] = useState(true);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [smtpLastKnownGood, setSmtpLastKnownGood] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpId, setOtpId] = useState('');
  const [otpMethod, setOtpMethod] = useState<'email' | 'app' | ''>('');
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [trustDeviceByDefault, setTrustDeviceByDefault] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtpId, setResetOtpId] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const passwordStrength = () => {
    if (!passwordValue) return { label: 'Empty', percent: 0 };
    const score =
      (passwordValue.length >= 10 ? 1 : 0) +
      (/[A-Z]/.test(passwordValue) ? 1 : 0) +
      (/[0-9]/.test(passwordValue) ? 1 : 0) +
      (/[^A-Za-z0-9]/.test(passwordValue) ? 1 : 0);
    if (score >= 4) return { label: 'Strong', percent: 100 };
    if (score === 3) return { label: 'Good', percent: 75 };
    if (score === 2) return { label: 'Medium', percent: 50 };
    return { label: 'Weak', percent: 25 };
  };

  const strength = passwordStrength();
  const smtpReady = smtpConfigured && smtpLastKnownGood;
  const allowSignup = !adminCreated && signupEnabled;
  const hasSession =
    Boolean(sessionStorage.getItem(sessionKey) || localStorage.getItem(sessionKey));

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  React.useEffect(() => {
    if (cooldown === 0 && failedAttempts >= 3) {
      setFailedAttempts(0);
    }
  }, [cooldown, failedAttempts]);

  React.useEffect(() => {
    localStorage.setItem('admin-created', adminCreated ? 'true' : 'false');
  }, [adminCreated]);

  React.useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const status = await publicApi.fetchAdminStatus();
        if (!active) return;
        setAdminCreated(status.exists);
        const prefs = await publicApi.fetchAdminLoginSettings();
        if (active) {
          setTrustDeviceByDefault(Boolean(prefs.rememberDeviceDefault));
          setTrustedDevice(Boolean(prefs.rememberDeviceDefault));
          setSignupEnabled(prefs.signupEnabled ?? true);
          setSmtpConfigured(Boolean(prefs.smtpConfigured));
          setSmtpLastKnownGood(Boolean(prefs.smtpLastKnownGood));
        }
      } catch {
        // Keep local storage fallback when backend is unavailable.
      }
    };
    void loadStatus();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    const sessionToken =
      sessionStorage.getItem(sessionKey) || localStorage.getItem(sessionKey) || '';
    if (sessionToken) {
      navigate('/boss', { replace: true });
    }
  }, [navigate]);

  const recordFailedAttempt = () => {
    setFailedAttempts((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        setCooldown(30);
      }
      return next;
    });
  };

  const buildOtpHint = (method: 'email' | 'app' | '') => {
    if (method === 'app') {
      return 'Enter the code from your authenticator app.';
    }
    if (method === 'email') {
      return smtpReady
        ? 'OTP will be sent to your email.'
        : 'SMTP is not configured/verified yet. Configure it in Boss Settings after login.';
    }
    return '';
  };

  const handleSignup = async () => {
    if (!signupEnabled) {
      setAuthError('Owner-only access. Signup is disabled.');
      return;
    }
    if (!emailValue || !passwordValue) {
      setAuthError('Email and password are required.');
      return;
    }
    setIsLoading(true);
    setAuthMessage('');
    setAuthError('');
    try {
      const result = await publicApi.adminSignup({ email: emailValue, password: passwordValue });
      if (result.token) {
        sessionStorage.setItem(sessionKey, result.token);
        localStorage.setItem(sessionKey, result.token);
      }
      if (result.requiresOtp) {
        setOtpRequired(true);
        setOtpId(result.otpId || '');
        setOtpMethod((result.method as 'email' | 'app') || '');
        setOtpHint(buildOtpHint((result.method as 'email' | 'app') || ''));
        setAuthMessage('Signup requires OTP verification.');
        return;
      }
      setAdminCreated(true);
      setAuthMessage('Admin created. Signup disabled and login enabled.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Signup failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetRequest = async () => {
    const email = resetEmail || emailValue;
    if (!email) {
      setResetError('Email is required.');
      return;
    }
    setResetLoading(true);
    setResetMessage('');
    setResetError('');
    try {
      const result = await publicApi.requestPasswordReset({ email });
      setResetOtpId(result.otpId);
      setResetMessage('Reset code sent. Check your email.');
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Failed to send reset code.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetConfirm = async () => {
    if (!resetOtpId || !resetCode || !resetPassword || !resetConfirm) {
      setResetError('All reset fields are required.');
      return;
    }
    setResetLoading(true);
    setResetMessage('');
    setResetError('');
    try {
      await publicApi.confirmPasswordReset({
        otpId: resetOtpId,
        code: resetCode,
        newPassword: resetPassword,
        confirmPassword: resetConfirm
      });
      setResetMessage('Password updated. You can sign in now.');
      setResetOpen(false);
      setResetOtpId('');
      setResetCode('');
      setResetPassword('');
      setResetConfirm('');
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Failed to reset password.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!emailValue || !passwordValue) {
      setAuthError('Email and password are required.');
      return;
    }
    setAuthMessage('');
    setAuthError('');
    setIsLoading(true);
    try {
      const trustedDevice = localStorage.getItem('boss-trusted-device');
      const result = await publicApi.adminLogin(
        { email: emailValue, password: passwordValue },
        trustedDevice
      );
      if (result.token) {
        sessionStorage.setItem(sessionKey, result.token);
        localStorage.setItem(sessionKey, result.token);
      }
      if (result.requiresOtp) {
        setOtpRequired(true);
        setOtpId(result.otpId || '');
        const method = (result.method as 'email' | 'app') || '';
        setOtpMethod(method);
        setOtpHint(buildOtpHint(method));
        setAuthMessage('OTP required to finish login.');
        return;
      }
      setAuthMessage('Login successful.');
      navigate('/boss');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Login failed.');
      recordFailedAttempt();
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpId || !otpCode) {
      setAuthError('OTP code is required.');
      return;
    }
    setIsLoading(true);
    setAuthMessage('');
    setAuthError('');
    try {
      const result = await publicApi.adminVerifyOtp({
        otpId,
        code: otpCode,
        trustDevice: trustDeviceByDefault || trustedDevice,
        deviceLabel: 'BossDesk browser'
      });
      if (result.token) {
        sessionStorage.setItem(sessionKey, result.token);
        localStorage.setItem(sessionKey, result.token);
      }
      if (result.trustedDevice?.token) {
        localStorage.setItem('boss-trusted-device', result.trustedDevice.token);
      }
      setOtpRequired(false);
      setOtpId('');
      setOtpCode('');
      setOtpHint('');
      setAuthMessage('Login successful.');
      navigate('/boss');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'OTP verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] min-h-[100dvh] bg-surface-accent">
      <div className="container-shell flex min-h-[100svh] min-h-[100dvh] items-start justify-center pt-4 pb-6 sm:pt-6">
        <div className="w-full max-w-5xl max-w-full rounded-2xl border border-border-subtle bg-panel-elevated p-4 shadow-premium sm:p-5">
          <div className="flex items-center gap-3">
            <img
              src="/icons/Screenshot 2024-03-31 121526.png"
              alt="BossDesk"
              className="h-10 w-10 rounded-full"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                Boss Desk
              </p>
              <p className="text-base font-semibold text-text sm:text-lg">
                Admin Sign In
              </p>
            </div>
          </div>

          <p className="mt-2 max-w-[48ch] text-xs text-text-muted sm:text-sm">
            Use your boss credentials to manage client content.
          </p>

          <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-border-subtle bg-panel-elevated p-4 shadow-premium sm:p-5">
              <h2 className="text-base font-semibold text-text">Credentials</h2>
              <p className="mt-1 max-w-[40ch] text-xs text-text-muted">Primary access details</p>
              <div className="mt-3 space-y-3">
                <Input label="Full name" type="text" placeholder="Boss Admin" className="py-2.5 text-sm" />
                <Input
                  label="Email"
                  type="email"
                  placeholder="boss@workpays.com"
                  className="py-2.5 text-sm"
                  value={emailValue}
                  onChange={(event) => setEmailValue(event.target.value)}
                />
                <div className="space-y-2">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Your secure password"
                    value={passwordValue}
                    onChange={(event) => setPasswordValue(event.target.value)}
                    className="py-2.5 text-sm"
                  />
                  <div className="rounded-xl border border-border-subtle bg-panel p-3 text-xs text-text-muted">
                    <div className="flex items-center justify-between">
                      <span>Password strength</span>
                      <span className="font-semibold text-text">{strength.label}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-panel-elevated">
                      <div
                        className="h-2 rounded-full bg-blue-600"
                        style={{ width: `${strength.percent}%` }}
                      />
                    </div>
                  </div>
                <label className="inline-flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                      checked={showPassword}
                      onChange={(event) => setShowPassword(event.target.checked)}
                      className="h-4 w-4"
                    />
                    Show password
                  </label>
                </div>
                <Button
                  className="w-full"
                  disabled={cooldown > 0 || isLoading || otpRequired}
                  onClick={handleLogin}
                >
                  {cooldown > 0 ? `Try again in ${cooldown}s` : 'Sign In'}
                </Button>
                <button
                  type="button"
                  className="w-full text-xs font-semibold text-blue-600 hover:text-blue-500"
                  onClick={() => {
                    setResetOpen((prev) => !prev);
                    setResetEmail(emailValue);
                    setResetMessage('');
                    setResetError('');
                  }}
                >
                  {resetOpen ? 'Hide reset' : 'Forgot password?'}
                </button>
                {otpHint ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {otpHint}
                  </div>
                ) : null}
                {authError ? (
                  <div className="rounded-xl border border-red-300/70 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {authError}
                  </div>
                ) : null}
                {authMessage ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    {authMessage}
                  </div>
                ) : null}
                {resetOpen ? (
                  <div className="rounded-xl border border-border-subtle bg-panel p-3 text-xs text-text-muted">
                    <p className="text-xs font-semibold text-text">Reset password</p>
                    <div className="mt-2 grid gap-2">
                      <Input
                        label="Email"
                        type="email"
                        value={resetEmail}
                        onChange={(event) => setResetEmail(event.target.value)}
                        className="py-2.5 text-sm"
                      />
                      <Button size="sm" variant="outline" onClick={handleResetRequest} disabled={resetLoading}>
                        {resetLoading ? 'Sending...' : 'Send reset code'}
                      </Button>
                      {resetOtpId ? (
                        <>
                          <Input
                            label="Reset code"
                            type="text"
                            value={resetCode}
                            onChange={(event) => setResetCode(event.target.value)}
                            className="py-2.5 text-sm"
                          />
                          <Input
                            label="New password"
                            type="password"
                            value={resetPassword}
                            onChange={(event) => setResetPassword(event.target.value)}
                            className="py-2.5 text-sm"
                          />
                          <Input
                            label="Confirm password"
                            type="password"
                            value={resetConfirm}
                            onChange={(event) => setResetConfirm(event.target.value)}
                            className="py-2.5 text-sm"
                          />
                          <Button size="sm" variant="outline" onClick={handleResetConfirm} disabled={resetLoading}>
                            {resetLoading ? 'Updating...' : 'Update password'}
                          </Button>
                        </>
                      ) : null}
                      {resetError ? (
                        <div className="rounded-xl border border-red-300/70 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {resetError}
                        </div>
                      ) : null}
                      {resetMessage ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                          {resetMessage}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-border-subtle bg-panel-elevated p-4 shadow-premium sm:p-5">
              <h2 className="text-base font-semibold text-text">Security & Services</h2>
              <p className="mt-1 max-w-[40ch] text-xs text-text-muted">Extra protection and login checks</p>
              <div className="mt-3 space-y-3 text-sm text-text-muted">
                {allowSignup ? (
                  <div className="rounded-xl border border-border-subtle bg-panel p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-text">Admin setup</span>
                      <span className="text-[11px] text-text-muted">Available</span>
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      Single-admin mode: once created, signup stays disabled.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      disabled={isLoading}
                      onClick={handleSignup}
                    >
                      Create Admin Account
                    </Button>
                  </div>
                ) : null}
                {!allowSignup && !adminCreated ? (
                  <div className="rounded-xl border border-border-subtle bg-panel p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-text">Admin setup</span>
                      <span className="text-[11px] text-text-muted">Disabled</span>
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      Owner-only access. Signup is disabled.
                    </p>
                  </div>
                ) : null}
                <div className="min-h-[36px]">
                  {cooldown > 0 ? (
                    <div className="rounded-xl border border-red-300/70 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Too many attempts. Please wait {cooldown}s before trying again.
                    </div>
                  ) : null}
                </div>
                <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                  <span className="font-medium text-text">Verification method</span>
                  <select
                    value={otpMethod || 'email'}
                    onChange={(event) => setOtpMethod(event.target.value as 'email' | 'app')}
                    className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-2.5 text-sm text-text shadow-sm"
                    disabled
                  >
                    <option value="email">Email OTP</option>
                    <option value="app">Authenticator App</option>
                  </select>
                </label>
                <div className="space-y-2">
                  <Input
                    label="OTP Code"
                    type="text"
                    placeholder="6-digit code"
                    className="py-2.5 text-sm"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                  />
                  <p className="text-xs text-text-muted">
                    {otpMethod === 'app'
                      ? 'Enter the code from your authenticator app.'
                      : 'Enter the code sent to your email.'}
                  </p>
                  <div className="rounded-xl border border-border-subtle bg-panel p-3 text-xs text-text-muted">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-text">SMTP status</span>
                      {hasSession ? (
                        <Link to="/boss/settings" className="text-[11px] font-semibold text-blue-600 hover:text-blue-500">
                          Open settings
                        </Link>
                      ) : (
                        <span className="text-[11px] text-text-muted">After login</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      {smtpReady
                        ? 'OTP will be sent to your email.'
                        : 'SMTP is not configured or verified yet.'}
                    </p>
                    {!hasSession ? (
                      <p className="mt-1 text-[11px] text-text-muted">
                        After login, configure SMTP in Boss Settings.
                      </p>
                    ) : null}
                  </div>
                  {trustDeviceByDefault ? (
                    <p className="text-xs text-text-muted">
                      This device will be trusted automatically per admin settings.
                    </p>
                  ) : (
                    <p className="text-xs text-text-muted">
                      Trusted devices are disabled by admin settings.
                    </p>
                  )}
                  <Button size="sm" variant="outline" className="w-full" onClick={handleVerifyOtp} disabled={!otpRequired || isLoading}>
                    Verify OTP
                  </Button>
                </div>
                <div className="hidden rounded-xl border border-border-subtle bg-panel p-3 text-xs text-text-muted sm:block">
                  Device verification: new device detected will require confirmation.
                </div>
                <label className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 break-words">Enable 2FA on this device</span>
                  <input type="checkbox" className="h-4 w-4" />
                </label>
                <label className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 break-words">Trust this browser for 30 days</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={trustedDevice}
                    onChange={(event) => setTrustedDevice(event.target.checked)}
                  />
                </label>
                <label className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 break-words">Login alerts by email</span>
                  <input type="checkbox" className="h-4 w-4" defaultChecked />
                </label>
                <label className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 break-words">Remember this device for 30 days</span>
                  <input type="checkbox" className="h-4 w-4" />
                </label>
                <div className="rounded-xl border border-border-subtle bg-panel p-3 text-xs">
                  Login throttling active after 3 failed attempts.
                  <div className="mt-2 flex items-center justify-between">
                    <span>Failed attempts</span>
                    <span className="font-semibold text-text">{failedAttempts}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => {
                      recordFailedAttempt();
                    }}
                  >
                    Simulate failed login
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
            <span>Forgot access? Contact your system admin.</span>
            {trustedDevice ? (
              <Link to="/boss" className="font-semibold text-blue-600 hover:text-blue-500">
                Go to Dashboard
              </Link>
            ) : (
              <span className="font-semibold text-slate-400">
                Go to Dashboard
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
