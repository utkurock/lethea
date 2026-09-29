import { CHAINS, Widget, WidgetConfigProvider, type Chains, type WidgetConfig } from '@aurora-is-near/intents-swap-widget';
import i18n from 'i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEPOSIT_CHAINS } from '../intents/useIntentsConfig';
import { WIDGET_THEME } from '../lib/theme';
import { useEvmWallet } from '../wallets/evm';
import { useNearWallet } from '../wallets/near';
import { useSolanaWallet } from '../wallets/solana';
import { useStellarWallet } from '../wallets/stellar';

type Pick = { symbol: string; blockchain: Chains };
type Props = { config: Partial<WidgetConfig>; target?: Pick };

/**
 * The swap widget, with "send from an external wallet" offered only where it makes sense.
 *
 * The widget forces that mode on whenever the source chain has no connected wallet, which put
 * recipient and refund fields in front of every visitor before they had done anything. Here it
 * is on for chains no wallet can sign on (Bitcoin and co.), available but off once a wallet for
 * the source chain is connected, and otherwise one click away for people who prefer it.
 */
export function SwapBox({ config, target }: Props) {
  const evm = useEvmWallet();
  const xlm = useStellarWallet();
  const sol = useSolanaWallet();
  const near = useNearWallet();

  const [source, setSource] = useState<Pick>(config.defaultSourceToken as Pick);
  const [dest, setDest] = useState<Pick | undefined>(target ?? (config.defaultTargetToken as Pick | undefined));
  const [optIn, setOptIn] = useState(false);
  const [otherRecipient, setOtherRecipient] = useState(false);

  const chain = source.blockchain;
  const depositOnly = DEPOSIT_CHAINS.includes(chain);
  const hasWallet =
    chain === 'stellar' ? !!xlm.address : chain === 'sol' ? !!sol.address : chain === 'near' ? !!near.address : !!evm.address;
  const allow = depositOnly || hasWallet || optIn;

  // A wallet already connected on the payout chain is the recipient, so the address field only
  // appears when the user asks to send somewhere else.
  const destId = dest?.blockchain;
  const myDest =
    !destId || DEPOSIT_CHAINS.includes(destId)
      ? undefined
      : destId === 'stellar' ? xlm.address : destId === 'sol' ? sol.address : destId === 'near' ? near.address : evm.address;
  const autoRecipient = myDest && !otherRecipient ? myDest : undefined;

  // The widget keeps its external-deposit flag after the option is withdrawn, which would leave the
  // address fields on screen. Remounting it on the pair the user already picked clears that.
  const [mount, setMount] = useState({ n: 0, source, dest });
  const wasAllowed = useRef(allow);
  useEffect(() => {
    if (wasAllowed.current && !allow) setMount((m) => ({ n: m.n + 1, source, dest }));
    wasAllowed.current = allow;
    // Only the transition matters; the pair is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allow]);

  // Name the payout chain in the recipient field, the way the widget already names the refund chain.
  // Its `localisation` prop never overwrites a key once set, so write to the shared i18next instance
  // directly and re-emit the language to make the widget re-render.
  const destChain = dest ? CHAINS.find((c) => c.id === dest.blockchain)?.label : undefined;
  useEffect(() => {
    i18n.addResourceBundle(
      'en',
      'translation',
      {
        'sendAddress.label': destChain ? `Receive on ${destChain}` : 'Receive in',
        'wallet.recipient.placeholder': destChain ? `Enter ${destChain} address` : 'Enter recipient wallet address',
        'submit.disabled.enterRecipientAddress': destChain ? `Enter ${destChain} address` : 'Enter recipient address',
      },
      true,
      true,
    );
    void i18n.changeLanguage('en');
  }, [destChain]);

  const widgetConfig = useMemo(
    () => ({
      ...config,
      allowSwapWithExternalWallet: allow,
      sendAddress: autoRecipient ?? null,
      hideSendAddress: !!autoRecipient,
      defaultSourceToken: mount.source,
      ...(mount.dest ? { defaultTargetToken: mount.dest } : {}),
    }),
    [config, allow, mount, autoRecipient],
  );

  return (
    <>
      <WidgetConfigProvider key={mount.n} config={widgetConfig} theme={WIDGET_THEME}>
        <Widget
          defaultMode="swap"
          onMsg={(msg) => {
            if (msg.type !== 'on_select_token') return;
            const pick = { symbol: msg.token.symbol, blockchain: msg.token.blockchain as Chains };
            if (msg.variant === 'source') setSource(pick);
            else setDest(pick);
          }}
        />
      </WidgetConfigProvider>
      {myDest && (
        <p className="recipient-note">
          {autoRecipient ? (
            <>
              Receiving on {destChain} at <b>{short(myDest)}</b>, your connected wallet.{' '}
              <button onClick={() => setOtherRecipient(true)}>Use another address</button>
            </>
          ) : (
            <button onClick={() => setOtherRecipient(false)}>Receive in my {destChain} wallet instead</button>
          )}
        </p>
      )}
      {!depositOnly && !hasWallet && (
        <button className="external-switch" onClick={() => setOptIn((v) => !v)}>
          {optIn ? 'Connect a wallet instead' : 'No wallet here? Pay to a deposit address instead'}
        </button>
      )}
    </>
  );
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
