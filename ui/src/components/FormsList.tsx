// ui/src/components/FormsList.tsx
import { useEffect, useState } from 'react';
import { listActiveForms, type Form } from '../api';
import { saveForms, getForms } from '../offline';

export default function FormsList({ onSelect }: { onSelect: (f: Form) => void }) {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const online = await listActiveForms();
        setForms(online);
        await saveForms(online); // persist for offline
      } catch (e: any) {
        const cached = await getForms();
        setForms(cached);
        setError(cached.length ? null : (typeof e?.message === 'string' ? e.message : String(e)));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div className="grid">
      <div className="skeleton" style={{height:42}} />
      <div className="skeleton" style={{height:42}} />
      <div className="skeleton" style={{height:42}} />
    </div>
  );
  if (error) return <div className="alert">{error}</div>;
  if (!forms.length) return <p className="label">No active forms.</p>;

  return (
    <ul className="list">
      {forms.map(f => (
        <li key={f.ID}>
          <button className="btn block" onClick={() => onSelect(f)}>{f.formName}</button>
        </li>
      ))}
    </ul>
  );
}
