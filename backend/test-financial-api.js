const axios = require('axios');
const jwt = require('jsonwebtoken');

async function testFinancialAPI() {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is required to run this test.');
    }

    const apiBase = process.env.API_BASE_URL || 'http://localhost:5000/api';

    // Generate admin token
    const token = jwt.sign(
      { id: 4, email: 'admin@lushlaundry.com', role: 'ADMIN' },
      process.env.JWT_SECRET
    );

    console.log('📊 Testing Financial Dashboard API...\n');

    const response = await axios.get(`${apiBase}/financial/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ API Response:\n');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testFinancialAPI();
