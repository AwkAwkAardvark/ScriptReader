import { useEffect, useState } from 'react';
export function Home() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/home', { cache: 'no-store', signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const { destination } = await response.json();
      if (destination !== '/import' && (typeof destination !== 'string' || !/^\/p\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destination))) throw new Error();
      if (!abort.signal.aborted) window.location.replace(destination);
    }).catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, []);
  return <main className="app-shell"><h1>Script Reader</h1>{failed
    ? <p role="alert">Unable to open the homepage. / 첫 화면을 열 수 없습니다. <button onClick={() => window.location.reload()}>Retry / 다시 시도</button></p>
    : <p role="status">Loading… / 불러오는 중…</p>}</main>;
}
