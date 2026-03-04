import React, { useState, useEffect, useMemo } from 'react';
import { Check, Calendar as CalendarIcon, BarChart3, AlertTriangle, Home, List, PieChart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const students = ["Begzod", "Jamshid", "Abdurasul", "Asadbek", "Quvonchbek"];

// Helper to generate dates and assign duties in rotation
const generateFullSchedule = () => {
  const months = [
    { name: "Fevral", month: 1, year: 2026, startDay: 14 },
    { name: "Mart", month: 2, year: 2026, startDay: 1 },
    { name: "Aprel", month: 3, year: 2026, startDay: 1 },
    { name: "May", month: 4, year: 2026, startDay: 1 },
    { name: "Iyun", month: 5, year: 2026, startDay: 1 }
  ];

  let studentIndex = 0;
  const fullSchedule: Record<string, any[]> = {};

  months.forEach((m) => {
    // Correctly get days in month
    const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
    const monthData = [];

    for (let d = m.startDay; d <= daysInMonth; d++) {
      const dateStr = `${m.month + 1}/${d}/${m.year}`;
      monthData.push({
        date: dateStr,
        duty: students[studentIndex % students.length]
      });
      studentIndex++;
    }
    fullSchedule[m.name] = monthData;
  });

  return fullSchedule;
};

const ALL_SCHEDULES = generateFullSchedule();
const MONTH_NAMES = ["Fevral", "Mart", "Aprel", "May", "Iyun"];
type TabType = 'home' | 'schedule' | 'stats';

export default function App() {
  // Use real system date
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const currentMonthName = useMemo(() => {
    const m = today.getMonth();
    if (m === 1) return "Fevral";
    if (m === 2) return "Mart";
    if (m === 3) return "Aprel";
    if (m === 4) return "May";
    if (m === 5) return "Iyun";
    return "Fevral";
  }, [today]);

  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [activeMonth, setActiveMonth] = useState(currentMonthName);
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem('navbatchilik_completed');
    if (saved) {
      try {
        setCompletedTasks(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse completed tasks", e);
      }
    }
  }, []);

  const toggleCompletion = (date: string) => {
    const newCompleted = { ...completedTasks, [date]: !completedTasks[date] };
    setCompletedTasks(newCompleted);
    localStorage.setItem('navbatchilik_completed', JSON.stringify(newCompleted));
  };

  const getStatusInfo = (dateStr: string, isCompleted: boolean) => {
    const [month, day, year] = dateStr.split('/').map(Number);
    const rowDate = new Date(year, month - 1, day);
    rowDate.setHours(0, 0, 0, 0);

    if (isCompleted) {
      return { status: 'completed', color: 'text-gray-400', bg: 'bg-gray-50', decoration: 'line-through', label: 'Bajarildi' };
    }
    if (rowDate < today) {
      return { status: 'missed', color: 'text-red-600', bg: 'bg-red-50', decoration: '', label: 'Bajarmadi!' };
    }
    if (rowDate.getTime() === today.getTime()) {
      return { status: 'today', color: 'text-blue-600', bg: 'bg-blue-50', decoration: '', label: 'Bugun' };
    }
    return { status: 'upcoming', color: 'text-green-600', bg: 'bg-green-50', decoration: '', label: 'Navbatdagi' };
  };

  const currentMonthData = ALL_SCHEDULES[activeMonth];

  const todayDuty = useMemo(() => {
    const todayStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
    for (const month of MONTH_NAMES) {
      const found = ALL_SCHEDULES[month].find(d => d.date === todayStr);
      if (found) return found;
    }
    return null;
  }, [today]);

  const stats = useMemo(() => {
    return students.map(name => {
      const studentDuties = currentMonthData.filter(d => d.duty === name);
      const completed = studentDuties.filter(d => completedTasks[d.date]).length;
      const missed = studentDuties.filter(d => {
        const [m, day, y] = d.date.split('/').map(Number);
        const rowDate = new Date(y, m - 1, day);
        rowDate.setHours(0, 0, 0, 0);
        return !completedTasks[d.date] && rowDate < today;
      }).length;
      return { name, total: studentDuties.length, completed, missed };
    });
  }, [activeMonth, completedTasks]);

  return (
    <div className="min-h-screen bg-[#F1F5F9] font-sans text-slate-900 pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 space-y-8">
        
        {/* Header */}
        <header className="text-center">
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase leading-none">512 - Xona</h1>
          <p className="text-slate-400 font-bold text-xs tracking-[0.3em] mt-2 uppercase">Navbatchilik Tizimi</p>
        </header>

        {/* Horizontal Navigation Tabs (Bottom Fixed for Mobile Feel) */}
        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur-xl border border-slate-200 p-2 rounded-3xl shadow-2xl flex gap-2">
          {[
            { id: 'home', icon: Home, label: 'Asosiy' },
            { id: 'schedule', icon: List, label: 'Jadval' },
            { id: 'stats', icon: PieChart, label: 'Statistika' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id 
                  ? 'bg-slate-900 text-white shadow-lg' 
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              <tab.icon size={18} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Page Content with Transitions */}
        <main>
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <motion.div
                key="home"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                {/* Today's Duty Card */}
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                  <div className="bg-blue-600 py-4 px-6">
                    <h2 className="text-white font-black uppercase tracking-widest text-xs flex items-center gap-2">
                      <CalendarIcon size={16} />
                      Bugungi Navbatchi
                    </h2>
                  </div>
                  <div className="p-12 text-center">
                    {todayDuty ? (
                      <div className="space-y-6">
                        <div className="w-32 h-32 bg-blue-50 rounded-full flex items-center justify-center mx-auto border-4 border-blue-100 shadow-inner">
                          <span className="text-5xl font-black text-blue-600">{todayDuty.duty[0]}</span>
                        </div>
                        <div>
                          <motion.h3 
                            animate={{ 
                              opacity: [1, 0.2, 1],
                            }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                            className="text-3xl font-black text-blue-600 uppercase tracking-tight"
                          >
                            {todayDuty.duty}
                          </motion.h3>
                          <p className="text-blue-500 font-black text-sm uppercase tracking-widest mt-2 italic">Bugun sizning navbatingiz!</p>
                        </div>
                        <div className="pt-4 max-w-xs mx-auto">
                          <button 
                            onClick={() => toggleCompletion(todayDuty.date)}
                            className={`w-full py-4 rounded-2xl font-black uppercase text-sm tracking-widest transition-all ${
                              completedTasks[todayDuty.date]
                                ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-100'
                                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-xl'
                            }`}
                          >
                            {completedTasks[todayDuty.date] ? 'Bajarildi ✓' : 'Bajarish'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400 font-bold italic">Bugun uchun navbatchi belgilanmagan</p>
                    )}
                  </div>
                </div>

                {/* Reminders Card */}
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                  <div className="bg-red-600 py-4 px-6">
                    <h2 className="text-white font-black uppercase tracking-widest text-xs flex items-center gap-2">
                      <AlertTriangle size={16} />
                      Eslatma va Ogohlantirish
                    </h2>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="p-6 bg-red-50 rounded-2xl border border-red-100">
                      <p className="text-red-700 text-sm leading-relaxed font-bold">
                        ⚠️ Navbatchilikni bajarmagan talaba ustidan yatoqxona rahbariyatiga shikoyat qilinadi!
                      </p>
                    </div>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        "Vanna va xojatxonani tozalash",
                        "Koridorni supurib-artish",
                        "Chiqindi idishlarni bo'shatish",
                        "Xonani ozoda saqlash"
                      ].map((rule, i) => (
                        <li key={i} className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl text-slate-600 text-xs font-bold border border-slate-100">
                          <div className="w-2 h-2 rounded-full bg-slate-300" />
                          {rule}
                        </li>
                      ))}
                    </ul>
                    <p className="text-center font-black text-red-600 pt-4 text-base uppercase tracking-[0.3em]">
                      Xonani ozoda saqlaylik!
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'schedule' && (
              <motion.div
                key="schedule"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                {/* Month Selector */}
                <div className="flex flex-wrap justify-center gap-2 bg-white p-4 rounded-3xl shadow-sm border border-slate-200">
                  {MONTH_NAMES.map((name) => (
                    <button
                      key={name}
                      onClick={() => setActiveMonth(name)}
                      className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        activeMonth === name 
                          ? 'bg-slate-900 text-white shadow-xl' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                {/* Schedule Table */}
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-900 py-4 px-6 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                      <CalendarIcon size={18} className="text-[#00FFFF]" />
                      <span className="font-black uppercase tracking-widest text-xs">{activeMonth} Jadvali</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {currentMonthData.length} Kun
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                          <th className="py-4 px-6 text-left font-black">Sana</th>
                          <th className="py-4 px-6 text-left font-black">Navbatchi</th>
                          <th className="py-4 px-6 text-center font-black">Holat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentMonthData.map((row) => {
                          const isCompleted = completedTasks[row.date];
                          const status = getStatusInfo(row.date, isCompleted);
                          return (
                            <tr key={row.date} className={`transition-colors hover:bg-slate-50/80 ${status.bg}`}>
                              <td className="py-4 px-6">
                                <div className={`text-sm font-bold ${status.color} ${status.decoration}`}>
                                  {row.date}
                                </div>
                              </td>
                              <td className="py-4 px-6">
                                <div className={`text-base font-black tracking-tight ${status.color} ${status.decoration}`}>
                                  {row.duty}
                                </div>
                                {!isCompleted && (
                                  <div className={`text-[9px] font-black uppercase mt-0.5 tracking-wider ${status.color}`}>
                                    {status.label}
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-6 text-center">
                                <button
                                  onClick={() => toggleCompletion(row.date)}
                                  className={`w-10 h-10 rounded-2xl border-2 flex items-center justify-center mx-auto transition-all ${
                                    isCompleted 
                                      ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg' 
                                      : 'bg-white border-slate-200 text-slate-200 hover:border-blue-500 hover:text-blue-500'
                                  }`}
                                >
                                  <Check size={20} strokeWidth={4} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'stats' && (
              <motion.div
                key="stats"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                {/* Month Selector for Stats */}
                <div className="flex flex-wrap justify-center gap-2 bg-white p-4 rounded-3xl shadow-sm border border-slate-200">
                  {MONTH_NAMES.map((name) => (
                    <button
                      key={name}
                      onClick={() => setActiveMonth(name)}
                      className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        activeMonth === name 
                          ? 'bg-slate-900 text-white shadow-xl' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                {/* Statistics Cards */}
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-900 py-4 px-6 border-b border-slate-800 flex items-center gap-2">
                    <BarChart3 size={18} className="text-[#00FFFF]" />
                    <h2 className="text-white font-black uppercase tracking-widest text-xs">
                      {activeMonth} Statistikasi
                    </h2>
                  </div>
                  <div className="p-6 space-y-4">
                    {stats.map(s => (
                      <div key={s.name} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                        <div className="flex justify-between items-start">
                          <span className="font-black text-slate-900 uppercase tracking-tight text-base">{s.name}</span>
                          <span className="text-[10px] bg-white border border-slate-200 px-3 py-1 rounded-full font-black text-slate-500 uppercase tracking-widest">Jami: {s.total}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center shadow-sm">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bajarildi</div>
                            <div className="text-2xl font-black text-emerald-600">{s.completed}</div>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center shadow-sm">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bajarilmadi</div>
                            <div className="text-2xl font-black text-red-600">{s.missed}</div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            <span>Progress</span>
                            <span>{s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0}%</span>
                          </div>
                          <div className="relative h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${s.total > 0 ? (s.completed / s.total) * 100 : 0}%` }}
                              transition={{ duration: 1 }}
                              className="absolute top-0 left-0 h-full bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
