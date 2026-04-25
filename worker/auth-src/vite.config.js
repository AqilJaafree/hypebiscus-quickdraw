import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    dedupe: [
      '@reown/appkit',
      '@reown/appkit-adapter-solana',
      '@solana/web3.js',
      '@solana/wallet-adapter-base',
    ],
  },
  build: {
    target: 'es2020',
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@reown/appkit-adapter-solana')) return 'appkit-solana'
          if (id.includes('@reown/appkit')) return 'appkit'
        },
      },
    },
  },
})
