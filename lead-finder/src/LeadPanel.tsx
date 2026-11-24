import { useState } from 'react';
import {
  type Lead, type Status, STATUSES, STATUS_LABEL, opportunity, mobileWhatsApp, waLink, mailLink, emailOf, draftMessage, leadBrief, igHandle, fbHandle,
} from './model';
import { auditSite, checkSocial, checkAds, analyzeLanding, inDays } from './actions';
import { ai } from './api';
import { buildSiteHtml } from './siteDraft';
import { Issues, copy, Score } from './ui';

type Props = { l: Lead; patch: (p: Partial<Lead>) => void; remove: () => void; aiReady: boolean; onBack: () => void; onReport: () => void; setErr: (s: string) => void };

export default function LeadPanel({ l, patch, remove, aiReady, onBack, onReport, setErr }: Props) {
  const [busy, setBusy] = useState('');
  const [lpUrl, setLpUrl] = useState('');
  const [chan, setChan] = useState<'whatsapp' | 'email' | 'instagram'>('whatsapp');
  const [site, setSite] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const o = opportunity(l);
  const out = l.outreach;
  const wa = l.message ?? out?.whatsapp ?? draftMessage(l);
  const subject = out?.email_subject ?? `Idee per migliorare la visibilità di ${l.name}`;
  const body = out?.email_body ?? `${wa}`;
  const work = async (label: string, fn: () => Promise<Partial<Lead>>) => {
    setBusy(label); setErr('');
    try { patch(await fn()); } catch (e) { setErr(`${label}: ${(e as Error).message}`); } finally { setBusy(''); }
  };
  const writeAI = () => work('Scrittura con AI', async () => {
    const t = await ai('outreach', [{ role: 'user', content: 'Scrivi i messaggi per questo lead.' }], leadBrief(l));
    const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    return { outreach: j, message: j.whatsapp };
  });
  const a = l.audit;
  const sent = (extra: Partial<Lead> = {}) => patch({ status: 'inviato', contactedAt: new Date().toISOString(), followUpAt: inDays(4), ...extra });

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="sec back" onClick={onBack}>← Indietro</button>
        <div className="row"><button className="sec" onClick={onReport}>📄 Report PDF</button><button className="sec" onClick={remove}>🗑</button></div>
      </div>
      <div className="row" style={{ marginTop: 8 }}><Score lead={l} size={52} /><div><h2 style={{ margin: 0 }}>{l.name}</h2>
        <div className="muted">{[...new Set([l.address, l.comune || l.city, l.province, l.region].filter(Boolean))].join(' · ')} · {l.category}</div></div></div>
      <p className="muted" style={{ margin: '8px 0' }}>{o.reasons.join(' · ') || 'Premi "Analizza" per capire che opportunità offre.'}</p>
      <p style={{ margin: '4px 0' }}>📞 {l.phone || '—'} {mobileWhatsApp(l) ? '(WhatsApp ✓)' : l.phone ? '(fisso: niente WhatsApp)' : ''} · ✉️ {emailOf(l) || '—'}<br />
        🌐 {l.website ? <a href={l.website.startsWith('http') ? l.website : 'https://' + l.website} target="_blank" rel="noreferrer">{l.website}</a> : <b className="alta">nessun sito</b>}
        <span className="row" style={{ display: 'inline-flex', marginLeft: 8 }}>
          <input style={{ width: 150 }} placeholder="sito (se lo conosci)" defaultValue="" onBlur={(e) => e.target.value && patch({ website: e.target.value.trim(), audit: undefined })} />
        </span></p>
      <label className="muted"><input type="checkbox" checked={!!l.doNotContact} onChange={(e) => patch({ doNotContact: e.target.checked, ...(e.target.checked && { status: 'perso' as Status }) })} /> Ha chiesto di non essere contattato</label>

      <details className="step" open>
        <summary><span className="n">1</span> Analizza {a && <span className="badge">sito {a.score}/10</span>}{l.social && <span className="badge">social ✓</span>}{l.landings?.length ? <span className="badge">landing ✓</span> : null}</summary>
        <div className="row">
          {l.website && <button className="pri" disabled={!!busy} onClick={() => work('Analisi sito', () => auditSite(l))}>{busy === 'Analisi sito' ? 'Analizzo…' : a ? 'Rifai analisi sito' : 'Analizza sito'}</button>}
          {!l.website && <span className="muted">Senza sito non c'è nulla da analizzare: è già un'opportunità.</span>}
        </div>
        {a && <>
          <h4>Sito — voto <span className="score">{a.score}/10</span>{a.builder && ` · ${a.builder}`}</h4>
          {a.pagespeed && <p className="muted">Velocità mobile {Math.round(a.pagespeed.performance * 100)} · SEO {Math.round(a.pagespeed.seo * 100)} · accessibilità {Math.round(a.pagespeed.accessibility * 100)}</p>}
          <Issues items={a.issues} />
        </>}
        <h4>Social (dati pubblici)</h4>
        <div className="row">
          <input placeholder="@instagram" defaultValue={igHandle(l)} onBlur={(e) => patch({ instagram: e.target.value.trim() })} />
          <button className="sec" disabled={!!busy || !igHandle(l)} onClick={() => work('Instagram', () => checkSocial(l, 'instagram'))}>Controlla</button>
          <input placeholder="pagina facebook" defaultValue={fbHandle(l)} onBlur={(e) => patch({ facebook: e.target.value.trim() })} />
          <button className="sec" disabled={!!busy || !fbHandle(l)} onClick={() => work('Facebook', () => checkSocial(l, 'facebook'))}>Controlla</button>
        </div>
        {l.social && Object.entries(l.social).map(([k, s]) => s.blocked
          ? <p key={k} className="muted">{k}: il social non lascia leggere i dati da fuori. <a href={s.url} target="_blank" rel="noreferrer">Aprilo a mano ↗</a> e guarda frequenza dei post e interazioni.</p>
          : <p key={k}><b>{k}</b>: {s.followers ?? '?'} follower · {s.posts ?? '?'} post {s.likes !== undefined && `· ${s.likes} mi piace`} <a href={s.url} target="_blank" rel="noreferrer">↗</a><br /><span className="muted">{s.notes?.join(' · ')}</span></p>)}
        <h4>Pubblicità (Ads Library)</h4>
        <div className="row">
          <button className="sec" disabled={!!busy} onClick={() => work('Controllo ads', () => checkAds(l))}>Controlla ads attive</button>
          <a className="sec linkbtn" target="_blank" rel="noreferrer" href={l.ads?.libraryUrl ?? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IT&q=${encodeURIComponent(l.name)}&search_type=keyword_unordered&media_type=all`}>Apri Ads Library ↗</a>
          <label className="muted"><input type="checkbox" checked={!!l.runsAds} onChange={(e) => patch({ runsAds: e.target.checked })} /> fa ads</label>
        </div>
        {l.ads?.needsToken && <p className="muted">Controllo automatico non ancora collegato: apri la Ads Library, se vedi annunci spunta "fa ads" e incolla qui sotto la pagina di destinazione.</p>}
        {l.ads && !l.ads.needsToken && <p>{l.ads.ads.length ? <b className="media">● {l.ads.ads.length} annunci attivi</b> : <span className="muted">Nessun annuncio attivo trovato.</span>}</p>}
        {l.ads?.ads.map((ad, k) => <div key={k} className="mini"><small>{ad.platforms.join(', ')} · da {ad.startedAt ?? '?'}{ad.leadGenLikely && <b className="media"> · probabile lead generation</b>}</small><div>{ad.text}</div>
          {ad.landingHints.map((h) => <button key={h} className="sec" onClick={() => setLpUrl(h)}>{h} → analizza</button>)}</div>)}
        <div className="row"><input style={{ flex: 1 }} placeholder="Pagina di destinazione delle ads (URL)" value={lpUrl} onChange={(e) => setLpUrl(e.target.value)} />
          <button className="pri" disabled={!!busy || lpUrl.length < 4} onClick={() => work('Analisi landing', () => analyzeLanding(l, lpUrl))}>{busy === 'Analisi landing' ? 'Analizzo…' : 'Analizza landing'}</button></div>
        {l.landings?.map((x) => <div key={x.url} className="mini">
          <b>{x.url}</b> — voto <span className="score">{x.score}/10</span>
          <p className="muted">Pixel Meta: {x.tracking.metaPixel ? 'sì' : x.tracking.gtm ? 'via Tag Manager?' : 'NO'} · campi modulo: {x.forms.count ? x.forms.maxFields : 'nessun modulo'} · WhatsApp/tel: {x.hasPhoneOrWhatsapp ? 'sì' : 'no'}</p>
          <Issues items={x.issues} />
          <h4>Landing ottimizzata consigliata</h4><ol style={{ paddingLeft: 18 }}>{x.proposal.map((p) => <li key={p.section}><b>{p.section}</b>: {p.content}</li>)}</ol></div>)}
        {!l.website && <div className="row" style={{ marginTop: 8 }}><button className="sec" onClick={() => setSite(buildSiteHtml(l))}>🛠 Crea bozza di sito da mostrare</button></div>}
        {l.website && <div className="row" style={{ marginTop: 8 }}><button className="sec" onClick={() => setSite(buildSiteHtml(l))}>🛠 Crea bozza di sito nuovo</button></div>}
      </details>

      <details className="step" open>
        <summary><span className="n">2</span> Messaggio</summary>
        <div className="tabs">{(['whatsapp', 'email', 'instagram'] as const).map((c) => <button key={c} className={chan === c ? 'on' : ''} onClick={() => setChan(c)}>{c === 'whatsapp' ? 'WhatsApp' : c === 'email' ? 'Email' : 'Instagram'}</button>)}</div>
        {chan === 'whatsapp' && <textarea value={wa} onChange={(e) => patch({ message: e.target.value })} />}
        {chan === 'email' && <><input style={{ width: '100%', marginBottom: 6 }} value={subject} onChange={(e) => patch({ outreach: { ...(out ?? { whatsapp: wa, instagram_dm: '', email_subject: '', email_body: '' }), email_subject: e.target.value } })} />
          <textarea value={body} onChange={(e) => patch({ outreach: { ...(out ?? { whatsapp: wa, instagram_dm: '', email_subject: subject, email_body: '' }), email_body: e.target.value } })} /></>}
        {chan === 'instagram' && <textarea value={out?.instagram_dm ?? wa} onChange={(e) => patch({ outreach: { ...(out ?? { whatsapp: wa, email_subject: subject, email_body: body, instagram_dm: '' }), instagram_dm: e.target.value } })} />}
        <div className="row">
          <button className="sec" disabled={!aiReady || !!busy} title={aiReady ? '' : 'Collega l\'AI nella scheda Collegamenti'} onClick={writeAI}>{busy === 'Scrittura con AI' ? 'Scrivo…' : '✨ Scrivi con AI'}</button>
          <button className="sec" onClick={() => copy(chan === 'email' ? body : chan === 'instagram' ? out?.instagram_dm ?? wa : wa)}>Copia testo</button>
          {l.message && <button className="sec" onClick={() => patch({ message: undefined })}>Ripristina bozza</button>}
        </div>
        {!aiReady && <p className="muted">Questa è una bozza automatica. Con l'AI collegata il testo diventa più personale.</p>}
      </details>

      <details className="step" open>
        <summary><span className="n">3</span> Invia</summary>
        <div className="row">
          {mobileWhatsApp(l) && !l.doNotContact ? <a className="wa" target="_blank" rel="noreferrer" href={waLink(l, wa)!} onClick={() => sent()}>Apri WhatsApp con il messaggio pronto</a>
            : <span className="muted">Nessun cellulare: usa email o Instagram.</span>}
          {emailOf(l) && !l.doNotContact && <a className="sec linkbtn" href={mailLink(l, subject, body)} onClick={() => sent()}>✉️ Apri email</a>}
          {igHandle(l) && <a className="sec linkbtn" target="_blank" rel="noreferrer" href={`https://instagram.com/${igHandle(l)}`} onClick={() => copy(out?.instagram_dm ?? wa)}>Instagram (copia testo e apre)</a>}
        </div>
        <p className="muted">L'invio resta un tuo clic: nessun messaggio parte da solo.</p>
      </details>

      <details className="step">
        <summary><span className="n">4</span> Segui · <span className="badge">{STATUS_LABEL[l.status]}</span></summary>
        <div className="row">
          <select value={l.status} onChange={(e) => patch({ status: e.target.value as Status })}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
          <label className="muted">Ricontatta il <input type="date" value={l.followUpAt ?? ''} onChange={(e) => patch({ followUpAt: e.target.value })} /></label>
          <label className="muted">Call <input type="datetime-local" value={l.callAt ?? ''} onChange={(e) => patch({ callAt: e.target.value, ...(e.target.value && { status: 'call' as Status }) })} /></label>
        </div>
        <textarea placeholder="Note" value={l.notes} onChange={(e) => patch({ notes: e.target.value })} style={{ marginTop: 8 }} />
        <h4>Dopo la call</h4>
        <textarea placeholder="Incolla qui le note o la trascrizione della call…" value={callNotes} onChange={(e) => setCallNotes(e.target.value)} />
        <div className="row"><button className="pri" disabled={!aiReady || !!busy || callNotes.length < 20} onClick={() => work('Report call', async () => ({ callReport: await ai('postcall', [{ role: 'user', content: callNotes }], leadBrief(l)), status: 'proposta' as Status }))}>{busy === 'Report call' ? 'Preparo…' : '✨ Prepara report di studio'}</button>
          {!aiReady && <span className="muted">Serve l'AI collegata.</span>}</div>
        {l.callReport && <div className="mini"><pre className="rep">{l.callReport}</pre><button className="sec" onClick={() => copy(l.callReport!)}>Copia</button></div>}
      </details>

      {site && <div className="modal"><div className="modal-box">
        <div className="row" style={{ marginBottom: 8 }}><b>Bozza di sito per {l.name}</b>
          <button className="pri" onClick={() => { const u = URL.createObjectURL(new Blob([site], { type: 'text/html' })); const el = document.createElement('a'); el.href = u; el.download = `${l.name.replace(/\W+/g, '-').toLowerCase()}.html`; el.click(); URL.revokeObjectURL(u); }}>Scarica HTML</button>
          <button className="sec" onClick={() => setSite('')}>Chiudi</button></div>
        <iframe title="bozza" sandbox="" srcDoc={site} style={{ width: '100%', height: '70vh', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }} />
        <p className="muted">È una bozza con i dati pubblici trovati: testi e foto da completare insieme al cliente.</p></div></div>}
      {busy && <div className="toast">{busy}…</div>}
    </div>
  );
}
