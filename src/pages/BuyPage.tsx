import type { Chains } from '@aurora-is-near/intents-swap-widget';
import { useState } from 'react';
import { CHAINS_LIST } from '@aurora-is-near/intents-swap-widget/constants';
import { SwapSlot } from '../components/SwapSlot';
import { CHAINS } from '../intents/chains';
import { postFees } from '../intents/fees';
import { short } from '../lib/format';
import { isNearName, useNearAccount } from '../lib/near';
import { linkTo } from '../lib/router';
import { fmtUsd, iconFor, platedIcon, useIntentsTokens } from '../lib/tokens';

type Props = { chain: string; symbol: string; onConnect: () => void };

// Only links to the post's own page on X are shown back to the user.
const postLink = () => {
  const raw = new URLSearchParams(window.location.search).get('post');
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && /^(x|twitter)\.com$/.test(url.hostname) && /^\/\w+\/status\/\d+/.test(url.pathname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

// Red flags the extension saw on the post, as codes this page words itself. Anyone can add them to a link,
// so a code only fills a domain, an address or a symbol into a fixed sentence and never shows free text.
const HOST = /^(?=.{1,253}$)[a-z\d-]+(\.[a-z\d-]+)+$/;
const ADDRESS = /^(0x[a-fA-F\d]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const warningText = (code: string) => {
  const [kind, a = '', b = ''] = code.split(':');
  if (kind === 'brand' && HOST.test(a) && /^[a-z]{2,20}$/.test(b)) return `${a} is not a ${b[0].toUpperCase()}${b.slice(1)} domain`;
  if (kind === 'lookalike' && HOST.test(a)) return `${a} uses look-alike characters`;
  if (kind === 'phishing' && HOST.test(a)) return `${a} is a reported phishing site`;
  if (kind === 'impostor' && ADDRESS.test(a) && /^[A-Z][A-Z\d]{0,11}$/.test(b)) return `${short(a)} is not the $${b} NEAR Intents lists`;
  if (kind === 'token' && ADDRESS.test(a)) return `GoPlus flags the token at ${short(a)} as dangerous`;
  return undefined;
};
const postWarnings = () => [
  ...new Set(
    new URLSearchParams(window.location.search)
      .getAll('warn')
      .slice(0, 3)
      .flatMap((w) => warningText(w) ?? []),
  ),
];

// The post's author's .near account, read by the extension from their X name. It only earns a share once
// the account is confirmed to exist.
const creatorParam = () => {
  const c = new URLSearchParams(window.location.search).get('creator')?.toLowerCase();
  return c && isNearName(c) ? c : undefined;
};

/**
 * `/buy/:chain/:symbol`, what the Lethea extension for X opens when a post names a token NEAR Intents
 * lists. One column so it fits the extension's popup window: the token, the post it came from, and a
 * swap box that targets it.
 */
export function BuyPage({ chain, symbol, onConnect }: Props) {
  const list = useIntentsTokens();
  const supported = (CHAINS as string[]).includes(chain);
  const listing = list.find((t) => t.blockchain === chain && t.symbol.toLowerCase() === symbol.toLowerCase());
  const chainLabel = CHAINS_LIST[chain as Chains]?.label ?? chain;
  const post = postLink();
  const warnings = postWarnings();
  const creatorName = creatorParam();
  const creatorState = useNearAccount(creatorName);
  const creator = creatorState === 'ok' ? creatorName : undefined;
  // Hold the swap box until the author check settles, so the quote doesn't change under the user.
  const feesReady = !creatorName || creatorState !== 'checking';
  // Logos for the long tail of tokens come from other hosts and sometimes fail; fall back to the letter.
  const [broken, setBroken] = useState(false);
  const icon = broken ? undefined : iconFor(listing?.symbol ?? symbol);

  if (!supported || (list.length && !listing)) {
    return (
      <main className="buy-page">
        <h1>Lethea can't buy {symbol} on {chainLabel}</h1>
        <p className="buy-note">
          {supported ? 'NEAR Intents does not list this token on that chain.' : 'Lethea does not route to that chain yet.'}{' '}
          <a href="/" onClick={linkTo('/')}>
            Open the swap
          </a>
        </p>
      </main>
    );
  }

  return (
    <main className="buy-page">
      <div className="token-head">
        {icon ? <img src={icon} alt="" className={platedIcon(symbol) ? 'plated' : undefined} onError={() => setBroken(true)} /> : <span className="mono">{symbol[0]}</span>}
        <div>
          <h1>Buy {listing?.symbol ?? symbol}</h1>
          <span>
            on {chainLabel}
            {listing && (listing.contractAddress ? ` · ${short(listing.contractAddress)}` : ' · native')}
            {listing?.price ? ` · $${fmtUsd(listing.price)}` : ''}
          </span>
        </div>
      </div>
      <p className="buy-note">
        Pay from any chain, Bitcoin, Zcash and XRP included, with one deposit. This is the asset NEAR Intents lists,
        not an address from the post.
        {post && (
          <>
            {' '}
            <a href={post} target="_blank" rel="noreferrer">
              View the post
            </a>
          </>
        )}
      </p>
      {warnings.length > 0 && (
        <div className="buy-problem" role="alert">
          The post you came from was flagged:
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          The swap below buys the {listing?.symbol ?? symbol} NEAR Intents lists, not anything the post links to.
        </div>
      )}
      <div id="swap-root">
        {listing && feesReady ? (
          <SwapSlot
            onConnect={onConnect}
            target={{ symbol: listing.symbol, blockchain: listing.blockchain as Chains }}
            fees={postFees(creator)}
          />
        ) : (
          <div className="swap-loading" aria-busy="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </main>
  );
}
