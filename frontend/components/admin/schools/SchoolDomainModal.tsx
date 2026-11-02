'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne, submitJson } from '@/lib/api/envelope';
import type { School } from './types';

type DomainStatus = 'pending_dns' | 'provisioning' | 'active' | 'failed' | 'removing';

interface DomainState {
  domain: string | null;
  status?: DomainStatus;
  lastError?: string | null;
  serverIp: string | null;
}

const STATUS: Record<DomainStatus, { label: string; variant: 'default' | 'accent' | 'success' | 'muted' }> = {
  pending_dns: { label: 'Waiting for DNS', variant: 'muted' },
  provisioning: { label: 'Setting up HTTPS', variant: 'accent' },
  active: { label: 'Live', variant: 'success' },
  failed: { label: 'Needs attention', variant: 'default' },
  removing: { label: 'Removing', variant: 'muted' },
};

const SECOND_LEVEL = ['ac', 'co', 'go', 'ne', 'or', 'sc', 'com', 'edu', 'gov', 'net', 'org'];

/** The host part of the DNS record: what goes before the domain people registered. */
function recordHost(domain: string): string {
  const parts = domain.split('.');
  // Suffixes like ac.ug and co.ug mean the registered name is the last three parts.
  const secondLevel = parts.length >= 3 && parts.at(-1)!.length === 2 && SECOND_LEVEL.includes(parts.at(-2)!);
  const host = parts.slice(0, parts.length - (secondLevel ? 3 : 2)).join('.');
  return host || '@';
}

export function SchoolDomainModal({ school, onClose }: { school: School; onClose: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<DomainState | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const url = `/api/v1/schools/${school.id}/domain`;

  const load = useCallback(async () => {
    const next = await fetchOne<DomainState>(url);
    if (next) setState(next);
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  // The server job picks these up within a minute or so.
  const waiting = state?.status === 'provisioning' || state?.status === 'removing';
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [waiting, load]);

  async function act(method: 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<void> {
    setBusy(true);
    const res = await submitJson<DomainState>(path, method, body);
    setBusy(false);
    if (res.ok) await load();
    else toast.error(res.error ?? 'Something went wrong.');
  }

  const status = state?.status ? STATUS[state.status] : null;

  return (
    <Modal open onClose={onClose} title={`Custom domain — ${school.name}`}>
      {!state ? (
        <div className="flex justify-center py-8">
          <Loader />
        </div>
      ) : !state.domain ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act('PUT', url, { domain: input });
          }}
          className="space-y-4"
        >
          <p className="text-sm text-text-muted">
            Give this school its own address. Its login page will show the school&apos;s name, logo and colour, and only
            its own people can sign in there.
          </p>
          <Input
            label="Domain"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="portal.yourschool.ac.ug"
            required
          />
          <Button type="submit" isLoading={busy}>
            Add domain
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-text-primary break-all">{state.domain}</span>
            {status && <Badge variant={status.variant}>{status.label}</Badge>}
          </div>

          {state.lastError && <p className="text-sm text-error">{state.lastError}</p>}

          {(state.status === 'pending_dns' || state.status === 'failed') && (
            <>
              <p className="text-sm text-text-muted">
                Create this record wherever the domain&apos;s DNS is managed, then check it. If the record has a proxy
                option, such as Cloudflare&apos;s, turn it off.
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-border-strong p-3 text-sm">
                <dt className="text-text-muted">Type</dt>
                <dd className="font-mono">A</dd>
                <dt className="text-text-muted">Host</dt>
                <dd className="font-mono break-all">{recordHost(state.domain)}</dd>
                <dt className="text-text-muted">Value</dt>
                <dd className="font-mono">{state.serverIp ?? 'Not configured on the server'}</dd>
              </dl>
              <Button onClick={() => void act('POST', `${url}/verify`)} isLoading={busy}>
                Check DNS
              </Button>
            </>
          )}

          {state.status === 'provisioning' && (
            <p className="text-sm text-text-muted">DNS looks right. Setting up HTTPS, which usually takes a minute or two.</p>
          )}

          {state.status === 'active' && (
            <p className="text-sm text-text-muted">
              Live at{' '}
              <a className="text-primary-700 underline" href={`https://${state.domain}`} target="_blank" rel="noreferrer">
                https://{state.domain}
              </a>
              . Password reset emails for this school now use this address.
            </p>
          )}

          {state.status !== 'removing' && (
            <Button variant="outline" onClick={() => void act('DELETE', url)} isLoading={busy}>
              Remove domain
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
