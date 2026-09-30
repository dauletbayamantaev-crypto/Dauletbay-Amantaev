import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Trash2, X } from 'lucide-react';
import { cls } from '../lib/utils';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
    ai: 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 shadow-sm',
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cls(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        styles[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  className,
  children,
  label,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cls('rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800', className)}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cls('rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, action, icon }: { children: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
        {icon}
        {children}
      </h3>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/**
 * Forma maydoni. Bitta input/select uchun <label> ishlatiladi; tugmalar guruhi uchun `group` bering —
 * aks holda <label> birinchi tugmaga yopishib, tugma nomlarini buzadi.
 */
export function Field({
  label,
  hint,
  children,
  className,
  group,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  group?: boolean;
}) {
  const inner = (
    <>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </>
  );
  return group ? (
    <div role="group" aria-label={label} className={cls('block', className)}>
      {inner}
    </div>
  ) : (
    <label className={cls('block', className)}>{inner}</label>
  );
}

const inputCls =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

/** Agar className'da o'z kengligi (w-...) berilgan bo'lsa, standart w-full qo'shilmaydi */
const widthCls = (className?: string) => (/(^|\s)w-/.test(className ?? '') ? '' : 'w-full');

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => <input ref={ref} {...rest} className={cls(inputCls, widthCls(className), className)} />,
);

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...rest} className={cls(inputCls, 'resize-y', widthCls(className), className)} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cls(inputCls, 'pr-8', widthCls(className), className)}>
      {children}
    </select>
  );
}

/** Raqam kiritish: bo'sh qiymat null bo'ladi */
export function NumberInput({
  value,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      {...rest}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cls('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', className ?? 'bg-slate-100 text-slate-700')}>
      {children}
    </span>
  );
}

export function Progress({ value, color = '#6366f1', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cls('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cls(
              'flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl',
              wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
            )}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <IconButton label="Yopish" onClick={onClose}>
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Ikki bosqichli o'chirish tugmasi — tasodifan o'chirib yubormaslik uchun */
export function DeleteButton({ onConfirm, label = "O'chirish" }: { onConfirm: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <Button variant="danger" size="sm" onClick={onConfirm} icon={<Trash2 className="h-4 w-4" />}>
      Tasdiqlash
    </Button>
  ) : (
    <IconButton label={label} onClick={() => setArmed(true)} className="hover:text-rose-600">
      <Trash2 className="h-4 w-4" />
    </IconButton>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: NoInfer<T>; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (v: NoInfer<T>) => void;
}) {
  return (
    <div className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cls(
            'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition',
            value === t.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200',
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cls('mt-1 text-xl font-bold tabular-nums', tone ?? 'text-slate-900')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{children}</div>;
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            type="button"
            key={String(o.id)}
            onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
            className={cls(
              'rounded-lg border px-2.5 py-1 text-sm transition',
              on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 1–5 shkala (kayfiyat, energiya) */
export function Scale({ value, onChange, labels }: { value: number | null; onChange: (v: number) => void; labels: string[] }) {
  return (
    <div className="flex gap-1.5">
      {labels.map((l, i) => (
        <button
          type="button"
          key={i}
          onClick={() => onChange(i + 1)}
          title={`${i + 1}`}
          className={cls(
            'flex-1 rounded-xl border py-2 text-lg transition',
            value === i + 1 ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:bg-slate-50',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
