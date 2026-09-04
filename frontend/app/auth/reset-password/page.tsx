'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/loader';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  // No token in the URL at all — send them back to request a fresh link.
  useEffect(() => {
    if (!token) router.replace('/auth?error=reset-link-invalid');
  }, [token, router]);

  if (!token) return <PageLoader />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.error === 'invalid_or_expired') {
        router.replace('/auth?error=reset-link-invalid');
        return;
      }
      setError(data.error || data.message || 'Could not reset your password. Try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-10">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary-700 text-white flex items-center justify-center shadow-md">
            {done ? <CheckCircle2 size={26} /> : <KeyRound size={26} />}
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-primary-900">
            {done ? 'Password updated' : 'Choose a new password'}
          </h1>
          <p className="text-sm text-text-muted mt-2">
            {done
              ? 'Your password has been reset. You can sign in with it now.'
              : 'Pick a new password for your Good School account.'}
          </p>
        </div>

        {done ? (
          <Button
            variant="primary"
            className="w-full justify-center text-base h-11"
            onClick={() => router.replace('/auth')}
          >
            Go to sign in
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />

            {error && (
              <div className="flex items-start gap-2 text-sm text-error">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <Button
              variant="primary"
              className="w-full justify-center text-base h-11"
              type="submit"
              isLoading={isLoading}
            >
              Reset password
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
