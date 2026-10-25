import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Camera, ImagePlus, ScanLine, ShieldCheck, X } from 'lucide-react';
import Button from '../common/Button';
import Card from '../common/Card';
import TransactionPreviewModal from './TransactionPreviewModal';
import { extractTransactions, isScannerConfigured, MAX_IMAGES, prepareImage } from '../../services/screenshotScanApi';

/**
 * Pick 1–50 banking screenshots / receipts (gallery or camera), read them with the WalletZen API (Cloudflare Workers AI),
 * then hand the results to the batch review modal.
 */
export default function BulkScreenshotScanner() {
  const { requireLogin } = useAuth();
  // Scanning is a cloud feature: guests are asked to sign in first (no-op in builds without Firebase).
  const pick = (ref) => () => requireLogin('scan') && ref.current.click();
  const [files, setFiles] = useState([]); // [{ id, file, url }]
  const [progress, setProgress] = useState(null); // { stage, done, total }
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { transactions, failures, previews }
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const abortRef = useRef(null);

  // Release thumbnail object URLs on unmount (removals release their own).
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  const addFiles = (list) => {
    setError(null);
    const images = [...list].filter((f) => f.type.startsWith('image/'));
    setFiles((prev) => {
      const room = MAX_IMAGES - prev.length;
      if (images.length > room) setError(`Only ${MAX_IMAGES} images per batch. ${images.length - Math.max(room, 0)} were skipped.`);
      return [...prev, ...images.slice(0, Math.max(room, 0)).map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, url: URL.createObjectURL(file) }))];
    });
  };

  const removeFile = (id) =>
    setFiles((prev) => {
      prev.filter((f) => f.id === id).forEach((f) => URL.revokeObjectURL(f.url));
      return prev.filter((f) => f.id !== id);
    });

  const scan = async () => {
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const prepared = [];
      for (const [i, { file }] of files.entries()) {
        setProgress({ stage: 'Preparing', done: i, total: files.length });
        prepared.push(await prepareImage(file));
      }
      setProgress({ stage: 'Reading', done: 0, total: files.length });
      const { transactions, failures } = await extractTransactions(prepared, {
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ stage: 'Reading', done, total }),
      });
      if (!controller.signal.aborted) setResult({ transactions, failures, previews: prepared.map((p) => p.previewUrl) });
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  };

  const finish = () => {
    setResult(null);
    files.forEach((f) => URL.revokeObjectURL(f.url));
    setFiles([]);
  };

  const busy = Boolean(progress);
  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Card title="Scan screenshots & receipts" subtitle={`Bank and wallet alerts or receipts, up to ${MAX_IMAGES} at once`}>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={ImagePlus} onClick={pick(galleryRef)} disabled={busy || !isScannerConfigured}>
          Gallery
        </Button>
        <Button variant="secondary" icon={Camera} onClick={pick(cameraRef)} disabled={busy || !isScannerConfigured}>
          Camera
        </Button>
      </div>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {files.length > 0 && (
        <>
          <ul className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8">
            {files.map((f) => (
              <li key={f.id} className="relative">
                <img src={f.url} alt={f.file.name} className="aspect-[3/4] w-full rounded-xl border border-ink/10 object-cover object-top" />
                {!busy && (
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    aria-label={`Remove ${f.file.name}`}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-surface p-0.5 text-ink/70 shadow ring-1 ring-ink/10"
                  >
                    <X size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink/50">
            {files.length}/{MAX_IMAGES} selected
          </p>
        </>
      )}

      {progress && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-ink/60">
            <span>
              {progress.stage} {progress.done}/{progress.total}
            </span>
            <button type="button" onClick={() => abortRef.current?.abort()} className="text-ink/50 hover:text-ink">
              Cancel
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}

      {isScannerConfigured ? (
        <div className="mt-4">
          <Button size="lg" icon={ScanLine} className="w-full" disabled={!files.length} loading={busy} onClick={scan}>
            Scan {files.length || ''} image{files.length === 1 ? '' : 's'}
          </Button>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-ink/5 px-4 py-3 text-xs text-ink/55">
          Scanning is unavailable in this build. It needs Firebase sign-in and the WalletZen API (<code>VITE_API_URL</code>).
        </p>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-ink/40">
        <ShieldCheck size={13} className="mt-px shrink-0" />
        Images are downscaled on your device and read by WalletZen's server using Cloudflare Workers AI, and are never stored. Nothing is saved until you
        confirm.
      </p>

      {result && (
        <TransactionPreviewModal
          open
          extracted={result.transactions}
          previews={result.previews}
          failures={result.failures}
          onClose={() => setResult(null)}
          onImported={finish}
        />
      )}
    </Card>
  );
}
