import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Search, UserRoundPlus } from 'lucide-react';
import Button from '../common/Button';
import Card from '../common/Card';
import ContactFormModal from './ContactFormModal';
import ContactSheet, { balanceLabel } from './ContactSheet';
import DebtEntryModal from './DebtEntryModal';
import { useFinance } from '../../context/FinanceContext';
import { CONTACT_CATEGORIES } from '../../utils/constants';
import { cx, formatCurrency } from '../../utils/formatters';

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export function ContactAvatar({ contact }) {
  const color = CONTACT_CATEGORIES[contact.category]?.color;
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
      style={{ color, backgroundColor: `${color}1F` }}
      aria-hidden="true"
    >
      {initials(contact.name)}
    </span>
  );
}

function PersonRow({ contact, balance, onOpen }) {
  const status = balanceLabel(balance);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(contact.id)}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-ink/5"
      >
        <ContactAvatar contact={contact} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{contact.name}</p>
          <p className="truncate text-xs text-ink/45">{contact.phone || CONTACT_CATEGORIES[contact.category]?.label}</p>
        </div>
        <span className={cx('whitespace-nowrap text-right text-sm font-semibold tabular-nums', status.className)}>
          {balance === 0 ? 'Settled' : formatCurrency(Math.abs(balance))}
        </span>
      </button>
    </li>
  );
}

function Section({ title, total, tone, people, balances, onOpen, empty }) {
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink/50">{title}</h3>
        <span className={cx('text-xs font-semibold tabular-nums', tone)}>{formatCurrency(total)}</span>
      </div>
      {people.length ? (
        <ul className="-mx-2">
          {people.map((c) => (
            <PersonRow key={c.id} contact={c} balance={balances[c.id] ?? 0} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-ink/5 px-3 py-3 text-center text-xs text-ink/45">{empty}</p>
      )}
    </section>
  );
}

/**
 * Receivables (who owes you) and payables (who you owe), per person, kept apart from routine income/expenses.
 * Each person keeps a running balance; settled contacts stay in the directory below.
 */
export default function PeopleDirectory() {
  const { contacts, contactBalances, receivable, payable } = useFinance();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(null); // 'receivable' | 'payable' | null
  const [newContact, setNewContact] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [openId, setOpenId] = useState(null);

  const { owesYou, youOwe, settled } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = contacts.filter((c) => !q || [c.name, c.phone, c.email].some((text) => text?.toLowerCase().includes(q)));
    const balance = (c) => contactBalances[c.id] ?? 0;
    return {
      owesYou: matches.filter((c) => balance(c) > 0).sort((a, b) => balance(b) - balance(a)),
      youOwe: matches.filter((c) => balance(c) < 0).sort((a, b) => balance(a) - balance(b)),
      settled: matches.filter((c) => balance(c) === 0),
    };
  }, [contacts, contactBalances, query]);

  return (
    <Card
      title="Receivables & payables"
      subtitle="Money people owe you and you owe them — not counted as income or expenses"
      action={
        <Button size="sm" variant="secondary" icon={UserRoundPlus} onClick={() => setNewContact(true)} aria-label="Add contact">
          <span className="hidden min-[380px]:inline">Contact</span>
        </Button>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setAdding('receivable')} className="rounded-2xl border border-zen-lime/25 bg-zen-lime/10 p-3 text-left transition hover:bg-zen-lime/15">
          <p className="flex items-center gap-1 text-xs text-ink/55">
            <ArrowDownLeft size={13} className="text-accent" /> Receivable
          </p>
          <p className="mt-1 text-base font-bold tabular-nums text-accent">{formatCurrency(receivable)}</p>
          <p className="mt-1 text-[11px] font-medium text-accent">+ Add receivable</p>
        </button>
        <button type="button" onClick={() => setAdding('payable')} className="rounded-2xl border border-orange-500/25 bg-orange-500/10 p-3 text-left transition hover:bg-orange-500/15">
          <p className="flex items-center gap-1 text-xs text-ink/55">
            <ArrowUpRight size={13} className="text-orange-600 dark:text-orange-300" /> Payable
          </p>
          <p className="mt-1 text-base font-bold tabular-nums text-orange-600 dark:text-orange-300">{formatCurrency(payable)}</p>
          <p className="mt-1 text-[11px] font-medium text-orange-600 dark:text-orange-300">+ Add payable</p>
        </button>
      </div>

      {contacts.length > 8 && (
        <label className="mb-3 flex items-center gap-2 rounded-full border border-ink/10 bg-ink/5 px-4 py-2.5">
          <Search size={16} className="text-ink/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, email"
            className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink/30 sm:text-sm"
          />
        </label>
      )}

      <div className="space-y-4">
        <Section
          title="They owe you"
          total={receivable}
          tone="text-accent"
          people={owesYou}
          balances={contactBalances}
          onOpen={setOpenId}
          empty="Nobody owes you anything. Tap “Add receivable” when you lend money or someone owes you."
        />
        <Section
          title="You owe"
          total={payable}
          tone="text-orange-600 dark:text-orange-300"
          people={youOwe}
          balances={contactBalances}
          onOpen={setOpenId}
          empty="You don't owe anyone. Tap “Add payable” when you borrow or owe someone."
        />

        {settled.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setShowSettled((v) => !v)}
              aria-expanded={showSettled}
              className="flex w-full items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-ink/50"
            >
              Settled & other contacts ({settled.length})
              <ChevronDown size={14} className={cx('transition', showSettled && 'rotate-180')} />
            </button>
            {showSettled && (
              <ul className="-mx-2 mt-1">
                {settled.map((c) => (
                  <PersonRow key={c.id} contact={c} balance={0} onOpen={setOpenId} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <DebtEntryModal open={Boolean(adding)} direction={adding ?? 'receivable'} onClose={() => setAdding(null)} />
      <ContactFormModal open={newContact} onClose={() => setNewContact(false)} />
      <ContactSheet contactId={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}
