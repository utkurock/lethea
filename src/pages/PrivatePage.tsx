import { useCallback, useEffect, useRef, useState } from 'react';
import { short } from '../lib/format';
import {
  NETWORK,
  fromStroops,
  friendbot,
  isAddress,
  onProgress,
  openSession,
  plain,
  testnetBalance,
  toStroops,
  txUrl,
  walletNetwork,
  type Session,
  type TxResult,
} from '../spp/client';
import { useStellarWallet } from '../wallets/stellar';

type Mode = 'deposit' | 'send' | 'withdraw';

const MODES: { id: Mode; label: string; cta: string; note: string }[] = [
  {
    id: 'deposit',
    label: 'Deposit',
    cta: 'Deposit to pool',
    note: 'Your address and the amount are public.',
  },
  {
    id: 'send',
    label: 'Send',
    cta: 'Send privately',
    note: 'Recipient and amount stay private.',
  },
  {
    id: 'withdraw',
    label: 'Withdraw',
    cta: 'Withdraw',
    note: 'The amount out is public, not linked to your deposit.',
  },
];

const errorText = (e: unknown) => {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
  if (/not found in the public key registry/.test(msg)) return 'This recipient has not opened Private Send yet.';
  if (/reject|declin|cancel/i.test(msg)) return 'Signature rejected.';
  return msg || 'Something went wrong.';
};

// SDK stage messages already end in an ellipsis.
const dots = (s: string) => `${s.replace(/(…|\.\.\.)$/, '')}…`;

