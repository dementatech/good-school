'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Panel width — 'md' (default) for a form, 'lg' for wider content. */
  size?: 'md' | 'lg';
}

/**
 * A right-anchored slide-over panel, rendered through a portal into
 * document.body. Full-height, pinned to the right edge, its own scroll — the
 * body scrolls under a sticky header rather than the whole page moving.
 *
 * Keeps the name `Modal` and the `open/onClose/title/size` API so every
 * existing call site is unchanged.
 */
export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] print:hidden" role="presentation">
          <motion.div
            className="absolute inset-0 bg-primary-700/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            className={`absolute top-0 right-0 h-full w-full ${
              size === 'lg' ? 'max-w-2xl' : 'max-w-md'
            } bg-white shadow-xl border-l border-[#EAEAEA] flex flex-col sm:rounded-l-2xl`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-[#EAEAEA] shrink-0">
                <h2 className="font-semibold text-primary-900 truncate">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1 -m-1 rounded-lg text-text-muted hover:bg-[#FAFAFA] hover:text-primary-900 shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
