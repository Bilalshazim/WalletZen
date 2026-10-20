import BrandLogo from '../common/BrandLogo';

/** Full-screen glass layout shared by the lock screen and Quick Lock onboarding. */
export default function SecurityShell({ title, subtitle, children, footer }) {
  return (
    <div
      data-security-screen
      className="fixed inset-0 z-[70] overflow-y-auto"
      style={{ backgroundImage: 'linear-gradient(to bottom, var(--canvas-from), var(--canvas-via), var(--canvas-to))', backgroundColor: 'var(--canvas-to)' }}
    >
      <div className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-6 px-6 py-[calc(2rem+env(safe-area-inset-top))] text-center">
        <BrandLogo className="h-14 w-auto" />
        <div>
          <h1 className="text-xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink/60">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="flex flex-col items-center gap-2 text-sm">{footer}</div>}
      </div>
    </div>
  );
}
