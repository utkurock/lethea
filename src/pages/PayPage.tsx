import type { Chains } from '@aurora-is-near/intents-swap-widget';
import { CHAINS_LIST } from '@aurora-is-near/intents-swap-widget/constants';
import { normalize } from 'viem/ens';
import { useEnsAddress } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { SwapSlot } from '../components/SwapSlot';
import { isNearName, useNearAccount } from '../lib/near';
import { EVM_CHAINS, useEvmPayee, useSolanaPayee } from '../lib/payee';
import { linkTo } from '../lib/router';

type Props = { handle: string; onConnect: () => void };
type Pick = { symbol: string; blockchain: Chains };

/** Where an address can be paid, and the token a payment lands as by default. */
type Payee = { name: string; kind: 'near' | 'ens' | 'evm' | 'sol' | 'stellar' | 'btc'; chains: Chains[]; asset: Pick };

// Anyone can write a /pay link, so the address is checked here and not taken from the extension on trust.
function parsePayee(to: string): Payee | undefined {
  if (isNearName(to))
    return { name: to, kind: 'near', chains: ['near'], asset: { symbol: 'USDC', blockchain: 'near' } };
  if (/^([a-z\d-]+\.)+eth$/i.test(to)) return { name: to.toLowerCase(), kind: 'ens', chains: EVM_CHAINS, asset: { symbol: 'USDC', blockchain: 'base' } };
  if (/^0x[a-fA-F\d]{40}$/.test(to)) return { name: to, kind: 'evm', chains: EVM_CHAINS, asset: { symbol: 'USDC', blockchain: 'base' } };
  if (/^G[A-Z2-7]{55}$/.test(to)) return { name: to, kind: 'stellar', chains: ['stellar'], asset: { symbol: 'XLM', blockchain: 'stellar' } };
  if (/^bc1[ac-hj-np-z02-9]{25,59}$/.test(to)) return { name: to, kind: 'btc', chains: ['btc'], asset: { symbol: 'BTC', blockchain: 'btc' } };
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to)) return { name: to, kind: 'sol', chains: ['sol'], asset: { symbol: 'USDC', blockchain: 'sol' } };
  return undefined;
}

// ENS normalisation rejects some names the pattern lets through, such as a hyphen in the third and fourth place.
const ensName = (name: string) => {
  try {
    return normalize(name);
  } catch {
    return undefined;
  }
};

/**
 * `/pay/:handle?to=…`, what the Lethea extension opens from an X profile that lists a wallet in its name,
 * bio or website. The payer picks any token on any chain; the payee receives on the chain of their address.
 */
export function PayPage({ handle, onConnect }: Props) {
  const to = new URLSearchParams(window.location.search).get('to') ?? '';
  const validHandle = /^\w{1,15}$/.test(handle);
  const payee = validHandle ? parsePayee(to) : undefined;

  const ensNormal = payee?.kind === 'ens' ? ensName(payee.name) : undefined;
  const ens = useEnsAddress({ name: ensNormal, chainId: mainnet.id, query: { enabled: !!ensNormal } });
  const near = useNearAccount(payee?.kind === 'near' ? payee.name : undefined);
  const evmAddress = payee?.kind === 'ens' ? (ens.data ?? undefined) : payee?.kind === 'evm' ? payee.name : undefined;
  const evm = useEvmPayee(evmAddress);
  const sol = useSolanaPayee(payee?.kind === 'sol' ? payee.name : undefined);

  if (!payee) {
    return (
      <main className="buy-page">
        <h1>This pay link is not valid</h1>
        <p className="buy-note">
          It needs an X handle and a NEAR, ENS, EVM, Solana, Stellar or Bitcoin address.{' '}
          <a href="/" onClick={linkTo('/')}>
            Open the swap
          </a>
        </p>
      </main>
    );
  }

  // The address once it has been checked: it exists (NEAR), resolves (ENS), and is not a token contract.
  const checked =
    payee.kind === 'near'
      ? near === 'ok'
      : payee.kind === 'ens' || payee.kind === 'evm'
        ? !!evmAddress && evm?.state === 'ok'
        : payee.kind === 'sol'
          ? sol === 'ok'
          : true;
  const address = checked ? (evmAddress ?? payee.name) : undefined;
  // A contract wallet can only be paid on the chains it is deployed on.
  const chains = evm?.state === 'ok' ? payee.chains.filter((c) => evm.chains.includes(c)) : payee.chains;
  const asset = chains.includes(payee.asset.blockchain) ? payee.asset : { ...payee.asset, blockchain: chains[0] };
  const problem =
    payee.kind === 'ens' && (!ensNormal || ens.isError || (ens.isSuccess && !ens.data))
      ? `${payee.name} does not point to an address.`
      : payee.kind === 'near' && near === 'missing'
        ? `${payee.name} does not exist on NEAR.`
        : evm?.state === 'token' || sol === 'token'
          ? 'This address is a token contract, not a wallet. A payment sent to it cannot be recovered.'
          : near === 'error' || evm?.state === 'error' || sol === 'error' || (evm?.state === 'ok' && !chains.length)
            ? 'Could not check this address. Try again in a moment.'
            : undefined;
  const chainLabel = chains.length > 1 ? 'any EVM chain' : CHAINS_LIST[chains[0]]?.label;
  const profile = `https://x.com/${handle}`;

  return (
    <main className="buy-page">
      <div className="token-head">
        <span className="mono">@</span>
        <div>
          <h1>Pay @{handle}</h1>
          <span>Receives on {chainLabel}</span>
        </div>
      </div>

      <dl className="payee">
        <dt>Recipient</dt>
        <dd>
          <code>{payee.name}</code>
          {payee.kind === 'ens' && <code>{ens.data ?? (problem ? '' : 'Resolving…')}</code>}
        </dd>
      </dl>

      <p className="buy-note">
        Anyone can make a pay link, so Lethea cannot tell who sent you this one. Open{' '}
        <a href={profile} target="_blank" rel="noreferrer">
          @{handle}'s profile
        </a>{' '}
        and check that it lists this address before you send. Pay with any token from any chain, and turn on
        Confidential to keep the route between the two chains private.
      </p>

      {problem ? (
        <p className="buy-problem" role="alert">
          {problem}
        </p>
      ) : (
        <div id="swap-root">
          {address ? (
            <SwapSlot onConnect={onConnect} target={asset} recipient={{ address, chains }} />
          ) : (
            <div className="swap-loading" aria-busy="true">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
