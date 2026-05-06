import { createAppKit } from '@reown/appkit'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import { solana, solanaDevnet } from '@reown/appkit/networks'
import { VersionedTransaction } from '@solana/web3.js'
import { getWallets } from '@wallet-standard/app'

const DEFAULT_PROJECT_ID = '05424f6cd27ac7b724d370c8bc452763'
const REDIRECT_DELAY_MS  = 800
const SUCCESS_COLOR = '#8bf542'
const ERROR_COLOR   = '#ff4444'

const params      = new URLSearchParams(window.location.search)
const projectId   = params.get('projectId') ?? DEFAULT_PROJECT_ID
const callbackUrl = params.get('callback') ?? ''
const signParam   = params.get('sign')

function updateStatus(message, color = '#fff') {
  const el = document.getElementById('status')
  if (el) { el.textContent = message; el.style.color = color }
}

function formatAddress(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function sendWalletCallback(address) {
  if (!callbackUrl) return
  updateStatus(`✓ Connected: ${formatAddress(address)}`, SUCCESS_COLOR)
  // Navigate (not fetch) — window.location bypasses Chrome's Private Network
  // Access policy which blocks fetch() from HTTPS → http://127.0.0.1
  const url = `${callbackUrl}/callback?address=${encodeURIComponent(address)}`
  setTimeout(() => { window.location.href = url }, REDIRECT_DELAY_MS)
}

function sendSignCallback(signature) {
  if (!callbackUrl) return
  updateStatus(`✓ Signed! Sending to app…`, SUCCESS_COLOR)
  const url = `${callbackUrl}/sign-result?sig=${encodeURIComponent(signature)}`
  setTimeout(() => { window.location.href = url }, REDIRECT_DELAY_MS)
}

async function main() {
  // ── Connect mode: AWAIT wallet-standard disconnects before createAppKit() ────
  // modal.open() is a no-op when AppKit's isConnected=true. Wallet extensions
  // (Solflare, Phantom) fire wallet-standard 'change' events the moment
  // WalletStandardProvider.bindEvents() subscribes, populating AppKit's account
  // state before our code can react. Calling disconnect() fire-and-forget doesn't
  // help — createAppKit() runs before the async disconnect resolves, so the wallet
  // still has accounts when bindEvents() fires.
  //
  // Fix: AWAIT all standard:disconnect calls before createAppKit() runs. This
  // ensures wallet accounts are cleared synchronously before bindEvents() is
  // set up, so no auto-connect event fires during init.
  if (!signParam) {
    const { get } = getWallets()
    await Promise.allSettled(
      get()
        .filter(w => w.features?.['standard:disconnect'])
        .map(w => w.features['standard:disconnect'].disconnect())
    )
    // Clear ALL AppKit session state so nothing auto-restores on this page load.
    //
    // Key that was missing and caused the ghost-wallet bug:
    //   @appkit/solana:connected_connector_id  — read synchronously by L.initialize()
    //   during createAppKit(). If present it sets activeConnectorIds.solana = 'Solflare'
    //   (or whatever the last wallet was), which then leaks into handlePreviousConnectorConnection
    //   when the user clicks a DIFFERENT wallet (e.g. Phantom), and can surface the old
    //   wallet's address via the Account view before the new connection resolves.
    //
    // enableReconnect:false only suppresses syncExistingConnection/syncAdapterConnections.
    // It does NOT prevent L.initialize() from reading the connected_connector_id key,
    // and it does NOT prevent modal.open() from routing to Account view if caipAddress
    // is set in memory (e.g. by a fast AUTH-connector iframe restore race).
    ;[
      // Wallet-standard connector IDs per namespace — the primary missing key
      '@appkit/solana:connected_connector_id',
      '@appkit/eip155:connected_connector_id',
      // Connection records (which wallets were connected + their accounts)
      '@appkit/connections',
      // Disconnected-connector blocklist (cleared so unSyncExistingConnection re-builds it fresh)
      '@appkit/disconnected_connector_ids',
      // Namespace membership list
      '@appkit/connected_namespaces',
      // AUTH connector (email/social) keys — iframe restores from these
      '@appkit-wallet/EMAIL_LOGIN_USED_KEY',
      '@appkit-wallet/EMAIL',
      '@appkit-wallet/LAST_USED_CHAIN_KEY',
      '@appkit-wallet/SOCIAL_USERNAME',
      // Legacy Solana-specific keys from older AppKit versions
      '@appkit/solana_wallet',
      '@appkit/solana_caip_chain',
    ].forEach(k => localStorage.removeItem(k))
  }

  // ── Initialize Reown AppKit ─────────────────────────────────────────────────
  const solanaAdapter = new SolanaAdapter()

  const modal = createAppKit({
    adapters: [solanaAdapter],
    networks: [solana, solanaDevnet],
    projectId,
    metadata: {
      name: 'Quickdraw',
      description: 'Passive Solana DeFi intelligence',
      url: window.location.origin,
      icons: [],
    },
    features: {
      email: true,
      socials: ['google', 'apple', 'discord'],
      emailShowWallets: true,
    },
    enableReconnect: !!signParam,
  })

  // ── Sign mode ───────────────────────────────────────────────────────────────
  if (signParam) {
    updateStatus('Waiting for wallet…')

    let txBytes
    try {
      // URLSearchParams decodes '+' as space; restore it before passing to atob().
      txBytes = Uint8Array.from(atob(signParam.replace(/ /g, '+')), c => c.charCodeAt(0))
    } catch (e) {
      updateStatus('Invalid transaction data.', ERROR_COLOR)
      throw e
    }

    async function doSign(address) {
      updateStatus(`Signing with ${address ? formatAddress(address) : 'wallet'}…`)
      try {
        const tx = VersionedTransaction.deserialize(txBytes)
        let signature = null

        // Primary: AppKit wallet provider — works for AUTH connector (email/social
        // embedded wallet) and wallet-standard wallets connected through AppKit.
        try {
          const walletProvider = modal.getWalletProvider?.() ?? solanaAdapter.walletProvider
          if (walletProvider?.signAndSendTransaction) {
            const result = await walletProvider.signAndSendTransaction(tx)
            signature = result?.signature ?? result ?? null
          }
        } catch (e) {
          console.warn('AppKit provider sign failed:', e.message)
        }

        // Fallback: Phantom desktop extension injected directly into this browser tab.
        // Requires connect() first — signAndSendTransaction throws "wallet not connected"
        // if the dapp hasn't been granted access yet.
        if (!signature && window.solana) {
          if (!window.solana.isConnected) {
            updateStatus('Connecting Phantom…')
            await window.solana.connect()
          }
          const addr = window.solana.publicKey?.toString()
          if (addr) updateStatus(`Signing with ${formatAddress(addr)}…`)
          const result = await window.solana.signAndSendTransaction(tx)
          signature = result?.signature ?? result ?? null
        }

        if (!signature) throw new Error('No wallet provider — reconnect and try again')
        sendSignCallback(String(signature))
      } catch (e) {
        updateStatus(`Signing failed: ${e.message}`, ERROR_COLOR)
      }
    }

    // Fast path: Phantom detected in system browser — skip the AppKit session-restore
    // wait entirely. The connect() + sign happens inside doSign's window.solana block.
    // AppKit cannot restore the webview's session (different localStorage context), so
    // waiting 2s for subscribeAccount is a dead end for Phantom users.
    if (window.solana) {
      doSign('')
    } else {
      const currentAccount = modal.getAddress?.()
      if (currentAccount) {
        doSign(currentAccount)
      } else {
        // AUTH connector restores its iframe session asynchronously.
        // Wait up to 2s for the account to come back before showing the picker.
        updateStatus('Reconnecting wallet…')
        let signed = false
        const unsub = modal.subscribeAccount(account => {
          if (!account?.address || signed) return
          signed = true
          unsub?.()
          doSign(account.address)
        })
        setTimeout(() => {
          if (!signed) {
            updateStatus('Please connect your wallet to sign.')
            requestAnimationFrame(() => modal.open())
          }
        }, 2000)
      }
    }

  // ── Connect mode ────────────────────────────────────────────────────────────
  } else {
    // Magic-link (email/social) uses an AUTH connector iframe that auto-restores
    // its session on load, bypassing enableReconnect:false (which only blocks
    // wallet-standard wallets). We must intercept the auto-reconnect and call
    // modal.disconnect() to properly log out the iframe session, so the user
    // always sees a fresh modal and can pick any wallet.
    let freshOpened = false

    async function openFresh() {
      if (freshOpened) return
      freshOpened = true
      let sent = false
      modal.subscribeAccount(account => {
        if (!account?.address || sent) return
        sent = true
        sendWalletCallback(account.address)
      })
      // Defensively reset any in-memory account state that may have been set by a
      // fast AUTH-connector iframe restore or a wallet-standard 'change' race before
      // unSyncExistingConnection completed. This clears caipAddress and removes the
      // connectorId from memory so modal.open() cannot route to the Account view.
      modal.resetAccount?.('solana')
      // Force the wallet-picker Connect view explicitly. Without { view: 'Connect' },
      // Pv.open() checks caipAddress in memory and routes to Account view if it is set.
      requestAnimationFrame(() => modal.open({ view: 'Connect' }))
    }

    // Intercept any auto-reconnect from a saved magic-link session. Must await
    // openFresh() so the modal doesn't open while modal.disconnect() is still
    // waiting for the AUTH iframe to confirm sign-out server-side.
    const unsub = modal.subscribeAccount(async account => {
      if (!account?.address) return
      unsub?.()
      try {
        await modal.disconnect()
        // Notify Rust to clear its stored wallet_pubkey
        if (callbackUrl) fetch(`${callbackUrl}/disconnect`).catch(() => {})
      } catch (_) {}
      await openFresh()
    })

    // Fallback: if nothing auto-reconnects within 400ms, open fresh directly
    setTimeout(() => openFresh(), 400)
  }
}

main().catch(err => {
  updateStatus('Failed to load. Please refresh.', ERROR_COLOR)
  console.error(err)
})
