'use client'

/**
 * Shared building blocks for TERECO's staff field-data-collection forms
 * (DailyLessonWizard, AttendanceForm, and any future one). Pulled out of
 * DailyLessonWizard.tsx verbatim when attendance-taking became its own form,
 * so both wizards render identically instead of drifting apart.
 *
 * Palette (locked, dark-mode immune via darkMode: 'class' + explicit values):
 *   Blue   primary-700  primary / nav / focus rings
 *   Amber  #F5CA93  Submit button ONLY (final irreversible action)
 *   Ice    #FFFFFF  page background
 *   White  #FFFFFF  card surfaces
 *   Ink    primary-900  primary text
 *   Slate  #666666  secondary text
 *   Mist   #A3A3A3  faint / placeholder
 *   Tint   #F5F5F5  focus fill / row hover
 *   Danger #C0392B  errors only
 */

import React, { useId, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, ChevronDown, CheckCircle2, Pencil } from 'lucide-react'

/* ─────────────────────────────────────────────────
   Primitive: cn
───────────────────────────────────────────────── */
export function cn(...c: (string | false | undefined | null)[]) { return c.filter(Boolean).join(' ') }

/* ─────────────────────────────────────────────────
   Primitive: FloatingInput
───────────────────────────────────────────────── */
export function FloatingInput({
  label, type = 'text', value, onChange, error, hint, required,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  label: string; type?: string; value: string; onChange: (v: string) => void
  error?: string; hint?: string; required?: boolean
}) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const lifted = focused || value.length > 0

  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        required={required}
        className={cn(
          'peer w-full h-14 px-4 pt-5 pb-2 rounded-xl border bg-white text-sm text-primary-900',
          'outline-none transition-all duration-200 placeholder-transparent',
          error
            ? 'border-error ring-1 ring-error/20'
            : 'border-primary-700/15 hover:border-primary-700/30 focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10'
        )}
        placeholder={label}
        {...rest}
      />
      <label
        htmlFor={id}
        className={cn(
          'absolute left-4 pointer-events-none transition-all duration-200 font-medium select-none',
          lifted ? 'top-2 text-[10px] tracking-wide uppercase' : 'top-[17px] text-sm',
          error ? 'text-error' : focused ? 'text-primary-700' : 'text-text-faint'
        )}
      >
        {label}{required && ' *'}
      </label>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-error">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> {error}
        </p>
      )}
      {!error && hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-text-faint">{hint}</p>}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Primitive: FloatingSelect
───────────────────────────────────────────────── */
export function FloatingSelect({
  label, options, value, onChange, error, hint, required,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  required?: boolean
}) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const lifted = focused || value.length > 0

  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-invalid={!!error}
        required={required}
        className={cn(
          'peer w-full h-14 px-4 pt-5 pb-2 rounded-xl border bg-white text-sm text-primary-900',
          'outline-none appearance-none transition-all duration-200 cursor-pointer',
          // Deliberately NOT `text-transparent` when empty: native <option>
          // elements inherit their colour from the <select>, so hiding the
          // placeholder that way also hid every item in the open dropdown
          // until something was selected. The placeholder option below has no
          // text content, so it already renders blank on its own.
          error
            ? 'border-error ring-1 ring-error/20'
            : 'border-primary-700/15 hover:border-primary-700/30 focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10'
        )}
      >
        <option value="" disabled />
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <label
        htmlFor={id}
        className={cn(
          'absolute left-4 pointer-events-none transition-all duration-200 font-medium select-none',
          lifted ? 'top-2 text-[10px] tracking-wide uppercase' : 'top-[17px] text-sm',
          error ? 'text-error' : focused ? 'text-primary-700' : 'text-text-faint'
        )}
      >
        {label}{required && ' *'}
      </label>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" aria-hidden />
      {error && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-error">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> {error}
        </p>
      )}
      {!error && hint && <p className="mt-1.5 text-xs text-text-faint">{hint}</p>}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Primitive: FloatingTextarea
