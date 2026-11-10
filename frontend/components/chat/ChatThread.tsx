'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { ArrowDown, ArrowLeft, BellOff, Eye, Info, Loader2, Lock } from 'lucide-react';
import { RoomAvatar } from './ChatAvatar';
import { MessageBubble, type ReadState } from './MessageBubble';
import { Composer } from './Composer';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { chatApi } from '@/lib/communications/api';
import { dayLabel, isSameDay } from '@/lib/communications/format';
import { DEFAULT_REACTIONS, KIND_LABEL, type ChatMessage, type RoomDetail } from '@/lib/communications/types';
import type { RealtimeEvent } from '@/lib/realtime/useRealtimeSocket';

interface Props {
  roomId: string;
  myUserId: string | undefined;
  myRole: string | undefined;
  onlineIds: Set<string>;
  typingNames: string[];
  subscribe: (listener: (event: RealtimeEvent) => void) => () => void;
  onBack: () => void;
  onOpenInfo: (room: RoomDetail) => void;
  onRead: (roomId: string) => void;
  onSent: (message: ChatMessage) => void;
  /** Bumped by the parent when the room's settings/members change. */
  reloadKey: number;
  onError: (message: string) => void;
}

const RUN_GAP_MS = 5 * 60_000;

export function ChatThread({
  roomId,
  myUserId,
  myRole,
  onlineIds,
  typingNames,
  subscribe,
  onBack,
  onOpenInfo,
  onRead,
  onSent,
  reloadKey,
  onError,
}: Props) {
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [readAt, setReadAt] = useState<Record<string, string | null>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const restoreRef = useRef<{ height: number; top: number } | null>(null);
  const stickRef = useRef(true);
  const pendingSeq = useRef(0);

  const isMember = room?.myRole != null;

  const markRead = useCallback(() => {
    if (!isMember) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    void chatApi.read(roomId);
    onRead(roomId);
  }, [roomId, isMember, onRead]);

  // ── Load the room and its latest page ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setReplyTo(null);
      setEditing(null);
      setNewBelow(0);
      const [detail, page] = await Promise.all([chatApi.room(roomId), chatApi.messages(roomId)]);
      if (cancelled) return;
      if (!detail || !page) {
        onError("This chat couldn't be opened. It may have been removed, or you may no longer be in it.");
        setLoading(false);
        return;
      }
      setRoom(detail);
      setReadAt(Object.fromEntries(detail.members.map((m) => [m.userId, m.lastReadAt])));
      setMessages(page.messages);
      setHasMore(page.hasMore);
      stickRef.current = true;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Settings or members changed elsewhere: refresh the header and member list only.
  useEffect(() => {
    if (reloadKey === 0) return;
    void chatApi.room(roomId).then((detail) => {
      if (!detail) return;
      setRoom(detail);
      setReadAt((prev) => ({ ...Object.fromEntries(detail.members.map((m) => [m.userId, m.lastReadAt])), ...prev }));
    });
  }, [reloadKey, roomId]);

  // Opening a chat reads it.
  useEffect(() => {
    if (!loading && room) markRead();
  }, [loading, room, markRead]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && atBottomRef.current) markRead();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  // ── Live updates ────────────────────────────────────────────────────────
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'chat_message' && event.roomId === roomId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === event.message.id)) return prev;
            // My own message from another tab, or the echo of the one I just sent.
            return [...prev.filter((m) => !(m.pending && m.body === event.message.body && event.message.sender?.userId === myUserId)), event.message];
          });
          const mine = event.message.sender?.userId === myUserId;
          if (atBottomRef.current || mine) {
            stickRef.current = true;
            if (!mine) markRead();
          } else setNewBelow((n) => n + 1);
        } else if (event.type === 'chat_message_updated' && event.roomId === roomId) {
          setMessages((prev) => prev.map((m) => (m.id === event.message.id ? event.message : m)));
        } else if (event.type === 'chat_read' && event.roomId === roomId) {
          setReadAt((prev) => ({ ...prev, [event.userId]: event.lastReadAt }));
        }
      }),
    [subscribe, roomId, myUserId, markRead],
  );

  // ── Scrolling ───────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreRef.current) {
      // Older messages were added above: keep what you were looking at in place.
      el.scrollTop = el.scrollHeight - restoreRef.current.height + restoreRef.current.top;
      restoreRef.current = null;
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
      stickRef.current = false;
    }
  }, [messages]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    const el = scrollRef.current;
    setLoadingOlder(true);
    const page = await chatApi.messages(roomId, messages[0].createdAt);
    setLoadingOlder(false);
    if (!page) return;
    if (el) restoreRef.current = { height: el.scrollHeight, top: el.scrollTop };
    setMessages((prev) => [...page.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
    setHasMore(page.hasMore);
  }, [loadingOlder, hasMore, messages, roomId]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (bottom !== atBottomRef.current) {
      atBottomRef.current = bottom;
      setAtBottom(bottom);
    }
    if (bottom && newBelow > 0) {
      setNewBelow(0);
      markRead();
    }
    if (el.scrollTop < 120) void loadOlder();
  }

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setNewBelow(0);
    markRead();
  }

  async function jumpTo(messageId: string) {
    let target = document.getElementById(`msg-${messageId}`);
    // Page back until the quoted message is loaded (at most a few pages).
    for (let i = 0; !target && i < 5; i++) {
      const page = await chatApi.messages(roomId, messages[0]?.createdAt);
      if (!page || page.messages.length === 0) break;
      setMessages((prev) => [...page.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(page.hasMore);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      target = document.getElementById(`msg-${messageId}`);
    }
    if (!target) {
      onError("That message is too far back to show.");
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight(messageId);
    setTimeout(() => setHighlight(null), 1600);
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  async function send(
    body: string,
    file: File | null,
    voice?: { durationMs: number; waveform: number[] } | null,
  ): Promise<boolean> {
    const replyId = replyTo?.id ?? null;
    setReplyTo(null);
    if (file) {
      const result = await chatApi.sendFile(roomId, file, body, replyId, voice);
      if (!result.ok || !result.data) {
        onError(result.error ?? 'The file could not be sent.');
        return false;
      }
      addOwn(result.data);
      return true;
    }
    pendingSeq.current += 1;
    const tempId = `pending-${pendingSeq.current}`;
    const optimistic: ChatMessage = {
      id: tempId,
      roomId,
      sender: myUserId ? { userId: myUserId, name: 'You', role: myRole ?? '', photoUrl: null, online: true } : null,
      body,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            senderUserId: replyTo.sender?.userId ?? null,
            senderName: replyTo.sender?.name ?? null,
            body: replyTo.body,
            attachmentName: replyTo.attachment?.name ?? null,
            deleted: false,
          }
        : null,
      attachment: null,
      reactions: [],
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    stickRef.current = true;
    setMessages((prev) => [...prev, optimistic]);
    const result = await chatApi.send(roomId, body, replyId);
    if (!result.ok || !result.data) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      onError(result.error ?? 'Message failed to send.');
      return false;
    }
    const saved = result.data;
    setMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId);
      return without.some((m) => m.id === saved.id) ? without : [...without, saved];
    });
    onSent(saved);
    return true;
  }

  function addOwn(saved: ChatMessage) {
    stickRef.current = true;
    setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
    onSent(saved);
  }

  async function saveEdit(body: string): Promise<boolean> {
    if (!editing) return false;
    const result = await chatApi.edit(editing.id, body);
    if (!result.ok || !result.data) {
      onError(result.error ?? 'The edit could not be saved.');
      return false;
    }
    const saved = result.data;
    setMessages((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
    return true;
  }

  async function doDelete(message: ChatMessage) {
    setConfirmDelete(null);
    const result = await chatApi.remove(message.id);
    if (!result.ok || !result.data) {
      onError(result.error ?? 'The message could not be deleted.');
      return;
    }
    const saved = result.data;
    setMessages((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
  }

  async function react(message: ChatMessage, emoji: string) {
    if (!myUserId) return;
    // Show it at once; the server's answer (and the live event) settle it.
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== message.id) return m;
        const existing = m.reactions.find((r) => r.emoji === emoji);
        let reactions;
        if (existing?.userIds.includes(myUserId)) {
          reactions = m.reactions
            .map((r) => (r.emoji === emoji ? { ...r, userIds: r.userIds.filter((u) => u !== myUserId) } : r))
            .filter((r) => r.userIds.length > 0);
        } else if (existing) {
          reactions = m.reactions.map((r) => (r.emoji === emoji ? { ...r, userIds: [...r.userIds, myUserId] } : r));
        } else reactions = [...m.reactions, { emoji, userIds: [myUserId] }];
        return { ...m, reactions };
      }),
    );
    const result = await chatApi.react(message.id, emoji);
    if (!result.ok || !result.data) {
      onError(result.error ?? 'The reaction could not be saved.');
      return;
    }
    const saved = result.data;
    setMessages((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
  }

  // ── Read ticks ──────────────────────────────────────────────────────────
  const others = useMemo(
    () => (room ? room.members.filter((m) => m.userId !== myUserId).map((m) => m.userId) : []),
    [room, myUserId],
  );
  const showTicks = Boolean(room && room.membersComplete && others.length > 0 && others.length <= 50);
  function readStateOf(m: ChatMessage): ReadState {
    if (m.pending) return 'pending';
    if (!showTicks) return null;
    const allRead = others.every((id) => {
      const at = readAt[id];
      return at !== null && at !== undefined && at >= m.createdAt;
    });
    return allRead ? 'read' : 'sent';
  }

  if (loading || !room) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <Loader2 className="size-6 animate-spin" aria-label="Loading chat" />
      </div>
    );
  }

  const isGroup = room.kind !== 'direct';
  const online = room.other ? onlineIds.has(room.other.userId) : false;
  const subtitle = typingNames.length
    ? isGroup
      ? `${typingNames.map((n) => n.split(' ')[0]).join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…`
      : 'typing…'
    : room.kind === 'direct'
      ? room.myRole === null
        ? 'Private chat · read-only'
        : online
          ? 'Online'
          : roleLabel(room.other?.role)
      : `${KIND_LABEL[room.kind]} · ${room.memberCount} ${room.memberCount === 1 ? 'member' : 'members'}`;

  const disabledReason = room.canPost
    ? null
    : room.myRole === null
      ? "You're viewing this chat as a school admin. You can read it, but you can't post in it."
      : room.archived
        ? 'This class group is from an earlier year and is now read-only.'
        : room.kind === 'announcements'
          ? 'Only school admins can post announcements.'
          : 'Only group admins can post here.';
  const canInteract = room.myRole !== null && !room.archived;
  const canModerate = room.myRole === 'admin' || myRole === 'school_admin';

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-white px-3 py-2.5 sm:px-4">
        <button type="button" onClick={onBack} className="rounded-lg p-1.5 text-text-muted hover:bg-bg-muted md:hidden" aria-label="Back to chats">
          <ArrowLeft className="size-5" />
        </button>
        <button type="button" onClick={() => onOpenInfo(room)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <RoomAvatar kind={room.kind} title={room.title} photoUrl={room.photoUrl} online={online} seed={room.other?.userId ?? room.id} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-primary-900">{room.title}</span>
              {room.muted && <BellOff className="size-3.5 shrink-0 text-text-faint" aria-label="Muted" />}
              {room.onlyAdminsPost && room.kind !== 'announcements' && <Lock className="size-3.5 shrink-0 text-text-faint" aria-label="Only admins post" />}
              {room.myRole === null && <Eye className="size-3.5 shrink-0 text-warning" aria-label="Read-only oversight" />}
            </span>
            <span className={`block truncate text-xs ${typingNames.length || online ? 'text-success' : 'text-text-muted'}`}>{subtitle}</span>
          </span>
        </button>
        <button type="button" onClick={() => onOpenInfo(room)} className="rounded-lg p-2 text-text-muted hover:bg-bg-muted" aria-label="Chat info">
          <Info className="size-5" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,var(--color-primary-100)_1px,transparent_0)] bg-[length:22px_22px] bg-bg-subtle pb-4"
          role="log"
          aria-live="polite"
          aria-label={`Messages in ${room.title}`}
        >
          {hasMore ? (
            <div className="flex justify-center py-3">
              <button type="button" onClick={() => void loadOlder()} className="text-xs font-medium text-primary-700 hover:underline">
                {loadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            </div>
          ) : (
            <div className="mx-auto mt-4 max-w-sm rounded-xl bg-white/90 px-4 py-3 text-center text-xs text-text-muted shadow-sm">
              {room.description ?? (room.kind === 'direct' ? 'This is the start of your private chat.' : 'This is the start of the group.')}
              {room.kind === 'direct' && (
                <span className="mt-1 block text-text-faint">School admins can review chats to keep everyone safe.</span>
              )}
            </div>
          )}

          {messages.length === 0 && (
            <p className="mt-10 text-center text-sm text-text-muted">No messages yet. Say hello!</p>
          )}

          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || !isSameDay(prev.createdAt, m.createdAt);
            const firstInRun =
              newDay ||
              !prev ||
              prev.sender?.userId !== m.sender?.userId ||
              new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > RUN_GAP_MS;
            const mine = m.sender?.userId === myUserId;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="sticky top-2 z-10 my-3 flex justify-center">
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-text-muted shadow-sm">{dayLabel(m.createdAt)}</span>
                  </div>
                )}
                <MessageBubble
                  message={m}
                  mine={mine}
                  showSender={isGroup}
                  firstInRun={firstInRun}
                  readState={mine ? readStateOf(m) : null}
                  myUserId={myUserId}
                  reactions={room.reactions ?? DEFAULT_REACTIONS}
                  canInteract={canInteract}
                  canModerate={canModerate}
                  highlighted={highlight === m.id}
                  onReply={() => {
                    setEditing(null);
                    setReplyTo(m);
                  }}
                  onEdit={() => {
                    setReplyTo(null);
                    setEditing(m);
                  }}
                  onDelete={() => setConfirmDelete(m)}
                  onReact={(emoji) => void react(m, emoji)}
                  onJumpTo={(id) => void jumpTo(id)}
                  onOpenImage={setLightbox}
                />
              </Fragment>
            );
          })}
        </div>

        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-medium text-primary-700 shadow-lg ring-1 ring-border"
            aria-label={newBelow ? `${newBelow} new messages, jump to latest` : 'Jump to latest'}
          >
            {newBelow > 0 && <span className="rounded-full bg-accent px-1.5 text-primary-900">{newBelow}</span>}
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>

      <Composer
        key={editing?.id ?? 'new'}
        roomId={roomId}
        disabledReason={disabledReason}
        replyTo={replyTo}
        editing={editing}
        myUserId={myUserId}
        onCancelReply={() => setReplyTo(null)}
        onCancelEdit={() => setEditing(null)}
        onSend={send}
        onSaveEdit={saveEdit}
        onTyping={() => void chatApi.typing(roomId)}
        onError={onError}
      />

      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete this message?">
        <p className="text-sm text-text-secondary">
          It will show as &ldquo;This message was deleted&rdquo; for everyone in the chat
          {confirmDelete?.attachment ? ', and the attached file will be removed' : ''}. This can&apos;t be undone.
        </p>
        <div className="mt-6 flex gap-2">
          <Button inline variant="outline" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={() => confirmDelete && void doDelete(confirmDelete)}
            className="inline-flex h-11 items-center rounded-lg bg-error px-3.5 text-sm font-medium text-white hover:bg-error/90 sm:h-9"
          >
            Delete for everyone
          </button>
        </div>
      </Modal>

      <Lightbox
        open={lightbox !== null}
        close={() => setLightbox(null)}
        slides={lightbox ? [{ src: lightbox }] : []}
        plugins={[Zoom]}
        carousel={{ finite: true }}
        render={{ buttonPrev: () => null, buttonNext: () => null }}
      />
    </div>
  );
}

function roleLabel(role: string | undefined): string {
  if (role === 'school_admin') return 'School admin';
  if (role === 'teacher') return 'Teacher';
  if (role === 'student') return 'Student';
  if (role === 'parent') return 'Parent';
  return '';
}
