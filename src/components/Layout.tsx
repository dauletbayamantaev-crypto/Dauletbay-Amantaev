import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Bot,
  Compass,
  FolderKanban,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Repeat,
  Settings,
  Target,
  Wallet,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth, useData } from '../lib/store';
import { isArtifact } from '../lib/artifact';
import { cls } from '../lib/utils';

// ---------------- Marshrutlash ----------------
// Oddiy saytda manzil (#/bo'lim) ishlatiladi — orqaga tugmasi va havolalar ishlaydi.
// claude.ai Artifact ichida sahifa manzilini o'zgartirib bo'lmaydi (oq ekran bo'lib qoladi),
// shuning uchun u yerda joriy bo'lim faqat xotirada saqlanadi.

const USE_HASH = !isArtifact;
let currentPath = USE_HASH ? window.location.hash : '';
const routeListeners = new Set<() => void>();

const parsePath = (p: string) => {
  const parts = p.replace(/^#?\/?/, '').split('/').filter(Boolean);
  return { page: parts[0] || 'dashboard', id: parts[1] as string | undefined };
};

if (USE_HASH) {
  window.addEventListener('hashchange', () => {
    currentPath = window.location.hash;
    routeListeners.forEach((fn) => fn());
  });
}

export function useRoute() {
  const [route, setRoute] = useState(() => parsePath(currentPath));
  useEffect(() => {
    const on = () => {
      setRoute(parsePath(currentPath));
      window.scrollTo({ top: 0 });
    };
    routeListeners.add(on);
    return () => {
      routeListeners.delete(on);
    };
  }, []);
  return route;
}

export const navigate = (path: string) => {
  if (USE_HASH) {
    window.location.hash = `/${path}`;
    return;
  }
  currentPath = path;
  routeListeners.forEach((fn) => fn());
};

export function Link({
  to,
  className,
  children,
  onClick,
}: {
  to: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  if (USE_HASH)
    return (
      <a href={`#/${to}`} className={className} onClick={onClick}>
        {children}
      </a>
    );
  // href'siz havola: brauzer ham, Claude oynasi ham hech qayerga o'tmaydi — faqat ilova ichida
  const go = () => {
    onClick?.();
    navigate(to);
  };
  return (
    <a
      role="link"
      tabIndex={0}
      className={cls('cursor-pointer', className)}
      onClick={(e) => {
        e.preventDefault();
        go();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go();
        }
      }}
    >
      {children}
    </a>
  );
}

// ---------------- Navigatsiya ----------------

const NAV: { group?: string; items: { id: string; label: string; icon: React.ElementType }[] }[] = [
  { items: [{ id: 'dashboard', label: 'Bosh sahifa', icon: LayoutDashboard }] },
  {
    group: 'Rivojlanish',
    items: [
      { id: 'strategy', label: 'Strategiya', icon: Compass },
      { id: 'goals', label: 'Maqsadlar', icon: Target },
      { id: 'projects', label: 'Loyihalar', icon: FolderKanban },
      { id: 'tasks', label: 'Vazifalar', icon: ListChecks },
    ],
  },
  {
    group: 'Hayot',
    items: [
      { id: 'finance', label: 'Moliya', icon: Wallet },
      { id: 'habits', label: 'Odatlar', icon: Repeat },
      { id: 'health', label: "Sog'liq", icon: HeartPulse },
      { id: 'journal', label: 'Kundalik', icon: BookOpen },
      { id: 'learning', label: "O'rganish", icon: GraduationCap },
    ],
  },
  {
    group: 'AI',
    items: [
      { id: 'coach', label: 'AI murabbiy', icon: Bot },
      { id: 'settings', label: 'Sozlamalar', icon: Settings },
    ],
  },
];

const MOBILE = ['dashboard', 'goals', 'projects', 'finance'];

function NavList({ page, onPick }: { page: string; onPick?: () => void }) {
  return (
    <nav className="space-y-4">
      {NAV.map((g, gi) => (
        <div key={gi}>
          {g.group && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.group}</p>}
          <div className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = page === it.id;
              return (
                <Link
                  key={it.id}
                  to={it.id}
                  onClick={onPick}
                  className={cls(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                    active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function UserBox() {
  const { user, logout, mode } = useAuth();
  const { profile } = useData();
  const name = profile.name || user?.displayName || user?.email || 'Foydalanuvchi';
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
      {user?.photoURL ? (
        <img src={user.photoURL} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{name}</p>
        <p className="truncate text-xs text-slate-500">
          {mode === 'cloud' ? 'Bulutda saqlanmoqda' : mode === 'artifact' ? 'Claude hisobida saqlanmoqda' : 'Mahalliy rejim'}
        </p>
      </div>
      {!isArtifact && (
        <button onClick={logout} title="Chiqish" aria-label="Chiqish" className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700">
          <LogOut className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
        <Compass className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-bold leading-tight text-slate-900">Hayot Kompasi</p>
        <p className="text-[11px] text-slate-500">Shaxsiy boshqaruv tizimi</p>
      </div>
    </div>
  );
}

export function Shell({ page, children }: { page: string; children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const { error, clearError } = useData();
  const { mode } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Kompyuter uchun yon panel */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-3 py-5 lg:flex">
        <Brand />
        <div className="mt-6 flex-1 overflow-y-auto">
          <NavList page={page} />
        </div>
        <UserBox />
      </aside>

      <div className="lg:pl-64">
        {mode === 'local' && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800">
            {isArtifact
              ? "Bulut xotirasi bu ko'rinishda mavjud emas: ma'lumotlar faqat shu brauzerda saqlanadi. Sahifani claude.ai'ga kirgan holda oching."
              : "Mahalliy rejim: ma'lumotlar faqat shu brauzerda saqlanadi. Bulutga saqlash uchun Firebase'ni sozlang (README)."}
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            <span>{error}</span>
            <button onClick={clearError} aria-label="Yopish">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">{children}</main>
      </div>

      {/* Telefon uchun pastki menyu */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5">
          {MOBILE.map((id) => {
            const it = NAV.flatMap((g) => g.items).find((x) => x.id === id)!;
            const Icon = it.icon;
            return (
              <Link key={id} to={id} className={cls('flex flex-col items-center gap-0.5 py-2 text-[11px]', page === id ? 'text-indigo-600' : 'text-slate-500')}>
                <Icon className="h-5 w-5" />
                {it.label}
              </Link>
            );
          })}
          <button onClick={() => setDrawer(true)} className={cls('flex flex-col items-center gap-0.5 py-2 text-[11px]', !MOBILE.includes(page) ? 'text-indigo-600' : 'text-slate-500')}>
            <Menu className="h-5 w-5" />
            Ko'proq
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)}>
            <motion.div
              className="absolute inset-y-0 right-0 flex w-72 flex-col bg-white px-3 py-5"
              initial={{ x: 300 }}
              animate={{ x: 0 }}
              exit={{ x: 300 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <Brand />
                <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-slate-500" aria-label="Yopish">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-5 flex-1 overflow-y-auto">
                <NavList page={page} onPick={() => setDrawer(false)} />
              </div>
              <UserBox />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
