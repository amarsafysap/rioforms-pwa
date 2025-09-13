import { useEffect, useState } from 'react';
import FormsList from './components/FormsList';
import FormRenderer from './components/FormRenderer';
import { listActiveForms, listQuestions, type Form } from './api';
import { flushQueue, saveForms, saveQuestions } from './offline';

export default function App() {
  const [sel, setSel] = useState<Form | null>(null);
  const [user] = useState<{ firstName?: string; lastName?: string }>({});
  const [toasts, setToasts] = useState<string[]>([]);
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Single online/offline listener that also flushes the queue
  useEffect(() => {
    const update = async () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      if (isOnline) {
        const n = await flushQueue();
        if (n > 0) setToasts((t) => [`Synced ${n} submission(s)`, ...t].slice(0, 3));
      }
    };
    update(); // run once on mount
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // PRELOAD all forms & their questions on first online load
  useEffect(() => {
    (async () => {
      if (!navigator.onLine) return;
      try {
        const forms = await listActiveForms();
        await saveForms(forms);
        let ok = 0;
        for (const f of forms) {
          try {
            const qs = await listQuestions(f.ID);
            await saveQuestions(f.ID, qs);
            ok++;
          } catch {
            /* ignore per-form errors */
          }
        }
        if (forms.length) {
          setToasts((t) => [`Preloaded ${forms.length} form(s), ${ok} question set(s)`, ...t].slice(0, 3));
        }
      } catch {
        /* ignore preload failures */
      }
    })();
  }, []);

  const doLogout = async () => {
    if (!navigator.onLine) return; // extra safety
    try {
      // clear local app state before redirect
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      await new Promise((res) => {
        const req = indexedDB.deleteDatabase('rioforms-db');
        req.onsuccess = req.onerror = req.onblocked = () => res(null);
      });
      localStorage.clear();
      sessionStorage.clear();
    } finally {
      // App Router logout (cache-busted)
      window.location.assign('/logout?cb=' + Date.now());
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="logo" />
          <h1 className="h1">RioForms</h1>
        </div>

        <div className="row" style={{ alignItems: 'center' }}>
          <div
            className={`status ${online ? 'on' : 'off'}`}
            aria-live="polite"
            title={online ? 'Connected' : 'No network'}
          >
            <span className={`dot ${online ? 'ok' : 'bad'}`} />
            {online ? 'Online' : 'Offline'}
          </div>
          <button
            className="btn ghost small"
            onClick={online ? doLogout : undefined}
            disabled={!online}
            title={online ? 'Sign out' : 'Connect to the internet to sign out'}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-2">
        <section className="card card-pad">
          {!sel ? (
            <>
              <h3 style={{ marginTop: 0 }}>Select an active form</h3>
              <p className="label">Forms & questions are cached for offline use.</p>
              <FormsList onSelect={setSel} />
            </>
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn ghost" onClick={() => setSel(null)}>
                  &larr; Back
                </button>
                <span className="label">
                  Filling: <span className="kbd">{sel.formName}</span>
                </span>
              </div>
              <div className="hr" style={{ margin: '12px 0' }} />
              <FormRenderer
                form={sel}
                user={user}
                onSuccess={(id: string) => {
                  setToasts((t) => [`${id === 'queued-offline' ? 'Saved offline' : `Submitted #${id}`}`, ...t].slice(0, 3));
                  setSel(null); // ← return to main after ANY submit
                }}
                onError={(msg: string) => setToasts((t) => [`Error: ${msg}`, ...t].slice(0, 3))}
              />
            </>
          )}
        </section>

        <aside className="card card-pad">
          <h3 style={{ marginTop: 0 }}>Tips</h3>
          <ul className="list">
            <li>Status shows your connectivity in real time</li>
            <li>Submissions queue offline and auto-sync</li>
            <li>
              Use <span className="kbd">Tab</span> to move between fields
            </li>
          </ul>
        </aside>
      </div>

      <div className="toast" role="status" aria-live="polite">
        {toasts.map((t, i) => (
          <div key={i} className="item">
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}
