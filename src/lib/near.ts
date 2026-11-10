import { useEffect, useState } from 'react';

/** A named NEAR account: lowercase labels joined by dots, ending in .near, 64 characters at most. */
export const isNearName = (name: string) => /^(([a-z\d]+[-_])*[a-z\d]+\.)+near$/.test(name) && name.length <= 64;

export type NearState = 'checking' | 'ok' | 'missing' | 'error';

/** A named NEAR account has to exist before it can receive; an intent to a missing one would be refunded. */
export function useNearAccount(name?: string): NearState {
  const [result, setResult] = useState<{ name: string; state: NearState }>();
  useEffect(() => {
    if (!name) return;
    let live = true;
    const setState = (state: NearState) => live && setResult({ name, state });
    fetch('https://rpc.mainnet.fastnear.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'query',
        params: { request_type: 'view_account', finality: 'final', account_id: name },
      }),
    })
      .then((r) => r.json())
      .then((body: { result?: unknown; error?: { cause?: { name?: string } } }) => {
        setState(body.result ? 'ok' : body.error?.cause?.name === 'UNKNOWN_ACCOUNT' ? 'missing' : 'error');
      })
      .catch(() => setState('error'));
    return () => {
      live = false;
    };
  }, [name]);
  return result && result.name === name ? result.state : 'checking';
}
