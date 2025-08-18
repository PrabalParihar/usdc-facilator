const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const apiService = {
  async executePermitTransfer(permitData) {
    try {
      const response = await fetch(`${API_URL}/execute-permit-transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(permitData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to execute transfer');
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  async executeBulkPermitTransfer(permitData) {
    try {
      const response = await fetch(`${API_URL}/execute-bulk-permit-transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(permitData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to execute bulk transfer');
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  async getTransactionStatus(txHash) {
    try {
      const response = await fetch(`${API_URL}/transaction/${txHash}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch transaction status');
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }
};