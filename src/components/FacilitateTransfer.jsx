import React, { useState, useEffect } from 'react';
import { useAccount, useSignTypedData, usePublicClient, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import {
  createUSDCPermitMessage,
  splitSignature,
  formatUSDCAmount,
  parseUSDCAmount,
  getPermitDeadline,
  validateAddress,
  validateAmount
} from '../utils/permitUtils';
import { CONFIG, USDC_ABI, FACILITATOR_ABI } from '../config';

const FacilitateTransfer = () => {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { signTypedDataAsync } = useSignTypedData();

  const [formData, setFormData] = useState({
    ownerAddress: '',
    recipientAddress: '',
    totalAmount: '',
    feeAmount: '',
    deadline: 30
  });

  const [contractInfo, setContractInfo] = useState({
    feeCollector: '',
    decimals: 18,
    userBalance: '0',
    nonce: '0',
    tokenName: '',
    tokenVersion: '1'
  });

  const [txStatus, setTxStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (address) {
      setFormData(prev => ({ ...prev, ownerAddress: address }));
      fetchContractInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const fetchContractInfo = async () => {
    if (!publicClient || !address) return;

    try {
      const results = await Promise.allSettled([
        publicClient.readContract({
          address: CONFIG.FACILITATOR_ADDRESS,
          abi: FACILITATOR_ABI,
          functionName: 'feeCollector'
        }),
        publicClient.readContract({
          address: CONFIG.FACILITATOR_ADDRESS,
          abi: FACILITATOR_ABI,
          functionName: 'getUSDCDecimals'
        }),
        publicClient.readContract({
          address: CONFIG.USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [address]
        }),
        publicClient.readContract({
          address: CONFIG.USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'nonces',
          args: [address]
        }),
        publicClient.readContract({
          address: CONFIG.USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'name'
        }).catch(() => 'Test Token'),
        publicClient.readContract({
          address: CONFIG.USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'version'
        }).catch(() => '1')
      ]);

      const [feeCollector, decimals, balance, nonce, tokenName, tokenVersion] = results.map(
        (result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            console.error(`Failed to fetch contract info at index ${index}:`, result.reason);
            // Return defaults for failed calls
            if (index === 4) return 'Test Token'; // token name
            if (index === 5) return '1'; // token version
            return null;
          }
        }
      );

      setContractInfo({
        feeCollector: feeCollector || '',
        decimals: Number(decimals || 18),
        userBalance: parseUSDCAmount(balance || 0, Number(decimals || 18)),
        nonce: nonce ? nonce.toString() : '0',
        tokenName: tokenName || 'Test Token',
        tokenVersion: tokenVersion || '1'
      });
    } catch (error) {
      console.error('Error fetching contract info:', error);
      toast.error('Failed to fetch contract information');
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!validateAddress(formData.ownerAddress)) {
      newErrors.ownerAddress = 'Invalid owner address';
    }

    if (!validateAddress(formData.recipientAddress)) {
      newErrors.recipientAddress = 'Invalid recipient address';
    }

    if (!validateAmount(formData.totalAmount)) {
      newErrors.totalAmount = 'Invalid amount';
    } else if (parseFloat(formData.totalAmount) > parseFloat(contractInfo.userBalance)) {
      newErrors.totalAmount = 'Insufficient balance';
    }

    if (!validateAmount(formData.feeAmount)) {
      newErrors.feeAmount = 'Invalid fee amount';
    } else if (parseFloat(formData.feeAmount) >= parseFloat(formData.totalAmount)) {
      newErrors.feeAmount = 'Fee must be less than total amount';
    }

    if (formData.deadline < 1 || formData.deadline > 1440) {
      newErrors.deadline = 'Deadline must be between 1 and 1440 minutes';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!validateForm()) {
      toast.error('Please fix form errors');
      return;
    }

    setLoading(true);
    setTxStatus('Preparing permit signature...');

    try {
      const deadline = getPermitDeadline(formData.deadline);
      const value = formatUSDCAmount(formData.totalAmount, contractInfo.decimals);
      const feeAmountFormatted = formatUSDCAmount(formData.feeAmount, contractInfo.decimals);

      console.log('Transaction Parameters:', {
        owner: formData.ownerAddress,
        recipient: formData.recipientAddress,
        value: value,
        feeAmount: feeAmountFormatted,
        deadline: deadline,
        nonce: contractInfo.nonce,
        decimals: contractInfo.decimals,
        tokenName: contractInfo.tokenName,
        tokenVersion: contractInfo.tokenVersion,
        facilitatorAddress: CONFIG.FACILITATOR_ADDRESS,
        usdcAddress: CONFIG.USDC_ADDRESS
      });

      const permitMessage = createUSDCPermitMessage(
        formData.ownerAddress,
        CONFIG.FACILITATOR_ADDRESS,
        value,
        contractInfo.nonce,
        deadline,
        CONFIG.CHAIN_ID,
        CONFIG.USDC_ADDRESS,
        contractInfo.tokenName,
        contractInfo.tokenVersion
      );

      console.log('Permit Message:', permitMessage);

      setTxStatus('Awaiting signature...');
      
      const signature = await signTypedDataAsync({
        domain: permitMessage.domain,
        types: permitMessage.types,
        message: permitMessage.message,
        primaryType: permitMessage.primaryType
      });

      console.log('Signature:', signature);

      const { v, r, s } = splitSignature(signature);
      
      console.log('Signature components:', { v, r, s });

      setTxStatus('Sending transaction...');

      const provider = new ethers.BrowserProvider(walletClient);
      const signer = await provider.getSigner();
      
      const facilitatorContract = new ethers.Contract(
        CONFIG.FACILITATOR_ADDRESS,
        FACILITATOR_ABI,
        signer
      );

      // First try to estimate gas to get more error details
      try {
        const gasEstimate = await facilitatorContract.facilitateTransferWithPermit.estimateGas(
          formData.ownerAddress,
          formData.recipientAddress,
          value,
          deadline,
          v,
          r,
          s,
          feeAmountFormatted
        );
        console.log('Gas estimate:', gasEstimate.toString());
      } catch (estimateError) {
        console.error('Gas estimation failed:', estimateError);
        // Try to decode the error
        if (estimateError.data) {
          console.error('Error data:', estimateError.data);
        }
      }

      const tx = await facilitatorContract.facilitateTransferWithPermit(
        formData.ownerAddress,
        formData.recipientAddress,
        value,
        deadline,
        v,
        r,
        s,
        feeAmountFormatted
      );

      setTxStatus('Transaction pending...');
      
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        setTxStatus('Transaction confirmed!');
        toast.success(`Transaction successful! Hash: ${receipt.hash.slice(0, 10)}...`);
        
        setFormData(prev => ({
          ...prev,
          recipientAddress: '',
          totalAmount: '',
          feeAmount: ''
        }));
        
        await fetchContractInfo();
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      console.error('Transaction error:', error);
      
      let errorMessage = 'Transaction failed';
      if (error.message.includes('expired')) {
        errorMessage = 'Permit expired. Please try again.';
      } else if (error.message.includes('insufficient')) {
        errorMessage = 'Insufficient balance';
      } else if (error.message.includes('used')) {
        errorMessage = 'This permit signature has already been used';
      } else if (error.message.includes('rejected')) {
        errorMessage = 'Transaction rejected by user';
      }
      
      setTxStatus('');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="facilitate-transfer-container">
      <div className="card">
        <h2>{contractInfo.tokenName || 'Token'} Facilitator Transfer</h2>
        
        <div className="info-section">
          <div className="info-item">
            <span className="label">Your Balance:</span>
            <span className="value">{contractInfo.userBalance} {contractInfo.tokenName || 'Tokens'}</span>
          </div>
          <div className="info-item">
            <span className="label">Fee Collector:</span>
            <span className="value small">{contractInfo.feeCollector}</span>
          </div>
          <div className="info-item">
            <span className="label">Current Nonce:</span>
            <span className="value">{contractInfo.nonce}</span>
          </div>
          <div className="info-item">
            <span className="label">Token Decimals:</span>
            <span className="value">{contractInfo.decimals}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="transfer-form">
          <div className="form-group">
            <label htmlFor="ownerAddress">Owner Address</label>
            <input
              type="text"
              id="ownerAddress"
              name="ownerAddress"
              value={formData.ownerAddress}
              onChange={handleInputChange}
              placeholder="Connected wallet address"
              disabled
              className={errors.ownerAddress ? 'error' : ''}
            />
            {errors.ownerAddress && <span className="error-text">{errors.ownerAddress}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="recipientAddress">Recipient Address</label>
            <input
              type="text"
              id="recipientAddress"
              name="recipientAddress"
              value={formData.recipientAddress}
              onChange={handleInputChange}
              placeholder="0x..."
              disabled={loading}
              className={errors.recipientAddress ? 'error' : ''}
            />
            {errors.recipientAddress && <span className="error-text">{errors.recipientAddress}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="totalAmount">Total Transfer Amount</label>
            <input
              type="number"
              id="totalAmount"
              name="totalAmount"
              value={formData.totalAmount}
              onChange={handleInputChange}
              placeholder="0.00"
              step={Math.pow(10, -contractInfo.decimals).toFixed(contractInfo.decimals)}
              min="0"
              disabled={loading}
              className={errors.totalAmount ? 'error' : ''}
            />
            {errors.totalAmount && <span className="error-text">{errors.totalAmount}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="feeAmount">Fee Amount</label>
            <input
              type="number"
              id="feeAmount"
              name="feeAmount"
              value={formData.feeAmount}
              onChange={handleInputChange}
              placeholder="0.00"
              step={Math.pow(10, -contractInfo.decimals).toFixed(contractInfo.decimals)}
              min="0"
              disabled={loading}
              className={errors.feeAmount ? 'error' : ''}
            />
            {errors.feeAmount && <span className="error-text">{errors.feeAmount}</span>}
            {formData.totalAmount && formData.feeAmount && (
              <span className="helper-text">
                Recipient will receive: {(parseFloat(formData.totalAmount) - parseFloat(formData.feeAmount)).toFixed(contractInfo.decimals)}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="deadline">Permit Deadline (minutes from now)</label>
            <input
              type="number"
              id="deadline"
              name="deadline"
              value={formData.deadline}
              onChange={handleInputChange}
              min="1"
              max="1440"
              disabled={loading}
              className={errors.deadline ? 'error' : ''}
            />
            {errors.deadline && <span className="error-text">{errors.deadline}</span>}
            <span className="helper-text">
              Expires at: {new Date(Date.now() + formData.deadline * 60000).toLocaleString()}
            </span>
          </div>

          <button 
            type="submit" 
            disabled={loading || !isConnected}
            className="submit-button"
          >
            {loading ? txStatus : 'Execute Transfer'}
          </button>
        </form>

        {txStatus && (
          <div className={`status-message ${loading ? 'pending' : 'success'}`}>
            {txStatus}
          </div>
        )}
      </div>
    </div>
  );
};

export default FacilitateTransfer;