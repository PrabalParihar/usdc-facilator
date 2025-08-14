# USDC Facilitator Frontend

A React application that interacts with the USDCFacilitator smart contract to enable gasless USDC transfers using EIP-712 permit signatures.

## Features

- **Gasless Transfers**: Users can transfer USDC without paying gas fees by signing a permit off-chain
- **MetaMask Integration**: Fully compatible with MetaMask and other Web3 wallets via RainbowKit
- **EIP-712 Permit Signing**: Implements USDC's specific EIP-712 domain values for permit signatures
- **Real-time Balance Updates**: Displays current USDC balance and updates after transactions
- **Fee Management**: Supports configurable fee amounts that go to a designated fee collector
- **Error Handling**: Comprehensive error handling for expired permits, insufficient balance, and invalid addresses
- **Transaction Status**: Real-time transaction status updates throughout the process

## Prerequisites

- Node.js v16 or higher
- npm or yarn
- MetaMask or another Web3 wallet
- Access to Ethereum mainnet or testnet

## Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:

```env
REACT_APP_USDC_ADDRESS=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
REACT_APP_FACILITATOR_ADDRESS=<YOUR_DEPLOYED_CONTRACT_ADDRESS>
REACT_APP_FEE_COLLECTOR_ADDRESS=<FEE_COLLECTOR_ADDRESS>
REACT_APP_CHAIN_ID=1
REACT_APP_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<YOUR_API_KEY>
REACT_APP_WALLET_CONNECT_PROJECT_ID=<YOUR_WALLETCONNECT_PROJECT_ID>
```

## Running the Application

Start the development server:

```bash
npm start
```

The application will open at [http://localhost:3000](http://localhost:3000)

## Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

## Project Structure

```
src/
├── components/
│   └── FacilitateTransfer.jsx    # Main transfer component
├── utils/
│   └── permitUtils.js            # EIP-712 permit utilities
├── config.js                     # Contract addresses and ABIs
├── wagmiConfig.js                # Wagmi and wallet configuration
├── App.js                        # Main app component
├── App.css                       # Application styles
└── index.js                      # Application entry point
```

## Key Components

### FacilitateTransfer.jsx
The main component that:
- Manages form state for transfer parameters
- Fetches user balance and contract information
- Handles permit signature creation
- Executes the transfer transaction

### permitUtils.js
Utility functions for:
- Creating EIP-712 permit messages with USDC-specific domain values
- Splitting signatures into v, r, s components
- Formatting USDC amounts (6 decimals)
- Validating addresses and amounts

### config.js
Central configuration file containing:
- Contract addresses (USDC, Facilitator, Fee Collector)
- Contract ABIs
- Chain configuration
- Helper functions

## How It Works

1. **Connect Wallet**: User connects their MetaMask wallet
2. **Enter Transfer Details**: 
   - Recipient address
   - Total transfer amount (including fees)
   - Fee amount for the facilitator
   - Permit deadline (in minutes)
3. **Sign Permit**: User signs an EIP-712 permit message off-chain
4. **Execute Transfer**: The facilitator contract executes the transfer using the permit signature
5. **Transaction Confirmation**: User receives confirmation once the transaction is mined

## USDC Permit Specifics

This implementation handles USDC's non-standard EIP-712 domain values:
- `name`: "USD Coin"
- `version`: "2"
- `chainId`: Network chain ID
- `verifyingContract`: USDC contract address

## Security Considerations

- Permits are single-use to prevent replay attacks
- Deadline validation prevents expired permits
- Balance checks ensure sufficient funds
- Input validation for all addresses and amounts
- Fee must be less than the total transfer amount

## Troubleshooting

### Common Issues

1. **"Invalid permit signature"**: Ensure the correct chain ID and USDC address are configured
2. **"Insufficient balance"**: User doesn't have enough USDC
3. **"Permit expired"**: The deadline has passed, try with a longer deadline
4. **"Permit already used"**: This signature has been used before

## License

MIT