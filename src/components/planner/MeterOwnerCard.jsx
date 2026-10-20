import { useState } from 'react';
import { Gauge, Hash, MapPin, PencilLine, Plus, UserRound } from 'lucide-react';
import Button from '../common/Button';
import { Field, Input } from '../common/FormField';
import { useFinance } from '../../context/FinanceContext';
import { OWNER_FIELDS } from '../../services/billAggregatorApi';

const ICONS = { name: UserRound, fatherName: UserRound, address: MapPin, meterNumber: Hash, tariff: Gauge, subDivision: MapPin };
const EDITABLE = ['name', 'fatherName', 'address', 'meterNumber'];

/**
 * Meter owner details for a utility reference. Filled automatically by a live bill service; otherwise the user adds
 * them once from their printed bill and they carry over to every later month. Never invented for demo bills.
 */
export default function MeterOwnerCard({ bill, owner: fetchedOwner, reference }) {
  const { saveBill } = useFinance();
  const owner = bill?.owner ?? fetchedOwner ?? null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => Object.fromEntries(EDITABLE.map((key) => [key, owner?.[key] ?? ''])));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const ok = await saveBill({ ...bill, owner: { ...owner, ...form }, ownerSource: 'manual' });
    setSaving(false);
    if (ok) setEditing(false);
  };

  const sourceLabel = bill?.ownerSource === 'live' || (!bill && fetchedOwner) ? 'From bill service' : owner ? 'Added by you' : null;

  return (
    <section className="space-y-2 rounded-2xl border border-ink/10 p-3" aria-label="Meter owner">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Meter owner</p>
        <div className="flex items-center gap-2">
          {sourceLabel && <span className="text-[10px] text-ink/40">{sourceLabel}</span>}
          {bill && owner && !editing && (
            <button type="button" onClick={() => setEditing(true)} aria-label="Edit owner details" className="rounded-full p-1 text-ink/50 hover:bg-ink/10 hover:text-ink">
              <PencilLine size={14} />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {EDITABLE.map((key) => (
              <Field key={key} label={OWNER_FIELDS[key]} className={key === 'address' ? 'col-span-2' : undefined}>
                <Input
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  maxLength={key === 'address' ? 160 : 60}
                  className="py-2"
                  autoComplete="off"
                />
              </Field>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" className="flex-1" loading={saving} disabled={!form.name.trim()} onClick={save}>
              Save owner details
            </Button>
          </div>
        </div>
      ) : owner ? (
        <dl className="space-y-1.5">
          {Object.keys(OWNER_FIELDS)
            .filter((key) => owner[key])
            .map((key) => {
              const Icon = ICONS[key];
              return (
                <div key={key} className="flex items-start gap-2 text-sm">
                  <Icon size={14} className="mt-0.5 shrink-0 text-ink/40" aria-hidden="true" />
                  <dt className="sr-only">{OWNER_FIELDS[key]}</dt>
                  <dd className={key === 'name' ? 'font-semibold text-ink' : 'text-ink/70'}>
                    {key === 'fatherName' ? `S/O, D/O, W/O ${owner[key]}` : owner[key]}
                  </dd>
                </div>
              );
            })}
          {reference && <p className="pl-[22px] text-[11px] text-ink/40">Ref. {reference}</p>}
        </dl>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ink/55">
            The owner's name and address are printed on the bill. {bill?.source === 'demo' || !bill ? 'The demo service can’t read them' : 'They weren’t provided'} —
            add them once and they'll stay with this reference.
          </p>
          {bill && (
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditing(true)}>
              Add owner details
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
