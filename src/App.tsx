import React from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, DataProvider, useAuth, useData } from './lib/store';
import { Shell, useRoute } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import StrategyPage from './pages/Strategy';
import GoalsPage from './pages/Goals';
import ProjectsPage from './pages/Projects';
import TasksPage from './pages/Tasks';
import FinancePage from './pages/Finance';
import HabitsPage from './pages/Habits';
import HealthPage from './pages/Health';
import JournalPage from './pages/Journal';
import LearningPage from './pages/Learning';
import CoachPage from './pages/Coach';
import SettingsPage from './pages/Settings';

function Spinner({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
      <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function Pages() {
  const { page, id } = useRoute();
  const { ready } = useData();
  if (!ready) return <Spinner text="Ma'lumotlar yuklanmoqda..." />;

  const content = (() => {
    switch (page) {
      case 'strategy':
        return <StrategyPage />;
      case 'goals':
        return <GoalsPage id={id} />;
      case 'projects':
        return <ProjectsPage id={id} />;
      case 'tasks':
        return <TasksPage />;
      case 'finance':
        return <FinancePage />;
      case 'habits':
        return <HabitsPage />;
      case 'health':
        return <HealthPage />;
      case 'journal':
        return <JournalPage />;
      case 'learning':
        return <LearningPage />;
      case 'coach':
        return <CoachPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  })();

  return <Shell page={page}>{content}</Shell>;
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner text="Yuklanmoqda..." />;
  if (!user) return <Login />;
  return (
    <DataProvider userId={user.uid} key={user.uid}>
      <Pages />
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
