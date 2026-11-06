'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { useToast } from '@/components/ui/ToastProvider';
import { useRealtimeSocket, type RealtimeEvent } from '@/lib/realtime/useRealtimeSocket';
import { chatApi } from '@/lib/communications/api';
import type { ChatMessage, RoomDetail, RoomSummary } from '@/lib/communications/types';
import { RoomList } from './RoomList';
import { ChatThread } from './ChatThread';
import { NewChatPanel, NewGroupPanel } from './NewChatPanels';
import { RoomInfoPanel } from './RoomInfoPanel';

const TYPING_MS = 5000;
const STAFF_ROLES = new Set(['school_admin', 'teacher', 'staff']);

/**
 * The whole chat experience, shared by every portal (school admin, staff,
 * parent, student): the chat list on the left, the open conversation on the
 * right; one pane at a time on a phone. Owns the one realtime socket for the
 * page and hands its events to the open thread through `subscribe`.
 */
export function ChatApp() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const myUserId = user?.id;
  const myRole = user?.role;
  const isStaff = STAFF_ROLES.has(myRole ?? '');
  const isSchoolAdmin = myRole === 'school_admin';
  // The Dementa support team: only their per-school support chats, no new chats or groups.
  const isSupportTeam = myRole === 'super_admin';

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [oversight, setOversight] = useState(false);
  const [oversightQuery, setOversightQuery] = useState('');
  const [oversightRooms, setOversightRooms] = useState<RoomSummary[]>([]);
  const [oversightLoading, setOversightLoading] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [info, setInfo] = useState<RoomDetail | null>(null);
  const [typing, setTyping] = useState<Record<string, Record<string, { name: string; at: number }>>>({});
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  // Old notification links used ?conversation=; the chat ids carried over unchanged.
  const selectedId = params.get('room') ?? params.get('conversation');

  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      next.delete('conversation');
      if (id) next.set('room', id);
      else next.delete('room');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const loadRooms = useCallback(async () => {
    const list = await chatApi.rooms();
    if (list) {
      setRooms(list);
      setOnline((prev) => {
        const next = new Set(prev);
        for (const r of list) if (r.other?.online) next.add(r.other.userId);
        return next;
      });
    } else toast.error("Your chats couldn't be loaded. Check your connection and try again.");
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void (async () => {
      await loadRooms();
    })();
  }, [loadRooms]);

  // Oversight search, debounced.
  useEffect(() => {
    if (!oversight) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setOversightLoading(true);
      const list = await chatApi.oversightRooms(oversightQuery);
      if (cancelled) return;
      setOversightRooms(list ?? []);
      setOversightLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [oversight, oversightQuery]);

  // A quiet refetch of the list (debounced) for events that change its order or badges.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void loadRooms(), 400);
  }, [loadRooms]);

  // ── One socket for the page; the thread subscribes to it ───────────────
  const listeners = useRef(new Set<(e: RealtimeEvent) => void>());
  const subscribe = useCallback((listener: (e: RealtimeEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const selectedRef = useRef(selectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const clearTyping = useCallback((roomId: string, userId: string) => {
    setTyping((prev) => {
      if (!prev[roomId]?.[userId]) return prev;
      const room = { ...prev[roomId] };
      delete room[userId];
      return { ...prev, [roomId]: room };
    });
  }, []);

  useRealtimeSocket((event) => {
    for (const l of listeners.current) l(event);

    if (event.type === 'chat_message') {
      const { roomId, message } = event;
      const isOpen = selectedRef.current === roomId && document.visibilityState === 'visible';
      // Stop showing "typing…" for whoever just sent.
      if (message.sender) clearTyping(roomId, message.sender.userId);
      setRooms((prev) => {
        const idx = prev.findIndex((r) => r.id === roomId);
        if (idx === -1) {
          scheduleRefetch();
          return prev;
        }
        const mine = message.sender?.userId === myUserId;
        const room = prev[idx];
        const updated: RoomSummary = {
          ...room,
          lastMessage: {
            id: message.id,
            senderUserId: message.sender?.userId ?? null,
            senderName: message.sender?.name ?? null,
            body: message.body,
            hasAttachment: Boolean(message.attachment),
            attachmentName: message.attachment?.name ?? null,
            isVoice: message.attachment?.isVoice ?? false,
            deleted: false,
            createdAt: message.createdAt,
          },
          lastMessageAt: message.createdAt,
          unreadCount: mine || isOpen ? room.unreadCount : room.unreadCount + 1,
        };
        return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    } else if (event.type === 'chat_message_updated') {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === event.roomId && r.lastMessage?.id === event.message.id
            ? {
                ...r,
                lastMessage: {
                  ...r.lastMessage,
                  body: event.message.body,
                  deleted: event.message.deletedAt !== null,
                  hasAttachment: Boolean(event.message.attachment),
                  attachmentName: event.message.attachment?.name ?? null,
                },
              }
            : r,
        ),
      );
    } else if (event.type === 'chat_read' && event.userId === myUserId) {
      // Read in another tab or device.
      setRooms((prev) => prev.map((r) => (r.id === event.roomId ? { ...r, unreadCount: 0, lastReadAt: event.lastReadAt } : r)));
    } else if (event.type === 'chat_room_updated') {
      scheduleRefetch();
      if (event.roomId === selectedRef.current) setReloadKey((k) => k + 1);
    } else if (event.type === 'chat_typing') {
      setTyping((prev) => ({
        ...prev,
        [event.roomId]: { ...(prev[event.roomId] ?? {}), [event.userId]: { name: event.name, at: Date.now() } },
      }));
    } else if (event.type === 'chat_presence') {
      setOnline((prev) => {
        const next = new Set(prev);
        if (event.online) next.add(event.userId);
        else next.delete(event.userId);
        return next;
      });
    }
  }, Boolean(user));

  // Typing indicators fade if the person stops.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        let changed = false;
        const next: typeof prev = {};
        for (const [roomId, people] of Object.entries(prev)) {
          const kept = Object.fromEntries(Object.entries(people).filter(([, v]) => now - v.at < TYPING_MS));
          if (Object.keys(kept).length !== Object.keys(people).length) changed = true;
          if (Object.keys(kept).length) next[roomId] = kept;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Room members' online state when a group is opened.
  const absorbMembers = useCallback((detail: RoomDetail) => {
    setOnline((prev) => {
      const next = new Set(prev);
      for (const m of detail.members) {
        if (m.online) next.add(m.userId);
        else next.delete(m.userId);
      }
      return next;
    });
  }, []);

  const typingByRoom = useMemo(
    () => Object.fromEntries(Object.entries(typing).map(([roomId, people]) => [roomId, Object.values(people).map((p) => p.name)])),
    [typing],
  );

  const onRead = useCallback((roomId: string) => {
    setRooms((prev) => prev.map((r) => (r.id === roomId && r.unreadCount ? { ...r, unreadCount: 0 } : r)));
  }, []);

  const onSent = useCallback((message: ChatMessage) => {
    setRooms((prev) => {
      const idx = prev.findIndex((r) => r.id === message.roomId);
      if (idx === -1) return prev;
      const room = prev[idx];
      if (room.lastMessage?.id === message.id) return prev;
      const updated: RoomSummary = {
        ...room,
        lastMessage: {
          id: message.id,
          senderUserId: myUserId ?? null,
          senderName: null,
          body: message.body,
          hasAttachment: Boolean(message.attachment),
          attachmentName: message.attachment?.name ?? null,
          isVoice: message.attachment?.isVoice ?? false,
          deleted: false,
          createdAt: message.createdAt,
        },
        lastMessageAt: message.createdAt,
      };
      return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, [myUserId]);

  async function messagePerson(userId: string) {
    const result = await chatApi.startDirect(userId);
    if (!result.ok || !result.data) {
      toast.error(result.error ?? "That chat couldn't be started.");
      return;
    }
    setInfo(null);
    setOversight(false);
    await loadRooms();
    select(result.data.id);
  }

  const listRooms = oversight ? oversightRooms : rooms;
  const listLoading = oversight ? oversightLoading : loading;

  return (
    <div className="-m-3 flex h-[calc(100dvh-4rem)] overflow-hidden bg-white sm:-m-6 sm:h-[calc(100dvh-4rem)] md:m-0 md:h-[calc(100dvh-7rem)] md:rounded-2xl md:border md:border-border md:shadow-sm">
      <aside
        className={`w-full shrink-0 border-r border-border md:w-80 lg:w-96 ${selectedId ? 'hidden md:block' : 'block'}`}
        aria-label="Chat list"
      >
        <RoomList
          rooms={listRooms}
          loading={listLoading}
          selectedId={selectedId}
          myUserId={myUserId}
          typingByRoom={typingByRoom}
          onlineIds={online}
          onSelect={select}
          onNewChat={isSupportTeam ? null : () => setNewChat(true)}
          onNewGroup={isStaff ? () => setNewGroup(true) : null}
          oversight={
            isSchoolAdmin
              ? { active: oversight, toggle: () => setOversight((o) => !o), query: oversightQuery, setQuery: setOversightQuery }
              : null
          }
        />
      </aside>

      <section className={`min-w-0 flex-1 ${selectedId ? 'block' : 'hidden md:block'}`} aria-label="Conversation">
        {selectedId ? (
          <ChatThread
            key={selectedId}
            roomId={selectedId}
            myUserId={myUserId}
            myRole={myRole}
            onlineIds={online}
            typingNames={typingByRoom[selectedId] ?? []}
            subscribe={subscribe}
            onBack={() => select(null)}
            onOpenInfo={(room) => {
              absorbMembers(room);
              setInfo(room);
            }}
            onRead={onRead}
            onSent={onSent}
            reloadKey={reloadKey}
            onError={toast.error}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg-subtle px-6 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-primary-100 text-primary-700">
              <MessagesSquare className="size-8" />
            </span>
            <h2 className="text-lg font-semibold text-primary-900">{isSupportTeam ? 'School support chats' : 'Your school\u2019s chats'}</h2>
            <p className="max-w-sm text-sm text-text-muted">
              {isSupportTeam
                ? 'Every school has a support chat with its school admins. Search for a school on the left to open it.'
                : 'Pick a chat on the left, or start a new one. '}
              {isSupportTeam ? '' : isStaff
                ? 'Class groups, the staff room and school announcements are set up for you.'
                : 'Your class groups and school announcements are set up for you.'}
            </p>
          </div>
        )}
      </section>

      <NewChatPanel
        open={newChat}
        onClose={() => setNewChat(false)}
        isStaff={isStaff}
        onError={toast.error}
        onStarted={async (room) => {
          setNewChat(false);
          setOversight(false);
          await loadRooms();
          select(room.id);
        }}
      />
      {isStaff && (
        <NewGroupPanel
          open={newGroup}
          onClose={() => setNewGroup(false)}
          onError={toast.error}
          onCreated={async (room) => {
            setNewGroup(false);
            toast.success(`${room.title} created.`);
            await loadRooms();
            select(room.id);
          }}
        />
      )}
      {info && (
        <RoomInfoPanel
          key={info.id}
          room={info}
          myUserId={myUserId}
          myRole={myRole}
          onlineIds={online}
          onClose={() => setInfo(null)}
          onChanged={() => {
            scheduleRefetch();
            setReloadKey((k) => k + 1);
          }}
          onLeft={() => {
            setInfo(null);
            select(null);
            void loadRooms();
          }}
          onMessage={(userId) => void messagePerson(userId)}
          onError={toast.error}
          onSuccess={toast.success}
        />
      )}
    </div>
  );
}
