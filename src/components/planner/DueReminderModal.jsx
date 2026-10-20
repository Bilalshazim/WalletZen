import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import Modal from '../common/Modal';
import UpcomingExpenses from './UpcomingExpenses';
import { useFinance } from '../../context/FinanceContext';
import { daysUntil, todayISO } from '../../utils/formatters';

const SEEN_KEY = 'walletzen:reminder-seen';
const WINDOW_DAYS = 3;

const isDueSoon = (item) => daysUntil(item.dueDate) <= WINDOW_DAYS;

/** Smart reminder: once a day, pops up anything overdue or due within the next 3 days. */
export default function DueReminderModal() {
  const { upcoming, ready } = useFinance();
  const [open, setOpen] = useState(false);
  const dueSoon = upcoming.filter(isDueSoon);

  useEffect(() => {
    if (!ready || dueSoon.length === 0) return;
    let seen = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      // Without storage, show it each session.
    }
    if (seen !== todayISO()) setOpen(true);
    // Only evaluate when data first becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, todayISO());
    } catch {
      // ignore
    }
  };

  // Close automatically once everything due has been paid.
  useEffect(() => {
    if (open && dueSoon.length === 0) close();
  }, [open, dueSoon.length]);

  return (
    <Modal open={open} onClose={close} title="Due soon">
      <p className="-mt-2 mb-4 flex items-center gap-2 text-sm text-ink/60">
        <BellRing size={16} className="text-accent" />
        {dueSoon.length} item{dueSoon.length === 1 ? '' : 's'} due within {WINDOW_DAYS} days or overdue.
      </p>
      <UpcomingExpenses bare filter={isDueSoon} />
    </Modal>
  );
}
