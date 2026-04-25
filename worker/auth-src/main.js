import { createAppKit } from '@reown/appkit'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import { solana, solanaDevnet } from '@reown/appkit/networks'

// Configuration
const DEFAULT_PROJECT_ID = '05424f6cd27ac7b724d370c8bc452763'
const REDIRECT_DELAY_MS = 800
const SUCCESS_COLOR = '#8bf542'

// Extract URL parameters
const params = new URLSearchParams(window.location.search)
const projectId = params.get('projectId') ?? DEFAULT_PROJECT_ID
const callbackUrl = params.get('callback') ?? ''

// Utility: Format wallet address for display
function formatAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

// Utility: Update status UI
function updateStatus(message, color = '#fff') {
  const statusEl = document.getElementById('status')
  if (statusEl) {
    statusEl.textContent = message
    statusEl.style.color = color
  }
}

// Utility: Redirect to callback with wallet address
function sendWalletCallback(address) {
  if (!callbackUrl) return

  const url = `${callbackUrl}/callback?address=${encodeURIComponent(address)}`

  // Use navigation instead of fetch — ad blockers can't block window.location
  setTimeout(() => {
    window.location.href = url
  }, REDIRECT_DELAY_MS)
}

// Handle account connection
function handleAccountChange(account) {
  if (!account?.address) return

  const address = account.address
  updateStatus(`✓ Connected: ${formatAddress(address)}`, SUCCESS_COLOR)
  sendWalletCallback(address)
}

// Initialize Reown AppKit
function initializeWallet() {
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
  })

  modal.subscribeAccount(handleAccountChange)

  // Auto-open modal after AppKit finishes mounting custom elements
  requestAnimationFrame(() => modal.open())
}

// Bootstrap
initializeWallet()
