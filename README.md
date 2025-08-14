# USDC Facilitator

A full-stack application that enables gasless token transfers using EIP-712 permit signatures. Users sign permits off-chain, and a backend service executes the transactions.

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

### Frontend Setup

1. Install frontend dependencies:

```bash
npm install
```

2. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:

```env
REACT_APP_USDC_ADDRESS=0xf5497Ce765848b05Bc2b37c8F04979270767555d
REACT_APP_FACILITATOR_ADDRESS=0xEF6096a90b3F9078BEAF60Bf20a635d85AD000b8
REACT_APP_FEE_COLLECTOR_ADDRESS=<FEE_COLLECTOR_ADDRESS>
REACT_APP_CHAIN_ID=84532
REACT_APP_RPC_URL=https://base-sepolia-rpc.publicnode.com
REACT_APP_WALLET_CONNECT_PROJECT_ID=<YOUR_WALLETCONNECT_PROJECT_ID>
REACT_APP_API_URL=http://localhost:3001/api
```

### Backend Setup

1. Navigate to backend directory and install dependencies:

```bash
cd backend
npm install
```

2. Create backend `.env` file:

```bash
cp .env.example .env
```

3. Configure backend environment variables:

```env
PORT=3001
RPC_URL=https://base-sepolia-rpc.publicnode.com
CHAIN_ID=84532
USDC_ADDRESS=0xf5497Ce765848b05Bc2b37c8F04979270767555d
FACILITATOR_ADDRESS=0xEF6096a90b3F9078BEAF60Bf20a635d85AD000b8
ADMIN_PRIVATE_KEY=<YOUR_ADMIN_PRIVATE_KEY>
```

## Running the Application

### Start Backend Server

```bash
cd backend
npm run dev
```

The backend will run on [http://localhost:3001](http://localhost:3001)

### Start Frontend

In a new terminal:

```bash
npm start
```

The frontend will open at [http://localhost:3000](http://localhost:3000)

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

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend  │────▶│   Backend    │────▶│  Smart Contract │
│   (React)   │     │   (Node.js)  │     │  (Facilitator)  │
└─────────────┘     └──────────────┘     └─────────────────┘
      │                     │                      │
      │                     │                      │
   Signs Permit      Executes with          Validates &
   Off-chain         Admin Wallet           Transfers
```

## How It Works

1. **Connect Wallet**: User connects their MetaMask wallet
2. **Enter Transfer Details**: 
   - Recipient address
   - Total transfer amount (including fees)
   - Fee amount for the facilitator
   - Permit deadline (in minutes)
3. **Sign Permit**: User signs an EIP-712 permit message off-chain (no gas)
4. **Backend Execution**: API receives the signed permit and executes the transaction using an admin wallet
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