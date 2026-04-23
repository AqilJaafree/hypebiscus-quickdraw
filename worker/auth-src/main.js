import { createAppKit } from '@reown/appkit'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import { solana, solanaDevnet } from '@reown/appkit/networks'

// Read projectId and callback from URL query params
const params = new URLSearchParams(window.location.search)
const projectId = params.get('projectId') || ''
const callbackUrl = params.get('callback') || ''

if (!projectId) {
  document.getElementById('status').textContent = 'Missing projectId param.'
} else {
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

  modal.subscribeAccount(account => {
    if (!account?.address) return
    const addr = account.address
    const status = document.getElementById('status')
    status.textContent = '✓ Connected: ' + addr.slice(0, 6) + '…' + addr.slice(-4)
    status.style.color = '#8bf542'
    if (callbackUrl) {
      fetch(callbackUrl + '/callback?address=' + encodeURIComponent(addr)).catch(() => {})
      setTimeout(() => window.close(), 1500)
    }
  })

  modal.open()
}
