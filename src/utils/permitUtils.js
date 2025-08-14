import { ethers } from 'ethers';

export const USDC_PERMIT_TYPEHASH = '0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9';

export const createUSDCPermitMessage = (
  owner,
  spender,
  value,
  nonce,
  deadline,
  chainId,
  verifyingContract,
  tokenName = null,
  tokenVersion = null
) => {
  // Use provided token name and version, or defaults
  const domain = {
    name: tokenName || 'Test Token',
    version: tokenVersion || '1',
    chainId: chainId,
    verifyingContract: verifyingContract
  };

  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };

  const message = {
    owner,
    spender,
    value,
    nonce,
    deadline
  };

  console.log('Creating permit with domain:', domain);

  return {
    domain,
    types,
    message,
    primaryType: 'Permit'
  };
};

export const splitSignature = (signature) => {
  const sig = ethers.Signature.from(signature);
  return {
    v: sig.v,
    r: sig.r,
    s: sig.s
  };
};

export const formatUSDCAmount = (amount, decimals = 18) => {
  try {
    return ethers.parseUnits(amount.toString(), decimals).toString();
  } catch (error) {
    console.error('Error formatting USDC amount:', error);
    return '0';
  }
};

export const parseUSDCAmount = (amount, decimals = 18) => {
  try {
    return ethers.formatUnits(amount.toString(), decimals);
  } catch (error) {
    console.error('Error parsing USDC amount:', error);
    return '0';
  }
};

export const getPermitDeadline = (minutesFromNow = 30) => {
  return Math.floor(Date.now() / 1000) + (minutesFromNow * 60);
};

export const validateAddress = (address) => {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
};

export const validateAmount = (amount, maxAmount = null) => {
  try {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return false;
    }
    if (maxAmount !== null) {
      const parsedMax = parseFloat(maxAmount);
      return parsedAmount <= parsedMax;
    }
    return true;
  } catch {
    return false;
  }
};