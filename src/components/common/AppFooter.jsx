import { useState } from 'react';
import Modal from './Modal';

const SUPPORT_URL = 'https://github.com/Bilalshazim/WalletZen/issues';

// Plain-language summaries of how the app behaves today. Replace with reviewed legal text before a public launch.
const POLICIES = {
  terms: {
    title: 'Terms of Service',
    sections: [
      ['Personal use', 'WalletZen is a personal cashbook. It records what you enter and does not move real money or connect to your bank.'],
      ['Your figures', 'Balances, projections and fetched bills are estimates based on your entries and public bill pages. Check important amounts against the official source before paying.'],
      ['Availability', 'The app is provided as is. Features such as bill fetching and screenshot scanning depend on outside services and may be unavailable at times.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['Guest mode', 'Your accounts, transactions and contacts are stored only in this browser. Clearing site data removes them.'],
      ['Signed in', 'Your data syncs to your own Firebase account so it is available on your other devices. Only you can read it.'],
      ['Screenshots', 'Images you scan are downscaled on your device, read once by the WalletZen server and never stored.'],
      ['No selling', 'WalletZen does not show ads and does not sell or share your data.'],
    ],
  },
};

const linkClass = 'transition hover:text-ink focus-visible:text-ink focus-visible:outline-none';

export default function AppFooter() {
  const [policy, setPolicy] = useState(null);
  const open = policy && POLICIES[policy];

  return (
    <footer className="mt-10 flex flex-col gap-3 border-t border-ink/10 pt-5 text-xs text-ink/45 sm:flex-row sm:items-center sm:justify-between">
      <p>
        <span className="font-display text-sm font-semibold text-ink/70">WalletZen</span> · © {new Date().getFullYear()}
      </p>
      <nav aria-label="Legal and support" className="flex flex-wrap gap-x-5 gap-y-2">
        <button type="button" onClick={() => setPolicy('terms')} className={linkClass}>
          Terms of Service
        </button>
        <button type="button" onClick={() => setPolicy('privacy')} className={linkClass}>
          Privacy Policy
        </button>
        <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className={linkClass}>
          Support
        </a>
      </nav>

      <Modal open={Boolean(open)} onClose={() => setPolicy(null)} title={open?.title}>
        {open && (
          <dl className="space-y-4 text-sm">
            {open.sections.map(([heading, body]) => (
              <div key={heading}>
                <dt className="font-semibold text-ink">{heading}</dt>
                <dd className="mt-1 leading-relaxed text-ink/65">{body}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>
    </footer>
  );
}
