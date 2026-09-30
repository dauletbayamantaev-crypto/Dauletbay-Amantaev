import React, { useState } from 'react';
import { Compass, Sparkles, Target, Wallet } from 'lucide-react';
import { authErrorText, useAuth } from '../lib/store';
import { Button, ErrorNote, Field, Input } from '../components/ui';

export default function Login() {
  const { mode, loginGoogle, loginEmail, registerEmail, resetPassword, enterLocal } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(authErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    wrap(() => (tab === 'login' ? loginEmail(email, password) : registerEmail(name, email, password)));
  };

  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-bold">
          <Compass className="h-6 w-6" /> Hayot Kompasi
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Hayotingizni strategiya bilan boshqaring</h1>
          <p className="mt-4 max-w-md text-indigo-100">
            Maqsad, loyiha va bosqichlar, moliya, odatlar, sog'liq va kundalik — barchasi bir joyda. Real natijalaringizni AI xolis
            baholab beradi.
          </p>
          <div className="mt-8 space-y-3 text-sm">
            <p className="flex items-center gap-3"><Target className="h-5 w-5" /> Strategiya → Maqsad → Loyiha → Bosqich</p>
            <p className="flex items-center gap-3"><Sparkles className="h-5 w-5" /> Gemini yoki Claude bilan natijalarni tekshirish</p>
            <p className="flex items-center gap-3"><Wallet className="h-5 w-5" /> Moliyaviy nazorat va aqlli tavsiyalar</p>
          </div>
        </div>
        <p className="text-xs text-indigo-200">Ma'lumotlaringiz faqat sizga tegishli.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
              <Compass className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-slate-900">Hayot Kompasi</span>
          </div>

          {mode === 'local' ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-slate-900">Xush kelibsiz</h2>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Firebase hali sozlanmagan</p>
                <p className="mt-1">
                  Bulutga saqlash va login uchun <code>.env.local</code> faylida <code>VITE_FIREBASE_*</code> qiymatlarini kiriting
                  (README'da ko'rsatilgan). Hozircha ilovani mahalliy rejimda sinab ko'rishingiz mumkin — ma'lumotlar faqat shu brauzerda
                  saqlanadi.
                </p>
              </div>
              <Button className="w-full" onClick={enterLocal}>
                Mahalliy rejimda davom etish
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{tab === 'login' ? 'Kirish' : "Ro'yxatdan o'tish"}</h2>
                <p className="mt-1 text-sm text-slate-500">Ma'lumotlaringiz bulutda saqlanadi va barcha qurilmalarda sinxron bo'ladi.</p>
              </div>

              <Button variant="secondary" className="w-full" loading={busy} onClick={() => wrap(loginGoogle)} icon={<GoogleIcon />}>
                Google orqali kirish
              </Button>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> yoki email bilan <span className="h-px flex-1 bg-slate-200" />
              </div>

              <form onSubmit={submit} className="space-y-3">
                {tab === 'register' && (
                  <Field label="Ismingiz">
                    <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </Field>
                )}
                <Field label="Email">
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </Field>
                <Field label="Parol">
                  <Input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  />
                </Field>
                {error && <ErrorNote>{error}</ErrorNote>}
                {info && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
                <Button type="submit" className="w-full" loading={busy}>
                  {tab === 'login' ? 'Kirish' : "Ro'yxatdan o'tish"}
                </Button>
              </form>

              <div className="flex items-center justify-between text-sm">
                <button className="font-medium text-indigo-600 hover:underline" onClick={() => setTab(tab === 'login' ? 'register' : 'login')}>
                  {tab === 'login' ? "Hisob yaratish" : 'Hisobim bor'}
                </button>
                {tab === 'login' && (
                  <button
                    className="text-slate-500 hover:underline"
                    onClick={() => {
                      if (!email) return setError('Avval email manzilingizni kiriting');
                      wrap(async () => {
                        await resetPassword(email);
                        setInfo('Parolni tiklash havolasi emailingizga yuborildi');
                      });
                    }}
                  >
                    Parolni unutdingizmi?
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