export function PrivatePage({ onConnect }: { onConnect: () => void }) {
  const wallet = useStellarWallet();
  const address = wallet.address;

  const [publicXlm, setPublicXlm] = useState<string | null | undefined>();
  const [walletOnTestnet, setWalletOnTestnet] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mode: Mode; tx: TxResult } | null>(null);
  const [funding, setFunding] = useState(false);
  const opened = useRef<string | null>(null);

  const refreshPublic = useCallback(async () => {
    if (!address) return;
    try {
      setPublicXlm(await testnetBalance(address));
    } catch {
      setPublicXlm(undefined);
    }
  }, [address]);

  // A new wallet starts from scratch: its notes and keys are its own.
  useEffect(() => {
    setSession(null);
    setBalance(null);
    setResult(null);
    setError(null);
    setPublicXlm(undefined);
    opened.current = null;
    if (!address) return;
    void refreshPublic();
    void walletNetwork().then((p) => setWalletOnTestnet(!p || p === NETWORK));
  }, [address, refreshPublic]);

  // The SDK reports proving and submission stages while a transaction is in flight.
  useEffect(() => onProgress((p) => setBusy((b) => b && (p.message || p.stage || b))), []);

  const refreshBalance = useCallback(async (s: Session) => {
    try {
      setBalance(await s.pool.balance());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  const open = async () => {
    if (!address || opened.current === address) return;
    opened.current = address;
    setError(null);
    try {
      const s = await openSession(address, setOpening);
      if (opened.current !== address) return;
      setSession(s);
      await refreshBalance(s);
    } catch (e) {
      opened.current = null;
      setError(errorText(e));
    } finally {
      setOpening(null);
    }
  };

  const fund = async () => {
    if (!address) return;
    setFunding(true);
    setError(null);
    try {
      await friendbot(address);
      await refreshPublic();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setFunding(false);
    }
  };

  const stroops = toStroops(amount);
  const current = MODES.find((m) => m.id === mode)!;
  const recipientOk = mode !== 'send' || isAddress(recipient);
  const overBalance = mode !== 'deposit' && balance !== null && stroops !== null && stroops > balance;
  const canSubmit = !!session && !busy && stroops !== null && recipientOk && !overBalance;

  const submit = async () => {
    if (!session || stroops === null) return;
    setError(null);
    setResult(null);
    setBusy('Generating the zero-knowledge proof');
    try {
      const raw =
        mode === 'deposit'
          ? await session.pool.deposit(stroops)
          : mode === 'send'
            ? await session.pool.transfer(recipient.trim(), stroops)
            : await session.pool.withdraw(stroops);
      const tx = plain(raw);
      if (tx.status === 'ok') {
        setResult({ mode, tx });
        setAmount('');
      } else if (tx.status === 'aspNotReady') {
        setError('The pool has not admitted your keys yet. Try again in a minute.');
      } else {
        setError(errorText(tx.message ?? 'The transaction failed.'));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
      await refreshBalance(session);
      void refreshPublic();
    }
  };

  return (
    <main className="private-page">
      <section className="private-card">
        <header className="private-head">
          <h1>Private Send</h1>
          <span className="net-badge">Testnet</span>
        </header>
        <p className="private-sub">
          Pay in XLM without showing who or how much.
        </p>

        {!address ? (
          <div className="private-step">
            <p>Stellar only. Set your wallet to Testnet.</p>
            <button className="cta" onClick={onConnect}>
              Connect wallet
            </button>
          </div>
        ) : publicXlm === null ? (
          <div className="private-step">
            <p>
              <b>{short(address)}</b> is not on testnet yet.
            </p>
            <button className="cta" onClick={() => void fund()} disabled={funding}>
              {funding ? 'Funding…' : 'Fund with Friendbot'}
            </button>
          </div>
        ) : !session ? (
          <div className="private-step">
            <p>One signature sets up your private keys. The first sync takes a minute.</p>
            <button className="cta" onClick={() => void open()} disabled={!!opening}>
              {opening ? dots(opening) : 'Open private balance'}
            </button>
          </div>
        ) : (
          <>
            <div className="balances">
              <div>
                <span>Private balance</span>
                <b>{balance === null ? '…' : `${fromStroops(balance)} XLM`}</b>
              </div>
              <div>
                <span>Wallet {short(address)}</span>
                <b>{publicXlm === undefined ? '…' : `${Number(publicXlm).toLocaleString('en-US')} XLM`}</b>
              </div>
            </div>

            <div className="modes" role="tablist">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={mode === m.id}
                  className={mode === m.id ? 'on' : ''}
                  onClick={() => {
                    setMode(m.id);
                    setResult(null);
                    setError(null);
                  }}
                  disabled={!!busy}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <label className="field">
              <span>Amount</span>
              <div className="field-row">
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
                  disabled={!!busy}
                />
                <em>XLM</em>
                {mode !== 'deposit' && balance !== null && balance > 0n && (
                  <button className="max" onClick={() => setAmount(fromStroops(balance))} disabled={!!busy}>
                    Max
                  </button>
                )}
              </div>
            </label>

            {mode === 'send' && (
              <label className="field">
                <span>Recipient</span>
                <input
                  placeholder="G…"
                  spellCheck={false}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={!!busy}
                />
              </label>
            )}

            <button className="cta" onClick={() => void submit()} disabled={!canSubmit}>
              {busy
                ? dots(busy)
                : overBalance
                  ? 'Not enough private balance'
                  : mode === 'send' && recipient && !recipientOk
                    ? 'Enter a G… address'
                    : current.cta}
            </button>
            <p className="leak">{current.note}</p>
          </>
        )}

        {address && !walletOnTestnet && (
          <p className="private-warn">Switch your wallet to Testnet.</p>
        )}
        {error && <p className="private-error">{error}</p>}
        {result && (
          <div className="private-done">
            <b>{MODES.find((m) => m.id === result.mode)!.label} confirmed</b>
            {result.tx.hashes.map((h) => (
              <a key={h} href={txUrl(h)} target="_blank" rel="noreferrer">
                {short(h)} on Stellar Expert
              </a>
            ))}
          </div>
        )}
      </section>

      <p className="mode-note">
        <b>Unaudited preview</b> of Stellar Private Payments by Nethermind.
      </p>
    </main>
  );
}
