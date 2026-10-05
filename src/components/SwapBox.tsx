import {
  CHAINS,
  Widget,
  WidgetConfigProvider,
  fireEvent,
  useUnsafeSnapshot,
  type Chains,
} from '@aurora-is-near/intents-swap-widget';
import i18n from 'i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEPOSIT_CHAINS, useIntentsConfig } from '../intents/useIntentsConfig';
import { WIDGET_THEME } from '../lib/theme';
import { useEvmWallet } from '../wallets/evm';
import { useNearWallet } from '../wallets/near';
import { useSolanaWallet } from '../wallets/solana';
import { useStellarWallet } from '../wallets/stellar';

type Pick = { symbol: string; blockchain: Chains };
type Props = { onConnect: () => void; target?: Pick };

/**
 * The swap widget, with "send from an external wallet" offered only where it makes sense.
 *
 * The widget forces that mode on whenever the source chain has no connected wallet, which put
 * recipient and refund fields in front of every visitor before they had done anything. Here it
 * is on for chains no wallet can sign on (Bitcoin and co.), available but off once a wallet for
 * the source chain is connected, and otherwise one click away for people who prefer it.
 */
export default function SwapBox({ onConnect, target: targetProp }: Props) {
  const config = useIntentsConfig(onConnect);
  // Callers pass a fresh object each render; a changing default would keep resetting the widget.
  const target = useMemo(
    () => (targetProp ? { symbol: targetProp.symbol, blockchain: targetProp.blockchain } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetProp?.symbol, targetProp?.blockchain],
  );
  const evm = useEvmWallet();
  const xlm = useStellarWallet();
  const sol = useSolanaWallet();
  const near = useNearWallet();

  // The pair is read from the widget's own store. Its direction arrow swaps the tokens without an
  // on_select_token message, so a copy kept from onMsg went stale and pointed the recipient at the
  // wrong chain (a Stellar address offered as the ETH payout), which sent the widget into a render loop.
  const { ctx } = useUnsafeSnapshot();
  const fallbackDest = target ?? (config.defaultTargetToken as Pick | undefined);
  const source: Pick = ctx.sourceToken
    ? { symbol: ctx.sourceToken.symbol, blockchain: ctx.sourceToken.blockchain }
    : (config.defaultSourceToken as Pick);
  const dest: Pick | undefined = ctx.targetToken
    ? { symbol: ctx.targetToken.symbol, blockchain: ctx.targetToken.blockchain }
    : fallbackDest;
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
  // address fields on screen. Clear it the way the widget does itself. This used to remount the widget
  // instead, and a remount right after the direction arrow sent its tooltip refs into a render loop.
  const wasAllowed = useRef(allow);
  useEffect(() => {
    if (wasAllowed.current && !allow) fireEvent('depositTypeSet', { isExternal: false });
    wasAllowed.current = allow;
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
      ...(target ? { defaultTargetToken: target } : {}),
    }),
    [config, allow, target, autoRecipient],
  );

  return (
    <>
      <WidgetConfigProvider config={widgetConfig} theme={WIDGET_THEME}>
        <Widget defaultMode="swap" />
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
