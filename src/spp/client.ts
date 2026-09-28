// Stellar Private Payments (Nethermind), testnet only and unaudited.
//
// The SDK ships as plain ESM + WASM + workers under public/spp, so it is loaded at
// runtime by URL and never goes through the bundler. Its workers resolve their own
// files relative to those URLs.

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Networks } from '@creit.tech/stellar-wallets-kit/types';

export const NETWORK = Networks.TESTNET;
export const RPC = 'https://soroban-testnet.stellar.org';
const HORIZON = 'https://horizon-testnet.stellar.org';
// Soroban RPC keeps about a week of events; the bootnode backfills older pool history.
const BOOTNODE = 'https://bootnode.dev-nethermind.xyz';
const BASE = '/spp';
const PROGRESS_EVENT = 'stellar-private-payments:tx-progress';

export const STROOPS = 10_000_000n;

export type TxResult = { status: string; hashes: string[]; message?: string };
export type Progress = { flow: string; stage: string; message: string; current?: number; total?: number };

type PrivatePool = {
  balance(): Promise<bigint>;
  deposit(amount: bigint): Promise<TxResult>;
  transfer(recipient: string, amount: bigint): Promise<TxResult>;
  withdraw(amount: bigint, recipient?: string | null): Promise<TxResult>;
};

type Account = {
  userAddress: string;
  privacyKeys(): Promise<unknown>;
  derivePrivacyKeys(): Promise<unknown>;
  isRegistered(): Promise<boolean>;
  registerPublicKeys(): Promise<unknown>;
  pool(opts: { poolContract: string }): Promise<PrivatePool>;
};

type Client = {
  sync(): Promise<void>;
  backgroundSync(): Promise<void>;
  stopBackgroundSync(): void;
  account(opts: { networkPassphrase: string }, signer: unknown): Promise<Account>;
  recipientLookup(address: string): Promise<unknown>;
};

type Sdk = {
  default: (opts: { module_or_path: string }) => Promise<unknown>;
  Storage: { open(opts: { workerUrl: string }): Promise<unknown> };
  Client: { 'new'(opts: Record<string, unknown>): Promise<Client> };
  bootnodeRequired(rpc: string, storage: unknown, opts: { contractConfig: unknown }): Promise<boolean>;
};

type Deployment = { pools: { poolContractId: string; enabled: boolean }[] };

export type Session = { address: string; client: Client; pool: PrivatePool };

let sdk: Promise<{ mod: Sdk; config: Deployment; storage: unknown }> | null = null;

// One WASM init and one storage worker per page; the storage keys its data by address.
const loadSdk = () =>
  (sdk ??= (async () => {
    const mod = (await import(/* @vite-ignore */ `${BASE}/js/index.js`)) as Sdk;
    await mod.default({ module_or_path: `${BASE}/dist/stellar_private_payments_web_bg.wasm` });
    const config = (await fetch(`${BASE}/deployments.json`).then((r) => r.json())) as Deployment;
    const storage = await mod.Storage.open({ workerUrl: `${BASE}/dist/workers/storage-worker.js` });
    return { mod, config, storage };
  })().catch((e) => {
    sdk = null;
    throw e;
  }));

// The SDK signs with the connected wallet through the kit, always on the testnet passphrase.
const signer = (address: string) => ({
  getPublicKey: async () => address,
  signMessage: (message: string) =>
    StellarWalletsKit.signMessage(message, { address, networkPassphrase: NETWORK }),
  signTransaction: (xdr: string) =>
    StellarWalletsKit.signTransaction(xdr, { address, networkPassphrase: NETWORK }),
  signAuthEntry: (xdr: string) =>
    StellarWalletsKit.signAuthEntry(xdr, { address, networkPassphrase: NETWORK }),
});

export async function openSession(address: string, step: (msg: string) => void): Promise<Session> {
  step('Loading the prover');
  const { mod, config, storage } = await loadSdk();
  const pool = config.pools.find((p) => p.enabled);
  if (!pool) throw new Error('No enabled pool in the deployment config.');

  step('Syncing the pool');
  const needsBootnode = await mod.bootnodeRequired(RPC, storage, { contractConfig: config }).catch(() => true);
  const client = await mod.Client.new({
    rpcUrl: RPC,
    storage,
    contractConfig: config,
    circuitsBaseUrl: new URL(`${BASE}/dist/circuits/`, location.origin).href,
    proverWorkerUrl: `${BASE}/dist/workers/prover-worker.js`,
    ...(needsBootnode ? { bootnodeUrl: BOOTNODE } : {}),
  });

  const account = await client.account({ networkPassphrase: NETWORK }, signer(address));
  // Keys come from one wallet signature and are kept in this browser's storage.
  if (!(await account.privacyKeys().catch(() => null))) {
    step('Sign once to derive your private keys');
    await account.derivePrivacyKeys();
  }

  if (!(await account.isRegistered())) {
    step('Registering your public keys on testnet');
    await account.registerPublicKeys();
  }

  const session = { address, client, pool: await account.pool({ poolContract: pool.poolContractId }) };
  step('Catching up on pool history');
  await client.sync();
  void client.backgroundSync();
  return session;
}

export function onProgress(cb: (p: Progress) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<Progress>).detail);
  window.addEventListener(PROGRESS_EVENT, handler);
  return () => window.removeEventListener(PROGRESS_EVENT, handler);
}

// SDK results are WASM objects; copy the fields out before the next call frees them.
export const plain = (r: TxResult): TxResult => ({ status: r.status, hashes: [...r.hashes], message: r.message });

/** Parses "12.5" into stroops without floating point. */
export function toStroops(xlm: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{0,7}))?$/.exec(xlm.trim());
  if (!m) return null;
  const v = BigInt(m[1]) * STROOPS + BigInt((m[2] ?? '').padEnd(7, '0') || '0');
  return v > 0n ? v : null;
}

export function fromStroops(v: bigint): string {
  const whole = v / STROOPS;
  const frac = (v % STROOPS).toString().padStart(7, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export async function testnetBalance(address: string): Promise<string | null> {
  const r = await fetch(`${HORIZON}/accounts/${address}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Horizon ${r.status}`);
  const acc = (await r.json()) as { balances: { asset_type: string; balance: string }[] };
  return acc.balances.find((b) => b.asset_type === 'native')?.balance ?? '0';
}

export async function friendbot(address: string) {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  if (!r.ok) throw new Error(`Friendbot ${r.status}`);
}

export const walletNetwork = () => StellarWalletsKit.getNetwork().then((n) => n.networkPassphrase).catch(() => null);

export const txUrl = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;

export const isAddress = (a: string) => /^G[A-Z2-7]{55}$/.test(a.trim());
