import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react';
import Button from '../common/Button';
import Card from '../common/Card';
import DebtEntryModal from '../people/DebtEntryModal';
import ContactSheet from '../people/ContactSheet';
import { useFinance } from '../../context/FinanceContext';
import { cx, formatCurrency } from '../../utils/formatters';

const TOP = 3;
const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;

function Side({ title, icon: Icon, total, tone, people, onOpen, empty }) {
  return (
    <div className="min-w-0 rounded-xl bg-ink/5 p-3">
      <p className="flex items-center gap-1 text-xs text-ink/55">
        <Icon size={13} className={tone} /> {title}
      </p>
      <p className={cx('mt-1 truncate text-lg font-bold tabular-nums', tone)}>{formatCurrency(total)}</p>
      {people.length ? (
        <ul className="mt-2 space-y-1">
          {people.map(({ contact, amount }) => (
            <li key={contact.id}>
              <button type="button" onClick={() => onOpen(contact.id)} className="flex w-full items-center gap-2 text-left text-[11px] text-ink/65 hover:text-ink">
                <span className="min-w-0 flex-1 truncate">{contact.name}</span>
                <span className="whitespace-nowrap tabular-nums">{formatCurrency(amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-ink/40">{empty}</p>
      )}
    </div>
  );
}

/** Home card: what people owe you vs what you owe, the net position and the biggest balances on each side. */
export default function DebtsOverview({ onShowAll }) {
  const { contacts, contactBalances, receivable, payable } = useFinance();
  const [adding, setAdding] = useState(null); // 'receivable' | 'payable' | null
  const [openId, setOpenId] = useState(null);

  const { owesYou, youOwe, counts } = useMemo(() => {
    const rows = contacts.map((contact) => ({ contact, balance: contactBalances[contact.id] ?? 0 }));
    const positive = rows.filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance);
    const negative = rows.filter((r) => r.balance < 0).sort((a, b) => a.balance - b.balance);
    return {
      owesYou: positive.slice(0, TOP).map((r) => ({ contact: r.contact, amount: r.balance })),
      youOwe: negative.slice(0, TOP).map((r) => ({ contact: r.contact, amount: -r.balance })),
      counts: { receivable: positive.length, payable: negative.length },
    };
  }, [contacts, contactBalances]);

  const net = receivable - payable;
  const total = receivable + payable;

  return (
    <Card
      title="Payables vs receivables"
      subtitle={
        total
          ? `${people(counts.receivable)} owe${counts.receivable === 1 ? 's' : ''} you · you owe ${people(counts.payable)}`
          : 'Track money people owe you and money you owe'
      }
      action={
        total > 0 && onShowAll ? (
          <button type="button" onClick={onShowAll} className="text-xs font-medium text-accent hover:underline">
            See all
          </button>
        ) : null
      }
    >
      {total > 0 && (
        <div className="mb-3">
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Receivable ${formatCurrency(receivable)}, payable ${formatCurrency(payable)}`}>
            {receivable > 0 && <span className="bg-[#199E70]" style={{ width: `${(receivable / total) * 100}%` }} />}
            {payable > 0 && <span className="bg-[#D95926]" style={{ width: `${(payable / total) * 100}%` }} />}
          </div>
          <p className={cx('mt-1.5 text-xs font-medium', net > 0 ? 'text-accent' : net < 0 ? 'text-orange-600 dark:text-orange-300' : 'text-ink/50')}>
            {net > 0 ? `You'll get back ${formatCurrency(net)} more than you owe` : net < 0 ? `You owe ${formatCurrency(-net)} more than you'll get back` : 'Receivables and payables are even'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Side title="Receivable" icon={ArrowDownLeft} total={receivable} tone="text-accent" people={owesYou} onOpen={setOpenId} empty="Nobody owes you." />
        <Side title="Payable" icon={ArrowUpRight} total={payable} tone="text-orange-600 dark:text-orange-300" people={youOwe} onOpen={setOpenId} empty="You owe nobody." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding('receivable')}>
          Receivable
        </Button>
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding('payable')}>
          Payable
        </Button>
      </div>

      <DebtEntryModal open={Boolean(adding)} direction={adding ?? 'receivable'} onClose={() => setAdding(null)} />
      <ContactSheet contactId={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}
