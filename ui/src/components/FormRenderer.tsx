// ui/src/components/FormRenderer.tsx
import { useEffect, useState } from 'react';
import Switch from './Switch';
import { listQuestions, submitFormOnline, type Form, type Question } from '../api';
import { queueSubmission, saveQuestions, getQuestions } from '../offline';

type Props = {
  form: Form;
  user: { firstName?: string; lastName?: string };
  onSuccess?: (id: string) => void;
  onError?: (msg: string) => void;
};

export default function FormRenderer({ form, user, onSuccess, onError }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [textValues, setText] = useState<Record<string, string>>({});
  const [boolValues, setBool] = useState<Record<string, boolean>>({});
  const [firstName, setFirst] = useState(user.firstName || '');
  const [lastName, setLast] = useState(user.lastName || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setQuestions([]);
    (async () => {
      try {
        const qs = await listQuestions(form.ID);
        setQuestions(qs);
        await saveQuestions(form.ID, qs);
      } catch (e: any) {
        const cached = await getQuestions(form.ID);
        setQuestions(cached);
        setError(cached.length ? null : (typeof e?.message === 'string' ? e.message : String(e)));
      }
    })();
  }, [form.ID]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const answers = questions.map(q => ({
        questionID: q.ID,
        type_code: q.type_code,
        value: q.type_code === 2 ? Boolean(boolValues[q.ID]) : (textValues[q.ID] || '')
      }));

      if (navigator.onLine) {
        const recID = await submitFormOnline(form.ID, firstName, lastName, answers);
        onSuccess?.(recID);
      } else {
        await queueSubmission({
          form_ID: form.ID,
          firstName, lastName,
          answerRecords: answers.map(a => (a.type_code === 2
            ? { question_ID: a.questionID, boolAnswer: Boolean(a.value) }
            : { question_ID: a.questionID, textAnswer: String(a.value ?? '') }))
        });
        onSuccess?.('queued-offline');
      }

      // clear local state
      setText({}); setBool({});
    } catch (err: any) {
      const msg = typeof err?.message === 'string' ? err.message : String(err);
      setError(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid" style={{maxWidth:720}}>
      {error && <div className="alert">{error}</div>}

      <div className="grid grid-2">
        <label className="grid">
          <span className="label">First name</span>
          <input className="input" placeholder="First name" value={firstName} onChange={e => setFirst(e.target.value)} required />
        </label>
        <label className="grid">
          <span className="label">Last name</span>
          <input className="input" placeholder="Last name" value={lastName} onChange={e => setLast(e.target.value)} required />
        </label>
      </div>

      {!questions.length ? (
        <div className="grid">
          <div className="skeleton" style={{height:48}} />
          <div className="skeleton" style={{height:48}} />
          <div className="skeleton" style={{height:48}} />
        </div>
      ) : (
        questions.map(q => (
          <label key={q.ID} className="grid">
            <span className="label">{q.question}</span>
            {q.type_code === 2 ? (
              <Switch
                checked={!!boolValues[q.ID]}
                onChange={(val) => setBool(prev => ({ ...prev, [q.ID]: val }))}
                label={q.question}
              />
            ) : (
              <input
                className="input"
                value={textValues[q.ID] || ''}
                onChange={e => setText(prev => ({ ...prev, [q.ID]: e.target.value }))}
                required
              />
            )}
          </label>
        ))
      )}

      <div className="row" style={{justifyContent:'flex-end'}}>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Submitting…' : (navigator.onLine ? 'Submit' : 'Save offline')}
        </button>
      </div>
    </form>
  );
}
