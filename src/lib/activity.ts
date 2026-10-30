import { useEffect, useState } from 'react';
import { useIntentsTokens, type IntentsToken } from './tokens';

/**
 * Token transfers of the connected wallets, read from the chains themselves.
 *
 * The widget's history comes from the NEAR Intents indexer, which leaves confidential swaps out by
 * design. On chain such a swap is still two ordinary transfers: the deposit leaving the wallet and
 * the payout arriving. Only tokens NEAR Intents lists are kept, which also drops airdropped spam,
 * and so are amounts worth less than a cent, which drops dust payments.
 */
export type Activity = {
  id: string;
  chainLabel: string;
  dir: 'in' | 'out';
  symbol: string;
  amount: number;
  usd?: number;
  counterparty: string;
  time: number;
  link: string;
};

const MIN_USD = 0.01;
const LIMIT = 25;

const HORIZON = 'https://horizon.stellar.org';

type HorizonAsset = { asset_type: string; asset_code?: string; asset_issuer?: string };
type HorizonOp = HorizonAsset & {
  id: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful: boolean;
  from?: string;
  to?: string;
  amount?: string;
  // create_account
  funder?: string;
  account?: string;
  starting_balance?: string;
  // Soroban token transfers, including those of the bridge contract.
  asset_balance_changes?: (HorizonAsset & { type: string; from?: string; to?: string; amount: string })[];
};

async function stellarActivity(address: string, tokens: IntentsToken[]): Promise<Activity[]> {
  const res = await fetch(`${HORIZON}/accounts/${address}/payments?order=desc&limit=100`);
  // A wallet that was never funded has no account yet.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Horizon ${res.status}`);
  const ops: HorizonOp[] = (await res.json())._embedded.records;

  // Native XLM is the listing without a contract; issued assets are listed by code and issuer.
  const token = (a: HorizonAsset) =>
    tokens.find(
      (t) =>
        t.blockchain === 'stellar' &&
        (a.asset_type === 'native'
          ? !t.contractAddress
          : t.symbol === a.asset_code && t.contractAddress === a.asset_issuer),
    );

  const rows: Activity[] = [];
  const add = (op: HorizonOp, i: number, asset: HorizonAsset, from: string, to: string, amount: string) => {
    const t = token(asset);
    if (!t || (from !== address && to !== address)) return;
    const dir = to === address ? 'in' : 'out';
    rows.push({
      id: `xlm:${op.id}:${i}`,
      chainLabel: 'Stellar',
      dir,
      symbol: t.symbol,
      amount: Number(amount),
      usd: Number(amount) * t.price,
      counterparty: dir === 'in' ? from : to,
      time: Date.parse(op.created_at),
      link: `https://stellar.expert/explorer/public/tx/${op.transaction_hash}`,
    });
  };

  for (const op of ops) {
    if (!op.transaction_successful) continue;
    if (op.type === 'create_account') add(op, 0, { asset_type: 'native' }, op.funder!, op.account!, op.starting_balance!);
    else if (op.type === 'invoke_host_function')
      op.asset_balance_changes?.forEach((c, i) => c.type === 'transfer' && add(op, i, c, c.from ?? '', c.to ?? '', c.amount));
    else if (op.from && op.to && op.amount) add(op, 0, op, op.from, op.to, op.amount);
  }
  return rows;
}

// EVM transfers come from Alchemy, which needs VITE_ALCHEMY_API_KEY; without it only Stellar shows.
const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined;
const EVM_NETWORKS = [
  { chain: 'eth', label: 'Ethereum', net: 'eth-mainnet', explorer: 'https://etherscan.io', internal: true },
  { chain: 'base', label: 'Base', net: 'base-mainnet', explorer: 'https://basescan.org', internal: false },
  { chain: 'arb', label: 'Arbitrum', net: 'arb-mainnet', explorer: 'https://arbiscan.io', internal: false },
  { chain: 'op', label: 'Optimism', net: 'opt-mainnet', explorer: 'https://optimistic.etherscan.io', internal: false },
  { chain: 'pol', label: 'Polygon', net: 'polygon-mainnet', explorer: 'https://polygonscan.com', internal: true },
];

type AlchemyTransfer = {
  uniqueId: string;
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  category: string;
  rawContract: { address: string | null };
  metadata: { blockTimestamp: string };
};

async function evmActivity(address: string, tokens: IntentsToken[]): Promise<Activity[]> {
  if (!ALCHEMY_KEY) return [];
  const me = address.toLowerCase();

  const perNetwork = await Promise.all(
    EVM_NETWORKS.map(async (n) => {
      const transfers = (side: 'fromAddress' | 'toAddress') =>
        fetch(`https://${n.net}.g.alchemy.com/v2/${ALCHEMY_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getAssetTransfers',
            params: [
              {
                [side]: address,
                category: n.internal ? ['external', 'internal', 'erc20'] : ['external', 'erc20'],
                order: 'desc',
                withMetadata: true,
                excludeZeroValue: true,
                maxCount: '0x' + LIMIT.toString(16),
              },
            ],
          }),
        })
          .then((r) => r.json())
          .then((d): AlchemyTransfer[] => d.result?.transfers ?? []);

      const [sent, received] = await Promise.all([transfers('fromAddress'), transfers('toAddress')]);
      return [...sent, ...received].flatMap((x): Activity[] => {
        const contract = x.rawContract.address?.toLowerCase();
        const t = tokens.find(
          (t) => t.blockchain === n.chain && (contract ? t.contractAddress?.toLowerCase() === contract : !t.contractAddress),
        );
        if (!t || x.value == null) return [];
        const dir = x.to?.toLowerCase() === me ? 'in' : 'out';
        return [
          {
            id: `${n.chain}:${x.uniqueId}`,
            chainLabel: n.label,
            dir,
            symbol: t.symbol,
            amount: x.value,
            usd: x.value * t.price,
            counterparty: (dir === 'in' ? x.from : x.to) ?? '',
            time: Date.parse(x.metadata.blockTimestamp),
            link: `${n.explorer}/tx/${x.hash}`,
          },
        ];
      });
    }),
  );
  return perNetwork.flat();
}

type State = { key: string; rows: Activity[]; error?: boolean };

export function useWalletActivity(wallets: { stellar?: string; evm?: string }, enabled: boolean) {
  const tokens = useIntentsTokens();
  const [state, setState] = useState<State>({ key: '', rows: [] });
  const [reload, setReload] = useState(0);
  const key = `${wallets.stellar}:${wallets.evm}:${reload}`;
  const ready = tokens.length > 0;
  const active = enabled && !!(wallets.stellar || wallets.evm);

  useEffect(() => {
    if (!active || !ready) return;
    let alive = true;
    Promise.all([
      wallets.stellar ? stellarActivity(wallets.stellar, tokens) : [],
      wallets.evm ? evmActivity(wallets.evm, tokens) : [],
    ])
      .then((lists) => {
        const rows = lists
          .flat()
          .filter((r) => r.usd === undefined || r.usd >= MIN_USD)
          .sort((a, b) => b.time - a.time)
          .slice(0, LIMIT);
        if (alive) setState({ key, rows });
      })
      .catch(() => alive && setState({ key, rows: [], error: true }));
    return () => {
      alive = false;
    };
    // The token list refreshes every minute for prices; that alone shouldn't refetch the history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready, key]);

  const done = state.key === key;
  return {
    rows: done ? state.rows : [],
    loading: active && !done,
    error: done && !!state.error,
    evmCovered: !!ALCHEMY_KEY,
    refresh: () => setReload((n) => n + 1),
  };
}