───────────────────────────────────────────────── */
export function FloatingTextarea({
  label, value, onChange, error, required, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void
  error?: string; required?: boolean; rows?: number
}) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const lifted = focused || value.length > 0

  return (
    <div className="relative">
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={rows}
        aria-invalid={!!error}
        required={required}
        className={cn(
          'peer w-full px-4 pt-7 pb-3 rounded-xl border bg-white text-sm text-primary-900',
          'outline-none resize-none transition-all duration-200',
          error
            ? 'border-error ring-1 ring-error/20'
            : 'border-primary-700/15 hover:border-primary-700/30 focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10'
        )}
        placeholder=" "
      />
      <label
        htmlFor={id}
        className={cn(
          'absolute left-4 pointer-events-none transition-all duration-200 font-medium select-none',
          lifted ? 'top-2.5 text-[10px] tracking-wide uppercase' : 'top-4 text-sm',
          error ? 'text-error' : focused ? 'text-primary-700' : 'text-text-faint'
        )}
      >
        {label}{required && ' *'}
      </label>
      {error && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-error">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Primitive: RadioCard
───────────────────────────────────────────────── */
export function RadioCard({
  value, label, description, selected, onChange,
}: { value: string; label: string; description?: string; selected: boolean; onChange: (v: string) => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onChange(value)}
      className={cn(
        'w-full text-left p-4 rounded-xl border-2 transition-all duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-1',
        selected
          ? 'border-primary-700 bg-bg-muted'
          : 'border-primary-700/10 bg-white hover:border-primary-700/25 hover:bg-white'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={cn('text-sm font-semibold', selected ? 'text-primary-700' : 'text-primary-900')}>{label}</p>
          {description && <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</p>}
        </div>
        <div className={cn(
          'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150',
          selected ? 'border-primary-700 bg-primary-700' : 'border-[#A3A3A3]'
        )}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </div>
    </button>
  )
}

/* ─────────────────────────────────────────────────
   Primitive: AttendanceRow — one learner, tap to mark absent
───────────────────────────────────────────────── */
export function AttendanceRow({
  name, systemId, present, onToggle,
}: { name: string; systemId: string | null; present: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-1 border-b border-primary-700/6 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary-900 truncate">{name}</p>
        {systemId && <p className="text-xs text-text-faint">{systemId}</p>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!present}
        className={cn(
          'shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer',
          present
            ? 'bg-bg-muted text-primary-700 hover:bg-primary-100'
            : 'bg-error/10 text-error hover:bg-error/15'
        )}
      >
        {present ? 'Present' : 'Absent'}
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Signature element: Segmented progress pill
───────────────────────────────────────────────── */
export function ProgressPill({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-400',
            i === current
              ? 'flex-1 bg-primary-700'          // active — wide
              : i < current
              ? 'w-5 bg-primary-700'              // done — medium teal
              : 'w-5 bg-primary-700/12'           // future — faint
          )}
          style={{ transition: 'all 350ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Review field row
───────────────────────────────────────────────── */
export function ReviewRow({
  label, value, onEdit,
}: { label: string; value: string; onEdit?: () => void }) {
  if (!value || value.trim() === '') return null
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-primary-700/6 last:border-0 group">
      <p className="text-xs text-text-faint font-medium shrink-0 w-32 pt-0.5">{label}</p>
      <p className="text-sm text-primary-900 flex-1 leading-relaxed">{value}</p>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800 transition-all duration-150 cursor-pointer flex-shrink-0"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Success screen
───────────────────────────────────────────────── */
export function SuccessScreen({
  reference, teacherName, heading, subheading, anotherLabel, onAnother, onHome,
}: {
  reference: string
  teacherName: string
  heading: string
  subheading: string
  anotherLabel: string
  onAnother: () => void
  onHome: () => void
}) {
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const id = setInterval(() => setCountdown(c => {
      if (c <= 1) { clearInterval(id); onHome(); return 0 }
      return c - 1
    }), 1000)
    return () => clearInterval(id)
  }, [onHome])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center min-h-screen bg-white px-6 text-center"
    >
      {/* Check mark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 20 }}
        className="w-20 h-20 rounded-full flex items-center justify-center mb-8"
        style={{ background: 'linear-gradient(145deg, var(--color-primary-800) 0%, var(--color-primary-700) 100%)' }}
      >
        <CheckCircle2 className="w-9 h-9 text-white" strokeWidth={1.75} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <h2 className="text-2xl font-bold text-primary-900 tracking-tight mb-2">{heading}</h2>
        <p className="text-text-muted text-sm mb-6">{subheading}</p>

        {/* Reference card */}
        <div className="inline-block rounded-2xl border border-primary-700/12 bg-white px-8 py-5 mb-8"
          style={{ boxShadow: '0 2px 12px rgba(2,70,91,0.08)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-faint mb-1">Reference</p>
          <p className="text-xl font-bold text-primary-700 tracking-wider font-mono">{reference}</p>
          <div className="mt-3 pt-3 border-t border-primary-700/8 space-y-0.5">
            <p className="text-xs text-text-muted">{teacherName}</p>
            <p className="text-xs text-text-faint">{new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onAnother}
            className="w-full sm:w-auto h-11 px-6 rounded-xl bg-primary-700 text-white text-sm font-semibold hover:bg-primary-800 active:bg-primary-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2"
          >
            {anotherLabel}
          </button>
          <button
            type="button"
            onClick={onHome}
            className="w-full sm:w-auto h-11 px-6 rounded-xl border border-primary-700/20 text-primary-700 text-sm font-semibold hover:bg-bg-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2"
          >
            Back to forms
          </button>
        </div>

        {/* Auto-redirect countdown */}
        <p className="mt-6 text-xs text-text-faint">
          Returning to forms in <span className="font-semibold text-text-muted">{countdown}s</span>
        </p>
      </motion.div>
    </motion.div>
  )
}
