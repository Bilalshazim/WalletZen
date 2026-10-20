import IconCircle from './IconCircle';

export default function EmptyState({ icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <IconCircle icon={icon} size={22} className="p-3.5 text-accent" />
      <div>
        <p className="font-medium text-ink">{title}</p>
        {message && <p className="mt-1 text-sm text-ink/50">{message}</p>}
      </div>
      {action}
    </div>
  );
}
