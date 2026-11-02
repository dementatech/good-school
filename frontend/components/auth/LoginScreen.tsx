'use client'

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, AlertCircle, ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth, type User as AuthUser } from './AuthContext';
import { loadIdentity } from '@/lib/auth/identity';

const FIELD_LABEL = 'block text-sm font-medium text-white/90 mb-1.5';
const FIELD_INPUT =
  'w-full h-11 rounded-sm border-0 bg-white px-3 text-sm text-text-primary placeholder:text-text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-700';
const SUBMIT =
  'inline-flex items-center gap-1 min-h-11 px-1 text-base font-semibold text-white rounded-sm transition-opacity ' +
  'hover:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-white';
const TEXT_LINK =
  'text-sm italic text-white/90 hover:text-white underline-offset-4 hover:underline rounded-sm ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-white';

/** The full-screen frame both views share: brand on the left, a thin divider,
 * the form on the right. Stacks on a phone, where the divider goes away. */
const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-screen overflow-hidden bg-primary-700 text-white flex flex-col">
    {/* A blurred classroom under the school's blue. Scaled up so the blur's soft
        edges stay off-screen; the overlay keeps white text readable over it. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src="/login-background.jpg"
      alt=""
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-[6px]"
    />
    <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-600/80 via-primary-700/80 to-primary-800/90" />

    <main className="relative flex-1 flex items-center justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm md:max-w-3xl flex flex-col md:flex-row md:items-stretch"
      >
        {/* The logo is blue, so it sits on white to stay visible here. */}
        <div className="md:w-1/2 md:pr-12 flex flex-col items-center justify-center text-center mb-8 md:mb-0">
          <div className="rounded-full border border-dashed border-white/70 p-2 mb-4">
            <div className="h-20 w-20 md:h-24 md:w-24 rounded-full bg-white flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="h-16 w-16 md:h-20 md:w-20 object-contain" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Good School</h1>
          <p className="text-sm md:text-base text-white/90 mt-2">Sign in to your Good School account</p>
        </div>

        <div aria-hidden className="hidden md:block w-px bg-white/50" />

        <div className="md:w-1/2 md:pl-12 md:py-8">{children}</div>
      </motion.div>
    </main>

    <footer className="relative px-6 pb-5 text-center text-xs italic text-white/80">
      Authorized personnel only. Multiple failed attempts will lock your account.
    </footer>
  </div>
);

/**
 * `onBack` returns to the role picker. Without it this screen is a dead end:
 * portal -> login is a state change, not a navigation, so there is no history
 * entry for a browser Back to return to — and in the desktop app there is no
 * back button at all. Picking the wrong role meant restarting the app.
 */
export const LoginScreen: React.FC<{
  onLogin: (user: AuthUser & { mustChangePassword?: boolean }) => void;
  onBack?: () => void;
}> = ({ onLogin, onBack }) => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLocked && lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer(prev => {
          if (prev <= 1) {
            setIsLocked(false);
            setAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLocked, lockoutTimer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isLocked) {
      setError(`Account is locked. Please wait ${Math.ceil(lockoutTimer / 60)} minutes.`);
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        // The backend set the HttpOnly cookie and returned only { role,
        // school_id }; hydrate the full user from /auth/me.
        const { user } = await loadIdentity();
        if (user) {
          const withFlag = { ...user, mustChangePassword: !!data.mustChangePassword };
          login(withFlag);
          onLogin(withFlag);
        } else {
          setError('Signed in, but your profile could not be loaded. Try again.');
        }
      } else if (data.error === 'school_suspended') {
        // Not the user's fault — don't count it toward the lockout.
        setError("Your school's account is suspended. Contact your administrator.");
      } else if (data.error === 'account_disabled') {
        // A super admin turned this login off — not a credential problem.
        setError('This account has been disabled. Contact your administrator.');
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 3) {
          setIsLocked(true);
          setLockoutTimer(900);
          setError('Account locked for 15 minutes due to multiple failed attempts.');
        } else {
          const friendly =
            data.error === 'invalid_credentials' || data.error === 'invalid_identifier_format'
              ? `Invalid credentials. ${3 - newAttempts} attempts remaining.`
              : data.error || data.message;
          setError(friendly || `Invalid credentials. ${3 - newAttempts} attempts remaining.`);
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage('');
    try {
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() }),
      });
      const data = await response.json();
      // Deliberately the same message either way — the endpoint never reveals
      // whether the identifier matched an account.
      setForgotMessage(data.message || "If an account exists, we've sent a reset link.");
    } catch {
      setForgotMessage('Network error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  if (showForgot) {
    return (
      <AuthShell>
        <button
          type="button"
          onClick={() => { setShowForgot(false); setForgotMessage(''); }}
          className={`${TEXT_LINK} inline-flex items-center gap-1.5 not-italic mb-4`}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Back to sign in
        </button>
        <h2 className="text-xl font-semibold">Reset password</h2>
        <p className="text-sm text-white/90 mt-2 mb-6">
          Enter your System ID or email and we&apos;ll send a reset link to the address on file.
        </p>

        {forgotMessage ? (
          <p role="status" className="text-sm text-white">{forgotMessage}</p>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-5">
            <div>
              <label htmlFor="forgot-identifier" className={FIELD_LABEL}>
                System ID or email
              </label>
              <input
                id="forgot-identifier"
                type="text"
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
                className={FIELD_INPUT}
                placeholder="e.g. S260001"
                required
                autoComplete="username"
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" className={SUBMIT} disabled={forgotLoading}>
                {forgotLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                Send reset link
                <ChevronRight className="w-5 h-5" aria-hidden />
              </button>
            </div>
          </form>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {onBack && (
        <button type="button" onClick={onBack} className={`${TEXT_LINK} inline-flex items-center gap-1.5 not-italic mb-4`}>
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Choose a different role
        </button>
      )}
      <h2 className="text-xl font-semibold mb-5">Sign in</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="identifier" className={FIELD_LABEL}>
            System ID, phone number or email
          </label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className={FIELD_INPUT}
            placeholder="e.g. S260001"
            required
            autoComplete="username"
          />
        </div>

        <div>
          <label htmlFor="password" className={FIELD_LABEL}>
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${FIELD_INPUT} pr-11`}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-text-muted hover:text-primary-700 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-sm bg-white px-3 py-2 text-sm text-error"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
            <p>{error}</p>
          </motion.div>
        )}

        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={() => setShowForgot(true)} className={TEXT_LINK}>
            Forgot password?
          </button>
          <button type="submit" className={SUBMIT} disabled={isLoading || isLocked}>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {isLocked ? `Locked (${Math.ceil(lockoutTimer / 60)}m)` : 'Sign in'}
            {!isLocked && <ChevronRight className="w-6 h-6" aria-hidden />}
          </button>
        </div>
      </form>
    </AuthShell>
  );
};