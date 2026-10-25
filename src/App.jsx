import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import LoginModal from './components/common/LoginModal';
import LockScreen from './components/security/LockScreen';
import QuickLockSetup from './components/security/QuickLockSetup';
import SettingsModal from './components/common/SettingsModal';
import BottomNav, { TABS } from './components/common/BottomNav';
import Toast from './components/common/Toast';
import AppFooter from './components/common/AppFooter';
import { AppSkeleton } from './components/common/Skeleton';
import Header from './components/dashboard/Header';
import NetWorthSummary from './components/dashboard/NetWorthSummary';
import RealizedBalance from './components/dashboard/RealizedBalance';
import StatsGrid from './components/dashboard/StatsGrid';
import CashFlowChart from './components/dashboard/CashFlowChart';
import DebtsOverview from './components/dashboard/DebtsOverview';
import SpendingDonut from './components/dashboard/SpendingDonut';
import AccountList from './components/accounts/AccountList';
import PeopleDirectory from './components/people/PeopleDirectory';
import TransactionForm from './components/transactions/TransactionForm';
import TransactionHistory from './components/transactions/TransactionHistory';
import SubscriptionsPlanner from './components/planner/SubscriptionsPlanner';
import CommattieTracker from './components/planner/CommattieTracker';
import UpcomingExpenses from './components/planner/UpcomingExpenses';
import DueReminderModal from './components/planner/DueReminderModal';
import BulkScreenshotScanner from './components/scanner/BulkScreenshotScanner';
import { useAuth } from './context/AuthContext';
import { useFinance } from './context/FinanceContext';
import { useLock } from './context/LockContext';

const TAB_IDS = TABS.map((t) => t.id);
const tabFromHash = () => {
  const id = window.location.hash.slice(1);
  return TAB_IDS.includes(id) ? id : 'dashboard';
};

function FullScreenLoader({ message }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <Loader2 size={28} className="animate-spin text-accent" />
      {message && <p className="text-sm text-ink/60">{message}</p>}
    </div>
  );
}

export default function App() {
  const { loading, busyMessage } = useAuth();
  const { ready } = useFinance();
  const { locked, setupOpen } = useLock();
  const [tab, setTab] = useState(tabFromHash);
  const [quickAdd, setQuickAdd] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);

  // Hash-based tabs keep the browser back button working without a router (safe on GitHub Pages).
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (id) => {
    window.location.hash = id;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading || busyMessage) return <FullScreenLoader message={busyMessage} />;
  // While locked, render nothing but the lock screen: no financial data in the page.
  if (locked) {
    return (
      <>
        <LockScreen />
        <LoginModal />
        <Toast />
      </>
    );
  }
  if (!ready) return <AppSkeleton tab={tab} />;

  return (
    <>
      <main className="mx-auto max-w-5xl space-y-5 px-4 pb-32 pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <Header onOpenSettings={openSettings} />

        {tab === 'dashboard' && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 [&>*]:min-w-0">
              <RealizedBalance />
              <NetWorthSummary />
            </div>
            <StatsGrid />
            <DebtsOverview onShowAll={() => navigate('accounts')} />
            <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
              <CashFlowChart />
              <SpendingDonut />
            </div>
            <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
              <UpcomingExpenses limit={4} onShowAll={() => navigate('planner')} />
              <TransactionHistory limit={5} onShowAll={() => navigate('transactions')} />
            </div>
          </>
        )}

        {tab === 'accounts' && (
          <>
            <AccountList />
            <PeopleDirectory />
          </>
        )}
        {tab === 'transactions' && (
          <>
            <BulkScreenshotScanner />
            <TransactionHistory />
          </>
        )}

        {tab === 'planner' && (
          <>
            <SubscriptionsPlanner />
            <CommattieTracker />
          </>
        )}

        <AppFooter />
      </main>

      <BottomNav active={tab} onSelect={navigate} onQuickAdd={() => setQuickAdd(true)} />
      <TransactionForm open={quickAdd} onClose={() => setQuickAdd(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <DueReminderModal />
      <LoginModal />
      {setupOpen && <QuickLockSetup />}
      <Toast />
    </>
  );
}
