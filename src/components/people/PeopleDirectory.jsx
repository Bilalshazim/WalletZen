import { useMemo, useState } from 'react';
import { BookUser, HandCoins, Search, UserRoundPlus } from 'lucide-react';
import Button from '../common/Button';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import SegmentedControl from '../common/SegmentedControl';
import ContactFormModal from './ContactFormModal';
import ContactSheet, { balanceLabel } from './ContactSheet';
import LedgerEntryModal from './LedgerEntryModal';
import { useFinance } from '../../context/FinanceContext';
import { CONTACT_CATEGORIES } from '../../utils/constants';
import { cx, formatCurrency } from '../../utils/formatters';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'receivable', label: 'Owe you' },
  { value: 'payable', label: 'You owe' },
];

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** Contacts directory with debts (payables) and receivables, kept apart from routine income/expenses. */
export default function PeopleDirectory() {
  const { contacts, contactBalances, receivable, payable } = useFinance();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [recording, setRecording] = useState(false);
  const [openId, setOpenId] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      const balance = contactBalances[c.id] ?? 0;
      if (filter === 'receivable' && !(balance > 0)) return false;
      if (filter === 'payable' && !(balance < 0)) return false;
      return !q || [c.name, c.phone, c.email].some((text) => text?.toLowerCase().includes(q));
    });
  }, [contacts, contactBalances, filter, query]);

  return (
    <Card
      title="Debts & receivables"
      subtitle={`${contacts.length} contact${contacts.length === 1 ? '' : 's'} · loans tracked apart from daily spending`}
      action={
        <Button size="sm" icon={UserRoundPlus} onClick={() => setAdding(true)}>
          Add
        </Button>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-ink/5 p-3">
          <p className="text-xs text-ink/50">Owed to you</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-accent">{formatCurrency(receivable)}</p>
        </div>
        <div className="rounded-2xl bg-ink/5 p-3">
          <p className="text-xs text-ink/50">You owe</p>
          <p className={cx('mt-1 text-sm font-semibold tabular-nums', payable > 0 ? 'text-orange-600 dark:text-orange-300' : 'text-ink')}>
            {formatCurrency(payable)}
          </p>
        </div>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={BookUser}
          title="No contacts yet"
          message="Add the people you pay, lend to or borrow from — each keeps a running balance."
          action={
            <Button icon={UserRoundPlus} onClick={() => setAdding(true)}>
              Add first contact
            </Button>
          }
        />
      ) : (
        <>
          <Button variant="secondary" icon={HandCoins} className="mb-3 w-full" onClick={() => setRecording(true)}>
            Record loan or repayment
          </Button>
          <div className="mb-3 space-y-2">
            <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} size="sm" />
            {contacts.length > 5 && (
              <label className="flex items-center gap-2 rounded-full border border-ink/10 bg-ink/5 px-4 py-2.5">
                <Search size={16} className="text-ink/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, phone, email"
                  className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink/30 sm:text-sm"
                />
              </label>
            )}
          </div>
          {visible.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink/50">No contacts match.</p>
          ) : (
            <ul className="-mx-2">
              {visible.map((contact) => {
                const balance = contactBalances[contact.id] ?? 0;
                const status = balanceLabel(balance);
                const category = CONTACT_CATEGORIES[contact.category];
                return (
                  <li key={contact.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(contact.id)}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-ink/5"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                        style={{ color: category?.color, backgroundColor: `${category?.color}1F` }}
                        aria-hidden="true"
                      >
                        {initials(contact.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{contact.name}</p>
                        <p className="truncate text-xs text-ink/45">
                          {category?.label}
                          {contact.phone && ` · ${contact.phone}`}
                        </p>
                      </div>
                      <span className={cx('whitespace-nowrap text-right text-xs font-semibold tabular-nums', status.className)}>{status.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <ContactFormModal open={adding} onClose={() => setAdding(false)} />
      <LedgerEntryModal open={recording} onClose={() => setRecording(false)} />
      <ContactSheet contactId={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}
