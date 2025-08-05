const fetch = require('node-fetch');

const API_KEY = 'ak_12dd97ceceec3200c2b5b661c92dd559d9b0b78cb8fa0b7e';
const BASE_URL = 'https://assessment.ksensetech.com/api';

async function submitTest() {
  const payload = {
    high_risk_patients: ['DEMO001'],
    fever_patients: ['DEMO008'],
    data_quality_issues: ['DEMO005']
  };

  console.log('Submitting:', JSON.stringify(payload, null, 2));

  const res = await fetch(`${BASE_URL}/submit-assessment`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    console.error('Submit failed:', res.status, await res.text());
    return;
  }

  const json = await res.json();
  console.log('Submit success:', json);
}

submitTest().catch(console.error);
