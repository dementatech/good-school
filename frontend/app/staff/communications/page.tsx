'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { useAuth } from '@/components/auth/AuthContext';
import { useConversationSocket } from '@/lib/realtime/useConversationSocket';
import { Send, Megaphone, MessageSquare } from 'lucide-react';

interface ConversationSummary {
  id: string;
  otherUserId: string;
  otherName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

interface ConversationMessage {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

interface OwnedClass {
  classId: string;
  streamId: string | null;
  label: string;
}

interface Broadcast {
  id: string;
  title: string;
  body: string;
  recipientCount: number;
  createdAt: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function MessagesTab() {
  const toast = useToast();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const loadConversations = useCallback(async () => {
    const list = await fetchList<ConversationSummary>('/api/v1/communications/conversations', toast.error);
    setConversations(list);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setMessages(await fetchList<ConversationMessage>(`/api/v1/communications/conversations/${id}/messages`, toast.error));
      await submitJson(`/api/v1/communications/conversations/${id}/read`, 'POST');
      loadConversations();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadConversations],
  );

  useEffect(() => {
    void (async () => {
      const list = await loadConversations();
      if (list.length > 0) await openConversation(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useConversationSocket((event) => {
    if (event.conversationId === selectedId) {
      setMessages((prev) => [...prev, event.message]);
    }
    loadConversations();
  });

  async function send() {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    const result = await submitJson<ConversationMessage>(
      `/api/v1/communications/conversations/${selectedId}/messages`,
      'POST',
      { body: draft.trim() },
    );
    setSending(false);
    if (!result.ok) {
      toast.error(result.error ?? 'Message failed to send.');
      return;
    }
    setDraft('');
    setMessages((prev) => [...prev, result.data!]);
    loadConversations();
  }

  if (conversations.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-muted">
          No conversation yet — your school admin starts the first message.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] min-h-[28rem]">
        <ul className="border-b md:border-b-0 md:border-r border-border divide-y divide-border max-h-[28rem] overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => openConversation(c.id)}
                className={`w-full text-left px-4 py-3 hover:bg-bg-canvas transition-colors ${
                  selectedId === c.id ? 'bg-bg-canvas' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-primary-900 truncate">{c.otherName}</p>
                  {c.unreadCount > 0 && (
                    <span className="shrink-0 text-[10px] font-bold rounded-full bg-primary-700 text-white w-5 h-5 flex items-center justify-center">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                {c.lastMessage && <p className="text-xs text-text-muted truncate mt-0.5">{c.lastMessage}</p>}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[22rem]">
            {messages.map((m) => {
              const mine = m.senderUserId === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                      mine ? 'bg-primary-700 text-white' : 'bg-bg-canvas text-text-primary'
                    }`}
                  >
                    <p>{m.body}</p>
                    <p className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-text-faint'}`}>
                      {formatTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-border p-3 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
              placeholder="Type a message…"
              className="border border-border rounded-lg px-3 py-2 text-sm flex-1 min-w-0"
            />
            <Button inline onClick={send} isLoading={sending} disabled={!draft.trim()}>
              <Send className="w-4 h-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function BroadcastTab() {
  const toast = useToast();
  const [classes, setClasses] = useState<OwnedClass[]>([]);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Broadcast[]>([]);

  const loadSent = useCallback(async () => {
    setSent(await fetchList<Broadcast>('/api/v1/communications/broadcasts/sent', toast.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void (async () => {
      const list = await fetchList<OwnedClass>('/api/v1/communications/broadcasts/classes', toast.error);
      setClasses(list);
      if (list.length > 0) setTarget(`${list[0].classId}|${list[0].streamId ?? ''}`);
      await loadSent();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    if (!target || !title.trim() || !body.trim()) return;
    const [classId, streamId] = target.split('|');
    setSending(true);
    const result = await submitJson('/api/v1/communications/broadcasts/class', 'POST', {
      classId,
      streamId: streamId || null,
      title: title.trim(),
      body: body.trim(),
    });
    setSending(false);
    if (!result.ok) {
      toast.error(result.error ?? 'Broadcast failed to send.');
      return;
    }
    setTitle('');
    setBody('');
    loadSent();
  }

  if (classes.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-muted">
          You aren&rsquo;t the assigned teacher for a class yet, so there&rsquo;s nothing to broadcast to.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-sm font-semibold text-primary-900 mb-3">Broadcast to your class</h2>
        <div className="space-y-3">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm w-full"
          >
            {classes.map((c) => (
              <option key={`${c.classId}|${c.streamId ?? ''}`} value={`${c.classId}|${c.streamId ?? ''}`}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="border border-border rounded-lg px-3 py-2 text-sm w-full"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message"
            rows={4}
            className="border border-border rounded-lg px-3 py-2 text-sm w-full"
          />
          <Button inline onClick={send} isLoading={sending} disabled={!title.trim() || !body.trim()}>
            Send to class
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-primary-900 mb-3">Sent</h2>
        {sent.length === 0 ? (
          <p className="text-sm text-text-muted">No broadcasts sent yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sent.map((b) => (
              <li key={b.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-primary-900">{b.title}</p>
                  <p className="text-xs text-text-faint shrink-0">{formatTime(b.createdAt)}</p>
                </div>
                <p className="text-sm text-text-muted mt-0.5">{b.body}</p>
                <p className="text-xs text-text-faint mt-1">{b.recipientCount} students</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function StaffCommunicationsPage() {
  const [tab, setTab] = useState<'messages' | 'broadcast'>('messages');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Communication</h1>
        <p className="text-sm text-text-muted">Message your school admin, or broadcast to your class.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('messages')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'messages' ? 'bg-primary-700 text-white' : 'bg-bg-card border border-border text-text-secondary'
          }`}
        >
          <MessageSquare className="w-4 h-4" aria-hidden /> Messages
        </button>
        <button
          type="button"
          onClick={() => setTab('broadcast')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'broadcast' ? 'bg-primary-700 text-white' : 'bg-bg-card border border-border text-text-secondary'
          }`}
        >
          <Megaphone className="w-4 h-4" aria-hidden /> Broadcast
        </button>
      </div>

      {tab === 'messages' ? <MessagesTab /> : <BroadcastTab />}
    </div>
  );
}
