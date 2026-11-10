'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Clock, Copy, FileText, MoreVertical, Pencil, Reply, SmilePlus, Trash2 } from 'lucide-react';
import { PersonAvatar } from './ChatAvatar';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { bubbleTime, fileSize, messageSnippet } from '@/lib/communications/format';
import type { ChatMessage } from '@/lib/communications/types';

export type ReadState = 'pending' | 'sent' | 'read' | null;

interface Props {
  message: ChatMessage;
  mine: boolean;
  /** Group chats show who said what. */
  showSender: boolean;
  /** First of a run from the same person: gets the avatar and a tail. */
  firstInRun: boolean;
  readState: ReadState;
  myUserId: string | undefined;
  reactions: string[];
  canInteract: boolean;
  canModerate: boolean;
  highlighted: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onJumpTo: (messageId: string) => void;
  onOpenImage: (url: string) => void;
}

export function MessageBubble({
  message,
  mine,
  showSender,
  firstInRun,
  readState,
  myUserId,
  reactions,
  canInteract,
  canModerate,
  highlighted,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onJumpTo,
  onOpenImage,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const deleted = message.deletedAt !== null;

  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;
    function close(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, pickerOpen]);

  const canEdit = mine && !deleted && !message.pending && canInteract;
  const canDelete = !deleted && !message.pending && (mine || canModerate);
  const showActions = !deleted && !message.pending;

  const bubbleTone = mine ? 'bg-primary-700 text-white' : 'bg-white text-text-primary border border-border';
  const corner = firstInRun ? (mine ? 'rounded-tr-md' : 'rounded-tl-md') : '';

  return (
    <div
      id={`msg-${message.id}`}
      className={`group flex gap-2 px-3 sm:px-5 ${mine ? 'justify-end' : 'justify-start'} ${firstInRun ? 'mt-3' : 'mt-0.5'}`}
    >
      {!mine && showSender && (
        <span className="w-8 shrink-0">
          {firstInRun && message.sender && (
            <PersonAvatar name={message.sender.name} photoUrl={message.sender.photoUrl} size="sm" seed={message.sender.userId} />
          )}
        </span>
      )}

      <div ref={wrapRef} className={`relative flex max-w-[85%] sm:max-w-[70%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <div
          className={`relative rounded-2xl px-3 py-2 shadow-sm transition-shadow ${bubbleTone} ${corner} ${
            highlighted ? 'ring-4 ring-accent/60' : ''
          } ${deleted ? 'opacity-80' : ''}`}
        >
          {!mine && showSender && firstInRun && message.sender && (
            <p className="mb-0.5 text-xs font-semibold text-primary-700">{message.sender.name}</p>
          )}

          {message.replyTo && !deleted && (
            <button
              type="button"
              onClick={() => onJumpTo(message.replyTo!.id)}
              className={`mb-1.5 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-xs ${
                mine ? 'border-accent bg-white/15 text-white/90' : 'border-primary-700 bg-bg-muted text-text-secondary'
              }`}
            >
              <span className={`block font-semibold ${mine ? 'text-white' : 'text-primary-700'}`}>
                {message.replyTo.senderUserId === myUserId ? 'You' : (message.replyTo.senderName ?? 'Someone')}
              </span>
              <span className="line-clamp-2">
                {message.replyTo.deleted
                  ? 'This message was deleted'
                  : message.replyTo.body ||
                    (message.replyTo.isVoice ? '🎤 Voice message' : message.replyTo.attachmentName ? `📎 ${message.replyTo.attachmentName}` : '')}
              </span>
            </button>
          )}

          {deleted ? (
            <p className={`text-sm italic ${mine ? 'text-white/80' : 'text-text-muted'}`}>This message was deleted</p>
          ) : (
            <>
              {message.attachment?.isImage && (
                <button
                  type="button"
                  onClick={() => onOpenImage(message.attachment!.url)}
                  className="mb-1 block overflow-hidden rounded-xl"
                  aria-label={`Open picture ${message.attachment.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={message.attachment.url}
                    alt={message.attachment.name}
                    loading="lazy"
                    className="max-h-72 w-full max-w-xs object-cover"
                  />
                </button>
              )}
              {message.attachment?.isVoice && (
                <VoiceNotePlayer id={message.id} attachment={message.attachment} sender={message.sender} mine={mine} />
              )}
              {message.attachment && !message.attachment.isImage && !message.attachment.isVoice && (
                <a
                  href={message.attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={message.attachment.name}
                  className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2 ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-bg-muted hover:bg-primary-50'}`}
                >
                  <FileText className={`size-8 shrink-0 ${mine ? 'text-white' : 'text-primary-700'}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{message.attachment.name}</span>
                    <span className={`text-xs ${mine ? 'text-white/75' : 'text-text-muted'}`}>
                      {fileSize(message.attachment.size)} · Open
                    </span>
                  </span>
                </a>
              )}
              {message.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{linkify(message.body, mine)}</p>}
            </>
          )}

          <span className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-white/75' : 'text-text-faint'}`}>
            {message.editedAt && !deleted && <span>Edited</span>}
            <time dateTime={message.createdAt}>{bubbleTime(message.createdAt)}</time>
            {mine && readState === 'pending' && <Clock className="size-3" aria-label="Sending" />}
            {mine && readState === 'sent' && <Check className="size-3.5" aria-label="Sent" />}
            {mine && readState === 'read' && <CheckCheck className="size-3.5 text-accent" aria-label="Read" />}
          </span>
        </div>

        {message.reactions.length > 0 && (
          <div className={`-mt-1.5 flex flex-wrap gap-1 ${mine ? 'justify-end pr-2' : 'pl-2'}`}>
            {message.reactions.map((r) => {
              const reacted = myUserId ? r.userIds.includes(myUserId) : false;
              return (
                <button
                  key={r.emoji}
                  type="button"
                  disabled={!canInteract}
                  onClick={() => onReact(r.emoji)}
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs shadow-sm ${
                    reacted ? 'border-primary-700 bg-primary-50' : 'border-border bg-white'
                  }`}
                  aria-pressed={reacted}
                  aria-label={`${r.emoji} ${r.userIds.length}${reacted ? ', including you' : ''}`}
                >
                  <span>{r.emoji}</span>
                  {r.userIds.length > 1 && <span className="text-text-muted">{r.userIds.length}</span>}
                </button>
              );
            })}
          </div>
        )}

        {showActions && (
          <div
            className={`absolute top-0 ${mine ? 'right-full mr-1' : 'left-full ml-1'} flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 ${
              menuOpen || pickerOpen ? 'opacity-100' : ''
            }`}
          >
            {canInteract && (
              <button
                type="button"
                onClick={() => {
                  setPickerOpen((o) => !o);
                  setMenuOpen(false);
                }}
                className="rounded-full p-1.5 text-text-faint hover:bg-white hover:text-primary-700"
                aria-label="React"
                aria-expanded={pickerOpen}
              >
                <SmilePlus className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen((o) => !o);
                setPickerOpen(false);
              }}
              className="rounded-full p-1.5 text-text-faint hover:bg-white hover:text-primary-700"
              aria-label="Message options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical className="size-4" />
            </button>
          </div>
        )}

        {pickerOpen && (
          <div
            className={`absolute bottom-full z-20 mb-1 flex gap-1 rounded-full border border-border bg-white px-2 py-1 shadow-lg ${mine ? 'right-0' : 'left-0'}`}
            role="menu"
            aria-label="Pick a reaction"
          >
            {reactions.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                onClick={() => {
                  onReact(emoji);
                  setPickerOpen(false);
                }}
                className="rounded-full p-1 text-xl leading-none transition-transform hover:scale-125"
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {menuOpen && (
          <div
            className={`absolute top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg ${mine ? 'right-0' : 'left-0'}`}
            role="menu"
          >
            {canInteract && (
              <MenuItem icon={Reply} label="Reply" onClick={() => { setMenuOpen(false); onReply(); }} />
            )}
            {message.body && (
              <MenuItem
                icon={Copy}
                label="Copy text"
                onClick={() => {
                  setMenuOpen(false);
                  void navigator.clipboard?.writeText(messageSnippet(message));
                }}
              />
            )}
            {canEdit && <MenuItem icon={Pencil} label="Edit" onClick={() => { setMenuOpen(false); onEdit(); }} />}
            {canDelete && (
              <MenuItem icon={Trash2} label={mine ? 'Delete' : 'Delete (moderate)'} danger onClick={() => { setMenuOpen(false); onDelete(); }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Reply;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg-muted ${danger ? 'text-error' : 'text-text-primary'}`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** Plain text with web addresses turned into links. Never renders HTML. */
function linkify(text: string, mine: boolean): React.ReactNode[] {
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={`underline underline-offset-2 ${mine ? 'text-white' : 'text-primary-700'}`}
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}
