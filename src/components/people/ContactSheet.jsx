import { useMemo, useState } from 'react';
import { HandCoins, Mail, PencilLine, Phone, Plus } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import ContactFormModal from './ContactFormModal';
import DebtEntryModal from './DebtEntryModal';
import LedgerEntryModal from './LedgerEntryModal';
import { useFinance } from '../../context/FinanceContext';
import { ledgerOwedDelta } from '../../utils/analytics';
import { CONTACT_CATEGORIES, LEDGER_KINDS } from '../../utils/constants';
import { cx, formatCurrency, formatDate } from '../../utils/formatters';

/** "Owes you Rs 5,000" / "You owe Rs 2,000" / "Settled". */
export function balanceLabel(balance) {
  if (balance > 0) return { text: `Owes you ${formatCurrency(balance)}`, className: 'text-accent' };
  if (balance < 0) return { text: `You owe ${formatCurrency(-balance)}`, className: 'text-orange-600 dark:text-orange-300' };
  return { text: 'Settled', className: 'text-ink/45' };
}

/** One contact: details, running loan balance and ledger, plus routine payments made to / received from them. */
function SheetBody({ contact }) {
  const { ledger, transactions, accountsById, contactBalances } = useFinance();
  const [editingContact, setEditingContact] = useState(false);
  // `null` = closed; `{ id… }` edits an entry; `{ kind, amount }` records a repayment.
  const [entry, setEntry] = useState(null);
  const [adding, setAdding] = useState(null); // 'receivable' | 'payable' | null

  const rows = useMemo(() => {
    const own = ledger.filter((e) => e.contactId === contact.id);
    let running = 0;
    const withRunning = [...own].reverse().map((e) => ({ ...e, running: (running += ledgerOwedDelta(e)) }));
    return withRunning.reverse();
  }, [ledger, contact.id]);

  const routine = useMemo(() => {
    const own = transactions.filter((t) => t.contactId === contact.id && t.status !== 'pending');
    return {
      paid: own.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      received: own.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
      count: own.length,
    };
  }, [transactions, contact.id]);

  const balance = contactBalances[contact.id] ?? 0;
  const status = balanceLabel(balance);
  const category = CONTACT_CATEGORIES[contact.category];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 text-sm text-ink/70">
          <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: category?.color, backgroundColor: `${category?.color}1F` }}>
            {category?.label}
          </span>
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:text-ink">
              <Phone size={13} /> {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 break-all hover:text-ink">
              <Mail size={13} /> {contact.email}
            </a>
          )}
          {contact.note && <p className="text-xs text-ink/50">{contact.note}</p>}
        </div>
        <Button size="sm" variant="secondary" icon={PencilLine} onClick={() => setEditingContact(true)}>
          Edit
        </Button>
      </div>

      <div className="rounded-xl bg-ink/5 p-4">
        <p className="text-xs text-ink/50">Balance</p>
        <p className={cx('text-2xl font-extrabold tabular-nums', status.className)}>{status.text}</p>
        {routine.count > 0 && (
          <p className="mt-1 text-[11px] text-ink/45">
            Routine: paid {formatCurrency(routine.paid)} · received {formatCurrency(routine.received)} ({routine.count} entr{routine.count === 1 ? 'y' : 'ies'})
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {balance > 0 && (
          <Button icon={HandCoins} onClick={() => setEntry({ kind: 'collected', amount: balance })}>
            Received back
          </Button>
        )}
        {balance < 0 && (
          <Button icon={HandCoins} onClick={() => setEntry({ kind: 'repaid', amount: -balance })}>
            Paid back
          </Button>
        )}
        {balance >= 0 && (
          <Button variant={balance > 0 ? 'secondary' : 'primary'} icon={Plus} onClick={() => setAdding('receivable')}>
            {balance > 0 ? 'They owe more' : 'They owe me'}
          </Button>
        )}
        {balance <= 0 && (
          <Button variant={balance < 0 ? 'secondary' : 'primary'} icon={Plus} onClick={() => setAdding('payable')}>
            {balance < 0 ? 'I owe more' : 'I owe them'}
          </Button>
        )}
      </div>

      <section aria-label="Loan ledger">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink/50">History</p>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink/50">Nothing owed either way with {contact.name} yet.</p>
        ) : (
          <ul className="divide-y divide-ink/5">
            {rows.map((row) => {
              const kind = LEDGER_KINDS[row.kind];
              const delta = ledgerOwedDelta(row);
              return (
                <li key={row.id}>
                  <button type="button" onClick={() => setEntry(row)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-ink/5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{row.note || kind?.verb}</p>
                      <p className="truncate text-[11px] text-ink/45">
                        {formatDate(row.date)}
                        {row.note && ` · ${kind?.verb}`}
                        {row.accountId && ` · ${accountsById[row.accountId]?.name ?? 'deleted account'}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink">{formatCurrency(row.amount)}</p>
                      <p className={cx('whitespace-nowrap text-[11px] tabular-nums', delta > 0 ? 'text-accent' : 'text-orange-600 dark:text-orange-300')}>
                        bal. {formatCurrency(row.running, { sign: true })}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ContactFormModal open={editingContact} contact={contact} onClose={() => setEditingContact(false)} />
      <LedgerEntryModal
        open={Boolean(entry)}
        entry={entry?.id ? entry : null}
        contactId={contact.id}
        defaultKind={entry?.kind}
        defaultAmount={entry?.amount}
        onClose={() => setEntry(null)}
      />
      <DebtEntryModal open={Boolean(adding)} direction={adding ?? 'receivable'} contactId={contact.id} onClose={() => setAdding(null)} />
    </div>
  );
}

export default function ContactSheet({ contactId, onClose }) {
  const { contactsById } = useFinance();
  const contact = contactsById[contactId];
  return (
    <Modal open={Boolean(contact)} onClose={onClose} title={contact?.name ?? ''}>
      {contact && <SheetBody contact={contact} />}
    </Modal>
  );
}
