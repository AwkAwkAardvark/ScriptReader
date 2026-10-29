import { AdminActionLink } from './AdminActionLink';
import { SongManager } from './SongManager';
import { ProductionManager } from './ProductionManager';
import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '../BrandMark';
import { copy, type Locale } from '../i18n';
import { adminCopy } from './copy';
import { adminClient, AdminFailure } from './client';
import type { AdminAccount, AdminAction, AdminError, AdminSession } from './protocol';

export function AdminPanel({page='overview'}:{page?:'overview'|'scripts'|'accounts'|'songs'}) {
  const [locale, setLocale] = useState<Locale>(new URLSearchParams(window.location.search).get('lang')==='ko'?'ko':'en');
  const text = adminCopy[locale];
  const pageTitle = page==='scripts'?(locale==='ko'?'공연 대본':'Scripts'):page==='songs'?(locale==='ko'?'노래':'Songs'):page==='accounts'?text.accounts:text.title;
  const [session, setSession] = useState<AdminSession | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);
  const [selected, setSelected] = useState<Record<string, 'admin' | 'master'>>({});
  const [change, setChange] = useState<{ account: AdminAccount; role: AdminAction } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const master = session?.account?.status === 'approved' && session.account.role === 'master';
  const masterCount = accounts.filter(account => account.status === 'approved' && account.role === 'master').length;

  async function refresh(signal?: AbortSignal) {
    const next = await adminClient.me(signal);
    if (signal?.aborted) return;
    setSession(next);setAccounts([]);setSelected({});
    if (page === 'accounts' && next.account?.role === 'master' && next.account.status === 'approved') {
      const result = await adminClient.accounts(signal);
      if (!signal?.aborted) setAccounts(result.accounts);
    }
  }
  function failure(value: unknown) { setError(value instanceof AdminFailure ? value.code : 'unavailable'); }
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(value => { if (!controller.signal.aborted) failure(value); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page]);
  useEffect(() => { document.documentElement.lang = locale;document.title = `${copy[locale].app} — ${pageTitle}`; }, [locale, pageTitle]);
  useEffect(() => { if (change && !dialog.current?.open) dialog.current?.showModal();else if (!change) dialog.current?.close(); }, [change]);

  async function run(operation: () => Promise<unknown>) {
    setBusy(true);setError(null);
    try { await operation();await refresh(); }
    catch (value) {
      failure(value);
      if (value instanceof AdminFailure && ['unauthorized', 'forbidden'].includes(value.code)) { setAccounts([]);await refresh().catch(() => {}); }
    } finally { setBusy(false); }
  }
  async function login() {
    setBusy(true);setError(null);
    try { const result = await adminClient.login();window.location.assign(result.url); }
    catch (value) { failure(value);setBusy(false); }
  }
  const statusText = (account: AdminAccount) => account.status === 'pending' ? text.pending : account.status === 'revoked' ? text.revoked : account.role === 'master' ? text.master : text.admin;
  function row(account: AdminAccount) {
    const role = selected[account.user_id] ?? account.role;
    const last = account.role === 'master' && masterCount === 1;
    return <li className="admin-account" key={account.user_id}>
      <div className="admin-identity"><strong>{account.name}</strong><span>{account.email}</span><span className="admin-badge">{statusText(account)}{last ? ` · ${text.last}` : ''}</span></div>
      <div className="admin-account-actions">
        <label className="visually-hidden" htmlFor={`access-${account.user_id}`}>{text.accessFor} {account.email}</label>
        <select id={`access-${account.user_id}`} value={role} disabled={busy || last} onChange={event => setSelected(previous => ({ ...previous, [account.user_id]: event.target.value as 'admin' | 'master' }))}>
          <option value="admin">{text.admin}</option><option value="master" disabled={masterCount >= 3 && account.role !== 'master'}>{text.master}</option>
        </select>
        <button className="admin-primary" disabled={busy || (account.status === 'approved' && role === account.role)} onClick={() => setChange({ account, role })}>
          {account.status === 'pending' ? text.approve : account.status === 'revoked' ? text.restore : text.save}
        </button>
        {account.status !== 'revoked' && <button className="admin-secondary" disabled={busy || last} onClick={() => setChange({ account, role: 'revoked' })}>{text.revoke}</button>}
      </div>
    </li>;
  }
  return <div className="app-shell admin-shell">
    <header className="masthead"><a className="brand" href="/"><BrandMark /><span>{copy[locale].app}</span></a>
      <div className="language-switch" role="group" aria-label={copy[locale].interfaceLanguage}>
        <button lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>ENG</button>
        <button lang="ko" aria-pressed={locale === 'ko'} onClick={() => setLocale('ko')}>한국어</button>
      </div>
    </header>
    <main className="admin-main" aria-busy={loading || busy}>
      <div className="admin-heading"><h1>{pageTitle}</h1><AdminActionLink href="/">{text.reader}</AdminActionLink></div>
      {error && <p className="admin-error" role="alert">{text.errors[error]}</p>}
      {!error && new URLSearchParams(window.location.search).get('auth') === 'failed' && !session?.user && <p className="admin-error" role="alert">{text.loginFailed}</p>}
      {loading ? <p role="status">{text.loading}</p> : !session?.user ? <section className="admin-card admin-signin">
        {session?.configured === false ? <p role="status">{text.setup}</p> : <button className="admin-primary" disabled={busy} onClick={() => void login()}>{text.login}</button>}
      </section> : <>
        <nav className="admin-navigation" aria-label={locale==='ko'?'관리 메뉴':'Administration navigation'}>{([['overview','/admin',text.title],['scripts','/admin/scripts',locale==='ko'?'공연 대본':'Scripts'],['songs','/admin/songs',locale==='ko'?'노래':'Songs'],...(master?[['accounts','/admin/accounts',text.accounts]]:[])]).filter(([key])=>key==='overview'||session.account?.status==='approved').map(([key,href,label])=><a key={key} href={`${href}${locale==='ko'?'?lang=ko':''}`} aria-current={page===key?'page':undefined}>{label}</a>)}</nav>
        {(page==='overview'||session.account?.status!=='approved')&&<section className="admin-card admin-session">
          <div className="admin-identity"><strong>{session.user.name}</strong><span>{session.user.email}</span><span className="admin-badge">{session.account ? statusText(session.account) : text.noAccess}</span></div>
          <div className="admin-session-actions">
            {(!session.account || session.account.status === 'revoked') && <button className="admin-primary" disabled={busy} onClick={() => void run(adminClient.request)}>{session.account ? text.requestAgain : text.request}</button>}
            <button className="admin-secondary" disabled={busy} onClick={() => void run(adminClient.logout)}>{text.logout}</button>
          </div>
        </section>}
        {page==='scripts' && session.account?.status === 'approved' && <ProductionManager locale={locale} />}
        {page==='songs' && session.account?.status === 'approved' && <SongManager locale={locale} />}
        {page==='accounts' && !master && !error && <p role="alert">{text.errors.forbidden}</p>}
        {page==='accounts' && master && <section className="admin-card"><div className="admin-heading"><h2>{locale==='ko'?'직원 계정':'Staff accounts'}</h2><span className="admin-badge">{text.masters(masterCount)}</span></div>
          {(['pending', 'approved', 'revoked'] as const).map(status => <section className="admin-account-group" key={status}>
            <h3>{status === 'pending' ? text.requests : status === 'approved' ? text.active : text.removed}</h3>
            {accounts.some(account => account.status === status) ? <ul>{accounts.filter(account => account.status === status).map(row)}</ul> : <p className="admin-empty">{text.empty}</p>}
          </section>)}
        </section>}
      </>}
    </main>
    <dialog ref={dialog} className="admin-dialog" aria-labelledby="access-dialog-title" onCancel={event => { event.preventDefault();if (!busy) setChange(null); }}>
      {change && <><h2 id="access-dialog-title">{text.confirmation}</h2><p>{text.confirmationText}</p>
        <div className="admin-identity"><strong>{change.account.name}</strong><span>{change.account.email}</span><span className="admin-badge">{change.role === 'revoked' ? text.revoked : change.role === 'master' ? text.master : text.admin}</span></div>
        {change.account.user_id === session?.user?.id && <p>{text.selfChange}</p>}
        <div className="admin-dialog-actions"><button className="admin-secondary" disabled={busy} onClick={() => setChange(null)}>{text.cancel}</button>
          <button className="admin-primary" disabled={busy} onClick={() => { const chosen = change;setChange(null);void run(() => adminClient.change(chosen.account.user_id, chosen.role)); }}>{text.confirm}</button></div>
      </>}
    </dialog>
  </div>;
}
