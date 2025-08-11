import { PROGRAM_ID, RPC_URL } from './config';
import { SHA256 } from 'crypto-js';
import Hex from 'crypto-js/enc-hex';
import type { PublicKey } from '@solana/web3.js';

// Immediate env check - should appear in console on module load
console.log('[anchorClient] Module loaded - PROGRAM_ID:', PROGRAM_ID);

// Lazy Anchor import to avoid hard dependency at build time
async function loadAnchor() {
  try {
    const anchor = await import('@coral-xyz/anchor');
    const web3 = await import('@solana/web3.js');
    return { anchor, web3 };
  } catch (e) {
    throw new Error('Anchor not installed. Run: npm i @coral-xyz/anchor @solana/web3.js');
  }
}

export async function getProgram(walletCtx: any) {
  const { anchor, web3 } = await loadAnchor();
  const connection = new web3.Connection(RPC_URL, 'confirmed');

  if (!walletCtx || !walletCtx.publicKey || !walletCtx.signTransaction) {
    throw new Error('Wallet not ready: missing publicKey/signTransaction');
  }

  console.debug('[anchorClient] getProgram: building anchorWallet');
  const anchorWallet: any = {
    publicKey: new web3.PublicKey(walletCtx.publicKey),
    signTransaction: walletCtx.signTransaction,
  };
  if (walletCtx.signAllTransactions) {
    anchorWallet.signAllTransactions = walletCtx.signAllTransactions;
  }

  console.debug('[anchorClient] getProgram: creating provider with RPC', RPC_URL);
  const provider = new anchor.AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });
  // Set provider for any anchor internals relying on getProvider
  anchor.setProvider(provider);

  console.debug('[anchorClient] getProgram: fetching IDL');
  const idlRes = await fetch('/idl/solbombs.json');
  if (!idlRes.ok) {
    throw new Error(`Failed to load IDL: HTTP ${idlRes.status}`);
  }
  const idl = await idlRes.json();
  console.debug('[anchorClient] getProgram: IDL loaded');
  console.debug('[anchorClient] getProgram: env PROGRAM_ID =', PROGRAM_ID);
  console.debug('[anchorClient] getProgram: idl.metadata?.address =', (idl as any)?.metadata?.address);
  // Anchor Program() may read idl.metadata.address; ensure it exists and matches PROGRAM_ID
  const idlAny: any = idl as any;
  if (!idlAny.metadata) idlAny.metadata = {};
  if (!idlAny.metadata.address || idlAny.metadata.address !== PROGRAM_ID) {
    idlAny.metadata.address = PROGRAM_ID;
    console.debug('[anchorClient] getProgram: patched idl.metadata.address ->', idlAny.metadata.address);
  }
  let programId: any;
  try {
    programId = new web3.PublicKey(PROGRAM_ID);
  } catch (e: any) {
    const msg = e?.message || String(e);
    throw new Error(`Invalid PROGRAM_ID '${PROGRAM_ID}': ${msg}. Did you restart the dev server after editing .env?`);
  }
  console.debug('[anchorClient] getProgram: constructing Program for', programId.toBase58());
  let program: any;
  try {
    // Use the programId we validated earlier
    program = new anchor.Program(idlAny, programId, provider);
  } catch (e: any) {
    console.error('[anchorClient] getProgram: Program constructor failed', e);
    throw new Error(`Cannot create Program: ${e.message}. Anchor version mismatch?`);
  }
  return { anchor, web3, provider, program };
}

export async function startSoloOnchain(params: {
  wallet: any;
  player: PublicKey;
  betLamports: number;
  nonce: number;
}) {
  const { anchor, web3, program } = await getProgram(params.wallet);
  const gameNonce = params.nonce & 0xff; // ensure u8
  const playerPk = new web3.PublicKey(params.player);

  const [gamePda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('solo'), playerPk.toBuffer(), Buffer.from([gameNonce])],
    program.programId
  );

  try {
    const signature = await program.methods
      .startSolo(gameNonce, new anchor.BN(params.betLamports))
      .accounts({
        payer: playerPk,
        game: gamePda,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log('startSolo transaction confirmed:', signature);
    return { gamePda, signature };

  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error('startSoloOnchain error:', msg, e);
    throw new Error(`startSolo failed: ${msg}`);
  }
}

export async function revealAndResolveSoloOnchain(params: {
  wallet: any;
  player: PublicKey;
  gamePda: PublicKey;
  win: boolean;
}) {
  const { web3, program } = await getProgram(params.wallet);
  const playerPk = new web3.PublicKey(params.player);
  const gamePda = new web3.PublicKey(params.gamePda);

  try {
    const signature = await program.methods
      .revealAndResolveSolo(params.win)
      .accounts({
        payer: playerPk,
        game: gamePda,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    console.log('revealAndResolveSolo transaction confirmed:', signature);
    return { signature };

  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error('revealAndResolveSoloOnchain error:', msg, e);
    throw new Error(`revealAndResolveSolo failed: ${msg}`);
  }
}

export function isOnchainConfigured() {
  return !!PROGRAM_ID && PROGRAM_ID !== 'YourProgramPubkeyHere111111111111111111111111111' && PROGRAM_ID.length >= 32;
}
