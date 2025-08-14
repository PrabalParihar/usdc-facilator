# USDC Facilitator Backend

Backend API server that executes USDC permit transfers using an admin private key.

## Architecture

The system works as follows:
1. **Frontend**: User signs a permit message off-chain (no gas fees)
2. **Backend**: Receives the signed permit and executes the transaction using admin wallet
3. **Smart Contract**: Validates the permit and executes the transfer

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
PORT=3001
RPC_URL=https://base-sepolia-rpc.publicnode.com
CHAIN_ID=84532
USDC_ADDRESS=0xf5497Ce765848b05Bc2b37c8F04979270767555d
FACILITATOR_ADDRESS=0xEF6096a90b3F9078BEAF60Bf20a635d85AD000b8
ADMIN_PRIVATE_KEY=your_private_key_here
```

**IMPORTANT**: 
- Keep `ADMIN_PRIVATE_KEY` secret and never commit it to version control
- The admin wallet needs ETH for gas fees
- The admin wallet should be authorized to call the facilitator contract

### 3. Run the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### POST /api/execute-permit-transfer

Executes a USDC transfer using a signed permit.

**Request Body:**
```json
{
  "owner": "0x...",
  "to": "0x...",
  "value": "1000000000000000000",
  "deadline": 1234567890,
  "v": 27,
  "r": "0x...",
  "s": "0x...",
  "feeAmount": "1000000000000000",
  "nonce": "0",
  "chainId": 84532,
  "facilitatorAddress": "0x...",
  "tokenAddress": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0x...",
  "blockNumber": 12345,
  "gasUsed": "100000"
}
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "adminAddress": "0x...",
  "facilitatorAddress": "0x...",
  "chainId": "84532"
}
```

### GET /api/transaction/:txHash

Get transaction status.

**Response:**
```json
{
  "success": true,
  "status": "confirmed",
  "blockNumber": 12345,
  "gasUsed": "100000"
}
```

## Security Considerations

1. **Private Key Security**:
   - Store `ADMIN_PRIVATE_KEY` in environment variables
   - Use a secrets manager in production (AWS Secrets Manager, HashiCorp Vault, etc.)
   - Never expose the private key in logs or responses

2. **Input Validation**:
   - Validates all permit parameters
   - Checks deadline hasn't expired
   - Verifies correct chain ID and contract addresses

3. **Rate Limiting**:
   - Consider adding rate limiting in production
   - Implement request authentication if needed

4. **Gas Management**:
   - Estimates gas before execution
   - Adds 20% buffer to gas estimates
   - Admin wallet needs sufficient ETH

5. **Error Handling**:
   - Specific error messages for common failures
   - Doesn't expose sensitive information in errors

## Production Deployment

For production deployment:

1. Use HTTPS with SSL certificates
2. Implement proper logging (Winston, Morgan)
3. Add monitoring and alerting
4. Use PM2 or similar process manager
5. Implement request authentication
6. Add rate limiting
7. Use a secure key management system
8. Set up proper CORS configuration
9. Implement request/response validation middleware
10. Add database for transaction history

## Testing

Test the API using curl:

```bash
# Health check
curl http://localhost:3001/api/health

# Execute permit transfer (example)
curl -X POST http://localhost:3001/api/execute-permit-transfer \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "0x...",
    "to": "0x...",
    "value": "1000000",
    "deadline": 1999999999,
    "v": 27,
    "r": "0x...",
    "s": "0x...",
    "feeAmount": "10000",
    "nonce": "0",
    "chainId": 84532,
    "facilitatorAddress": "0xEF6096a90b3F9078BEAF60Bf20a635d85AD000b8",
    "tokenAddress": "0xf5497Ce765848b05Bc2b37c8F04979270767555d"
  }'
```

## Troubleshooting

### Common Issues

1. **"Invalid permit signature"**
   - Check token name and version match
   - Verify nonce is correct
   - Ensure deadline hasn't expired

2. **"Insufficient balance"**
   - User doesn't have enough tokens
   - Admin wallet doesn't have ETH for gas

3. **"Transaction reverted"**
   - Check contract addresses are correct
   - Verify admin wallet is authorized
   - Check gas limit is sufficient

## License

MIT