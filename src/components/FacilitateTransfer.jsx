import React, { useState, useEffect } from 'react';
import { useAccount, useSignTypedData, usePublicClient } from 'wagmi';
import toast from 'react-hot-toast';
import {
  createUSDCPermitMessage,
  splitSignature,
  formatUSDCAmount,
  parseUSDCAmount,
  getPermitDeadline,
  validateAddress,
  validateAmount,
  validateRecipient,
  calculateTotalRecipientAmount,
  formatRecipientsForContract,
  validateBulkTransferData,
  createBulkTransferSummary
} from '../utils/permitUtils';
import { CONFIG, USDC_ABI, FACILITATOR_ABI } from '../config';
import { apiService } from '../services/api';

const FacilitateTransfer = () => {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();

  const [activeTab, setActiveTab] = useState('single');
  
  const [formData, setFormData] = useState({
    ownerAddress: '',
    recipientAddress: '',
    totalAmount: '',
    feeAmount: '',
    deadline: 30
  });

  const [bulkFormData, setBulkFormData] = useState({
    ownerAddress: '',
    recipients: [{ address: '', amount: '' }],
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
      setBulkFormData(prev => ({ ...prev, ownerAddress: address }));
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

      setTxStatus('Sending to backend for execution...');

      // Send permit data to backend API
      const permitData = {
        owner: formData.ownerAddress,
        to: formData.recipientAddress,
        value: value,
        deadline: deadline,
        v: v,
        r: r,
        s: s,
        feeAmount: feeAmountFormatted,
        nonce: contractInfo.nonce,
        chainId: CONFIG.CHAIN_ID,
        facilitatorAddress: CONFIG.FACILITATOR_ADDRESS,
        tokenAddress: CONFIG.USDC_ADDRESS
      };

      console.log('Sending permit data to API:', permitData);

      const result = await apiService.executePermitTransfer(permitData);

      if (result.success) {
        setTxStatus('Transaction confirmed!');
        toast.success(`Transaction successful! Hash: ${result.txHash.slice(0, 10)}...`);
        
        setFormData(prev => ({
          ...prev,
          recipientAddress: '',
          totalAmount: '',
          feeAmount: ''
        }));
        
        await fetchContractInfo();
      } else {
        throw new Error(result.error || 'Transaction failed');
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

  // Bulk Transfer Functions
  const handleBulkInputChange = (e) => {
    const { name, value } = e.target;
    setBulkFormData(prev => ({ ...prev, [name]: value }));
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleRecipientChange = (index, field, value) => {
    const newRecipients = [...bulkFormData.recipients];
    newRecipients[index] = { ...newRecipients[index], [field]: value };
    setBulkFormData(prev => ({ ...prev, recipients: newRecipients }));
    
    // Clear recipient-specific errors
    if (errors.recipients && errors.recipients[index] && errors.recipients[index][field]) {
      const newErrors = { ...errors };
      delete newErrors.recipients[index][field];
      if (Object.keys(newErrors.recipients[index]).length === 0) {
        delete newErrors.recipients[index];
      }
      if (Object.keys(newErrors.recipients).length === 0) {
        delete newErrors.recipients;
      }
      setErrors(newErrors);
    }
  };

  const addRecipient = () => {
    if (bulkFormData.recipients.length < 50) { // Limit to 50 recipients
      setBulkFormData(prev => ({
        ...prev,
        recipients: [...prev.recipients, { address: '', amount: '' }]
      }));
    }
  };

  const removeRecipient = (index) => {
    if (bulkFormData.recipients.length > 1) {
      setBulkFormData(prev => ({
        ...prev,
        recipients: prev.recipients.filter((_, i) => i !== index)
      }));
    }
  };

  const validateBulkForm = () => {
    const totalRecipientAmount = calculateTotalRecipientAmount(bulkFormData.recipients);
    const totalAmount = totalRecipientAmount + parseFloat(bulkFormData.feeAmount || 0);
    
    const newErrors = validateBulkTransferData(
      bulkFormData.recipients,
      totalAmount.toString(),
      bulkFormData.feeAmount,
      contractInfo.userBalance
    );

    if (bulkFormData.deadline < 1 || bulkFormData.deadline > 1440) {
      newErrors.deadline = 'Deadline must be between 1 and 1440 minutes';
    }

    if (!validateAddress(bulkFormData.ownerAddress)) {
      newErrors.ownerAddress = 'Invalid owner address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!validateBulkForm()) {
      toast.error('Please fix form errors');
      return;
    }

    setLoading(true);
    setTxStatus('Preparing bulk permit signature...');

    try {
      const deadline = getPermitDeadline(bulkFormData.deadline);
      const totalRecipientAmount = calculateTotalRecipientAmount(bulkFormData.recipients);
      const totalValue = totalRecipientAmount + parseFloat(bulkFormData.feeAmount || 0);
      const formattedTotalValue = formatUSDCAmount(totalValue.toString(), contractInfo.decimals);
      const feeAmountFormatted = formatUSDCAmount(bulkFormData.feeAmount, contractInfo.decimals);
      const formattedRecipients = formatRecipientsForContract(bulkFormData.recipients, contractInfo.decimals);

      console.log('Bulk Transaction Parameters:', {
        owner: bulkFormData.ownerAddress,
        recipients: formattedRecipients,
        totalValue: formattedTotalValue,
        feeAmount: feeAmountFormatted,
        deadline: deadline,
        nonce: contractInfo.nonce,
        decimals: contractInfo.decimals
      });

      // Create permit message (same as single transfer)
      const permitMessage = createUSDCPermitMessage(
        bulkFormData.ownerAddress,
        CONFIG.FACILITATOR_ADDRESS,
        formattedTotalValue,
        contractInfo.nonce,
        deadline,
        CONFIG.CHAIN_ID,
        CONFIG.USDC_ADDRESS,
        contractInfo.tokenName,
        contractInfo.tokenVersion
      );

      setTxStatus('Awaiting signature...');
      
      const signature = await signTypedDataAsync({
        domain: permitMessage.domain,
        types: permitMessage.types,
        message: permitMessage.message,
        primaryType: permitMessage.primaryType
      });

      const { v, r, s } = splitSignature(signature);

      setTxStatus('Sending bulk transfer to backend...');

      // Send bulk permit data to backend API
      const permitData = {
        owner: bulkFormData.ownerAddress,
        recipients: formattedRecipients,
        totalValue: formattedTotalValue,
        deadline: deadline,
        v: v,
        r: r,
        s: s,
        feeAmount: feeAmountFormatted,
        nonce: contractInfo.nonce,
        chainId: CONFIG.CHAIN_ID,
        facilitatorAddress: CONFIG.FACILITATOR_ADDRESS,
        tokenAddress: CONFIG.USDC_ADDRESS
      };

      const result = await apiService.executeBulkPermitTransfer(permitData);

      if (result.success) {
        setTxStatus('Bulk transaction confirmed!');
        toast.success(`Bulk transfer successful! Hash: ${result.txHash.slice(0, 10)}...`);
        
        setBulkFormData(prev => ({
          ...prev,
          recipients: [{ address: '', amount: '' }],
          feeAmount: ''
        }));
        
        await fetchContractInfo();
      } else {
        throw new Error(result.error || 'Bulk transaction failed');
      }
    } catch (error) {
      console.error('Bulk transaction error:', error);
      
      let errorMessage = 'Bulk transaction failed';
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

  const renderBulkTransferSummary = () => {
    if (bulkFormData.recipients.length === 0 || !bulkFormData.recipients.some(r => r.amount)) {
      return null;
    }
    
    const summary = createBulkTransferSummary(bulkFormData.recipients, bulkFormData.feeAmount, contractInfo.decimals);
    
    return (
      <div className="bulk-summary">
        <h4>Transfer Summary</h4>
        <div className="summary-item">
          <span>Recipients: {summary.recipientCount}</span>
        </div>
        <div className="summary-item">
          <span>Total to Recipients: {summary.totalRecipientAmount}</span>
        </div>
        <div className="summary-item">
          <span>Fee Amount: {summary.feeAmount}</span>
        </div>
        <div className="summary-item total">
          <span>Total Amount: {summary.totalAmount}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="facilitate-transfer-container">
      <div className="card">
        <h2>{contractInfo.tokenName || 'Token'} Facilitator Transfer</h2>
        
        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === 'single' ? 'active' : ''}`}
            onClick={() => setActiveTab('single')}
            disabled={loading}
          >
            Single Transfer
          </button>
          <button 
            className={`tab-button ${activeTab === 'bulk' ? 'active' : ''}`}
            onClick={() => setActiveTab('bulk')}
            disabled={loading}
          >
            Bulk Transfer
          </button>
        </div>
        
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

        {/* Tab Content */}
        {activeTab === 'single' && (
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
        )}

        {activeTab === 'bulk' && (
          <form onSubmit={handleBulkSubmit} className="transfer-form bulk-form">
            <div className="form-group">
              <label htmlFor="bulkOwnerAddress">Owner Address</label>
              <input
                type="text"
                id="bulkOwnerAddress"
                name="ownerAddress"
                value={bulkFormData.ownerAddress}
                onChange={handleBulkInputChange}
                placeholder="Connected wallet address"
                disabled
                className={errors.ownerAddress ? 'error' : ''}
              />
              {errors.ownerAddress && <span className="error-text">{errors.ownerAddress}</span>}
            </div>

            <div className="recipients-section">
              <div className="recipients-header">
                <label>Recipients</label>
                <button
                  type="button"
                  onClick={addRecipient}
                  disabled={loading || bulkFormData.recipients.length >= 50}
                  className="add-recipient-button"
                >
                  + Add Recipient
                </button>
              </div>

              {bulkFormData.recipients.map((recipient, index) => (
                <div key={index} className="recipient-row">
                  <div className="recipient-inputs">
                    <input
                      type="text"
                      placeholder="Recipient address (0x...)"
                      value={recipient.address}
                      onChange={(e) => handleRecipientChange(index, 'address', e.target.value)}
                      disabled={loading}
                      className={errors.recipients && errors.recipients[index] && errors.recipients[index].address ? 'error' : ''}
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={recipient.amount}
                      onChange={(e) => handleRecipientChange(index, 'amount', e.target.value)}
                      step={Math.pow(10, -contractInfo.decimals).toFixed(contractInfo.decimals)}
                      min="0"
                      disabled={loading}
                      className={errors.recipients && errors.recipients[index] && errors.recipients[index].amount ? 'error' : ''}
                    />
                    {bulkFormData.recipients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRecipient(index)}
                        disabled={loading}
                        className="remove-recipient-button"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {errors.recipients && errors.recipients[index] && (
                    <div className="recipient-errors">
                      {errors.recipients[index].address && (
                        <span className="error-text">{errors.recipients[index].address}</span>
                      )}
                      {errors.recipients[index].amount && (
                        <span className="error-text">{errors.recipients[index].amount}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {errors.recipients && typeof errors.recipients === 'string' && (
                <span className="error-text">{errors.recipients}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="bulkFeeAmount">Fee Amount</label>
              <input
                type="number"
                id="bulkFeeAmount"
                name="feeAmount"
                value={bulkFormData.feeAmount}
                onChange={handleBulkInputChange}
                placeholder="0.00"
                step={Math.pow(10, -contractInfo.decimals).toFixed(contractInfo.decimals)}
                min="0"
                disabled={loading}
                className={errors.feeAmount ? 'error' : ''}
              />
              {errors.feeAmount && <span className="error-text">{errors.feeAmount}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="bulkDeadline">Permit Deadline (minutes from now)</label>
              <input
                type="number"
                id="bulkDeadline"
                name="deadline"
                value={bulkFormData.deadline}
                onChange={handleBulkInputChange}
                min="1"
                max="1440"
                disabled={loading}
                className={errors.deadline ? 'error' : ''}
              />
              {errors.deadline && <span className="error-text">{errors.deadline}</span>}
              <span className="helper-text">
                Expires at: {new Date(Date.now() + bulkFormData.deadline * 60000).toLocaleString()}
              </span>
            </div>

            {renderBulkTransferSummary()}

            <button 
              type="submit" 
              disabled={loading || !isConnected}
              className="submit-button"
            >
              {loading ? txStatus : 'Execute Bulk Transfer'}
            </button>
          </form>
        )}

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