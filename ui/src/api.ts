export type Form = { ID: string; formName: string; active: boolean };
export type Question = { ID: string; form_ID: string; question: string; type_code: number };

export const SERVICE_BASE = '/api/service/RioFormsService';

async function fetchCsrf(): Promise<string> {
  const res = await fetch(`${SERVICE_BASE}/$metadata`, { method: 'GET', headers: { 'x-csrf-token': 'Fetch' }, credentials: 'include' });
  return res.headers.get('x-csrf-token') || '';
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...init });
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0,200)}`);
  if (!ct.includes('application/json') && text.startsWith('<')) {
    throw new Error('Got HTML instead of JSON. Check destination URL and service path.');
  }
  return JSON.parse(text);
}

export async function listActiveForms(): Promise<Form[]> {
  const url = `${SERVICE_BASE}/Form?$filter=active%20eq%20true&$select=ID,formName,active&$orderby=formName`;
  const json = await fetchJson(url);
  return json.value as Form[];
}

export async function listQuestions(formID: string): Promise<Question[]> {
  const url = `${SERVICE_BASE}/Questions?$filter=form_ID%20eq%20'${formID}'&$select=ID,form_ID,question,type_code&$orderby=ID`;
  const json = await fetchJson(url);
  return json.value as Question[];
}

export async function submitFormOnline(
  formID: string,
  firstName: string,
  lastName: string,
  answers: { questionID: string; value: string | boolean; type_code: number }[]
): Promise<string> {
  const csrf = await fetchCsrf();
  const recRes = await fetch(`${SERVICE_BASE}/FormRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    credentials: 'include',
    body: JSON.stringify({ form_ID: formID, firstName, lastName })
  });
  if (!recRes.ok) throw new Error('Failed to create form record');
  const rec = await recRes.json();
  const formRecordID: string = rec.ID;

  for (const a of answers) {
    const body: any = { formRecord_ID: formRecordID, question_ID: a.questionID };
    if (a.type_code === 2) body.boolAnswer = Boolean(a.value);
    else body.textAnswer = String(a.value ?? '');

    const aRes = await fetch(`${SERVICE_BASE}/AnswerRecord`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (!aRes.ok) throw new Error('Failed to create answer record');
  }
  return formRecordID;
}

export async function submitFormDeepInsert(payload: {
  form_ID: string;
  firstName: string;
  lastName: string;
  answerRecords: Array<{ question_ID: string; textAnswer?: string; boolAnswer?: boolean }>;
}): Promise<string> {
  const csrf = await fetchCsrf();
  const res = await fetch(`${SERVICE_BASE}/FormRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text().catch(()=>'');
    throw new Error(`Sync failed: ${t.slice(0,200)}`);
  }
  const obj = await res.json();
  return obj.ID as string;
}


// ADD this helper below your existing exports
export async function syncDeepInsert(payload: any, tolerateConflict = true): Promise<{ ok: boolean; status: number; id?: string; text?: string }> {
  // fetch CSRF first (same host via approuter)
  const meta = await fetch(`${SERVICE_BASE}/$metadata`, { headers: { 'x-csrf-token': 'Fetch' }, credentials: 'include' });
  const token = meta.headers.get('x-csrf-token') || '';
  const res = await fetch(`${SERVICE_BASE}/FormRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  const text = await res.text().catch(() => '');
  if (res.ok) {
    try { const obj = JSON.parse(text || '{}'); return { ok: true, status: res.status, id: obj.ID, text }; } catch { return { ok: true, status: res.status, id: undefined, text }; }
  }
  // Treat duplicate key as success if tolerateConflict = true
  if (tolerateConflict && (res.status === 409 || /duplicate|unique|conflict/i.test(text))) {
    return { ok: true, status: res.status, id: undefined, text };
  }
  return { ok: false, status: res.status, id: undefined, text };
}
