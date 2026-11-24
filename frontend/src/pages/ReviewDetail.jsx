import { useEffect, useState } from 'react';
import { api } from '../api.js';

const fmtDob = (d) => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d || '—');
const name = (d) => [d?.givenName, d?.familyName].filter(Boolean).join(' ') || '(no name)';

export default function ReviewDetail({ id, onBack, onResolved, onError }) {
  const [data, setData] = useState(null);
  const [survivor, setSurvivor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.getTask(id);
        setData(d);
        // Default the survivor to the side with more clinical history — merging into
        // the richer record moves fewer things and is the safer default.
        const weight = (s) => Object.values(s.clinical ?? {}).reduce((a, b) => a + b, 0);
        setSurvivor(weight(d.sides.b) > weight(d.sides.a) ? d.sides.b.goldenUid : d.sides.a.goldenUid);
      } catch (err) { onError(err.message); onBack(); }
    })();
  }, [id, onBack, onError]);

  if (!data) return <p className="muted">Loading…</p>;

  const { task, sides } = data;
  const resolved = task.status !== 'OPEN' && task.status !== 'MERGE_PARTIAL';
  const loser = survivor === sides.a.goldenUid ? sides.b : sides.a;
  const keep = survivor === sides.a.goldenUid ? sides.a : sides.b;

  async function doMerge() {
    setBusy(true);
    try {
      const out = await api.merge(id, survivor);
      const moved = Object.entries(out.result?.hapi?.moved ?? {}).map(([k, v]) => `${v} ${k}`).join(', ') || 'no clinical records';
      onResolved({
        kind: 'ok',
        message: `Merged into Health ID ${out.result.survivorHealthId}. Moved ${moved}. Health ID ${out.result.retiredHealthId} retired.`,
      });
    } catch (err) {
      // A partial merge means JeMPI and FHIR now disagree — say so plainly.
      onError(err.data?.status === 'MERGE_PARTIAL'
        ? `Partial merge: ${err.message}. Identity merged in JeMPI but the FHIR record did not finish. Retry this merge.`
        : err.message);
      setBusy(false);
      setConfirming(false);
    }
  }

  async function doDismiss() {
    setBusy(true);
    try {
      await api.dismiss(id, 'reviewed: different people');
      onResolved({ kind: 'ok', message: 'Marked as different people. This pair will not be raised again.' });
    } catch (err) { onError(err.message); setBusy(false); }
  }

  return (
    <section className="detail">
      <button className="link back" onClick={onBack}>← Back to queue</button>

      <div className="detail-head">
        <div className={`score big band-${task.band}`}>
          <strong>{(task.score * 100).toFixed(0)}%</strong>
          <span>{task.band} match</span>
        </div>
        <div>
          <h2>{name(sides.a.demographics)} &nbsp;·&nbsp; {name(sides.b.demographics)}</h2>
          <p className="muted">
            Scored on {task.detail?.comparedCount} comparable field(s).
            Threshold for review is {(data.thresholds.low * 100).toFixed(0)}%.
          </p>
        </div>
      </div>

      {resolved && (
        <div className="banner">
          Already resolved: <strong>{task.status}</strong>
          {task.resolvedBy ? ` by ${task.resolvedBy}` : ''}.
        </div>
      )}
      {task.status === 'MERGE_PARTIAL' && (
        <div className="banner warn">
          This merge completed in JeMPI but not in the FHIR record — the two stores disagree.
          Re-running the merge is safe and will finish the job.
        </div>
      )}

      <div className="compare">
        {['a', 'b'].map((k) => {
          const s = sides[k];
          const isSurvivor = survivor === s.goldenUid;
          return (
            <div key={k} className={`card side ${isSurvivor ? 'survivor' : ''}`}>
              <label className="pick">
                <input
                  type="radio"
                  name="survivor"
                  checked={isSurvivor}
                  disabled={resolved || !s.exists}
                  onChange={() => setSurvivor(s.goldenUid)}
                />
                <span>{isSurvivor ? 'Keep this record' : 'Keep this one instead'}</span>
              </label>

              <dl>
                <div><dt>Health ID</dt><dd className="mono">{s.healthId ?? '—'}</dd></div>
                <div><dt>Golden UID</dt><dd className="mono">{s.goldenUid}{!s.exists && ' (gone)'}</dd></div>
                <div><dt>Name</dt><dd>{name(s.demographics)}</dd></div>
                <div><dt>Date of birth</dt><dd>{fmtDob(s.demographics?.dob)}</dd></div>
                <div><dt>Gender</dt><dd>{s.demographics?.gender || '—'}</dd></div>
                <div><dt>Phone</dt><dd>{s.demographics?.phoneNumber || '—'}</dd></div>
                <div><dt>City</dt><dd>{s.demographics?.city || '—'}</dd></div>
                <div><dt>National ID</dt><dd>{s.demographics?.nationalId || '—'}</dd></div>
                <div><dt>Facilities</dt><dd>{s.facilities?.join(', ') || '—'}</dd></div>
                <div>
                  <dt>Clinical records</dt>
                  <dd>
                    {Object.keys(s.clinical ?? {}).length
                      ? Object.entries(s.clinical).map(([t, n]) => `${n} ${t}`).join(', ')
                      : 'none'}
                  </dd>
                </div>
                <div>
                  <dt>MRNs</dt>
                  <dd className="mono">
                    {(s.patient?.identifiers ?? [])
                      .filter((i) => !i.system.includes('nepal-health-id') && !i.system.includes('jempi-golden-uid'))
                      .map((i) => i.value).join(', ') || '—'}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>Field-by-field evidence</h3>
        <table className="fields">
          <thead>
            <tr><th>Field</th><th>Record A</th><th>Record B</th><th>Verdict</th><th className="num">Weight</th></tr>
          </thead>
          <tbody>
            {(task.detail?.fields ?? []).map((f) => (
              <tr key={f.field} className={!f.compared ? 'skipped' : f.agree ? 'agree' : 'disagree'}>
                <td>{f.label}</td>
                <td className="mono">{String(f.a || '—')}</td>
                <td className="mono">{String(f.b || '—')}</td>
                <td>
                  {!f.compared
                    ? <span className="muted">not compared — {f.reason}</span>
                    : f.agree
                      ? <span className="ok">agrees{f.comparison === 'jaro-winkler' && f.similarity < 1 ? ` (${f.similarity})` : ''}</span>
                      : <span className="no">differs</span>}
                </td>
                <td className="num mono">{f.compared ? (f.weight > 0 ? `+${f.weight}` : f.weight) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          Weights are log-likelihood bits from the JeMPI link configuration. Fields that are
          blank — or carry a placeholder phone number — are not counted as evidence either way.
        </p>
      </div>

      {!resolved && (
        <div className="actions">
          {!confirming ? (
            <>
              <button className="primary" onClick={() => setConfirming(true)} disabled={busy || !keep.exists}>
                Merge — same person
              </button>
              <button className="secondary" onClick={doDismiss} disabled={busy}>
                Not the same person
              </button>
            </>
          ) : (
            <div className="confirm">
              <p>
                Merge <strong>{loser.healthId}</strong> into <strong>{keep.healthId}</strong>?
                {' '}All clinical records move to {keep.healthId}; Health ID {loser.healthId} is
                retired and will forward to it.
                {' '}<strong>This cannot be undone.</strong>
              </p>
              <div className="actions">
                <button className="danger" onClick={doMerge} disabled={busy}>
                  {busy ? 'Merging…' : `Yes, merge into ${keep.healthId}`}
                </button>
                <button className="secondary" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
