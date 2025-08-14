import { createConfig, http } from 'wagmi';
import {  baseSepolia } from 'wagmi/chains';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  walletConnectWallet,
  rainbowWallet,
  coinbaseWallet
} from '@rainbow-me/rainbowkit/wallets';
import { CONFIG } from './config';

const projectId = CONFIG.WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        metaMaskWallet,
        rainbowWallet,
        coinbaseWallet,
        walletConnectWallet
      ]
    }
  ],
  {
    appName: 'USDC Facilitator',
    projectId
  }
);

const chainConfig = () => {
  switch (CONFIG.CHAIN_ID) {
  
    case 84532:
      return baseSepolia;
    default:
      return baseSepolia;
  }
};

export const wagmiConfig = createConfig({
  connectors,
  chains: [chainConfig()],
  transports: {
    [baseSepolia.id]: http(CONFIG.RPC_URL)
  }
});