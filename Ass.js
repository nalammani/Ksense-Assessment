const fetch = require('node-fetch');

const API_KEY = 'ak_12dd97ceceec3200c2b5b661c92dd559d9b0b78cb8fa0b7e';
const BASE_URL = 'https://assessment.ksensetech.com/api';

async function fetchWithRetry(url, options = {}, retries = 5, backoff = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status === 500 || res.status === 503) {
        console.warn(`Server error (${res.status}), retrying...`);
        await new Promise(r => setTimeout(r, backoff));
        backoff *= 2;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      console.warn(`Fetch failed, retrying... (${e.message})`);
      await new Promise(r => setTimeout(r, backoff));
      backoff *= 2;
    }
  }
  throw new Error('Max retries reached');
}

function parseBP(bp) {
  if (!bp || typeof bp !== 'string') return null;
  const parts = bp.split('/');
  if (parts.length !== 2) return null;
  const sys = Number(parts[0]);
  const dia = Number(parts[1]);
  if (isNaN(sys) || isNaN(dia)) return null;
  return { sys, dia };
}

function getBPRisk(bp) {
  const parsed = parseBP(bp);
  if (!parsed) return 0;
  const { sys, dia } = parsed;
  if (sys >= 140 || dia >= 90) return 4;
  if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89)) return 3;
  if (sys >= 120 && sys <= 129 && dia < 80) return 2;
  if (sys < 120 && dia < 80) return 1;
  return 0;
}

function getTempRisk(temp) {
  const t = Number(temp);
  if (isNaN(t)) return 0;
  if (t <= 99.5) return 0;
  if (t >= 99.6 && t <= 100.9) return 1;
  if (t >= 101) return 2;
  return 0;
}

function getAgeRisk(age) {
  const a = Number(age);
  if (isNaN(a)) return 0;
  if (a > 65) return 2;
  if (a >= 40 && a <= 65) return 1;
  if (a < 40) return 1;
  return 0;
}

function hasDataQualityIssues(patient) {
  if (!patient.blood_pressure || !parseBP(patient.blood_pressure)) return true;
  if (patient.age === undefined || isNaN(Number(patient.age))) return true;
  if (patient.temperature === undefined || isNaN(Number(patient.temperature))) return true;
  return false;
}

async function main() {
  let highRiskPatients = [];
  let feverPatients = [];
  let dataQualityIssues = [];

  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const url = `${BASE_URL}/patients?page=${page}&limit=20`;
    const data = await fetchWithRetry(url, {
      headers: { 'x-api-key': API_KEY }
    });

    if (!data || !data.data) {
      console.error('Invalid response from server.');
      break;
    }

    for (const patient of data.data) {
      if (hasDataQualityIssues(patient)) {
        dataQualityIssues.push(patient.patient_id);
        continue;
      }

      const bpScore = getBPRisk(patient.blood_pressure);
      const tempScore = getTempRisk(patient.temperature);
      const ageScore = getAgeRisk(patient.age);
      const totalRisk = bpScore + tempScore + ageScore;

      if (totalRisk >= 4) highRiskPatients.push(patient.patient_id);
      if (Number(patient.temperature) >= 99.6) feverPatients.push(patient.patient_id);
    }

    hasNext = data.pagination?.hasNext || false;
    page++;
  }

  console.log('\n--- Alert Lists ---');
  console.log('High-Risk Patients:', highRiskPatients);
  console.log('Fever Patients:', feverPatients);
  console.log('Data Quality Issues:', dataQualityIssues);

  // Use simple arrays of strings as payload to avoid 400 error
  const payload = {
    high_risk_patients: highRiskPatients,
    fever_patients: feverPatients,
    data_quality_issues: dataQualityIssues
  };

  console.log('\nSubmitting payload:\n', JSON.stringify(payload, null, 2));

  const submitUrl = `${BASE_URL}/submit-assessment`;
  const submitResponse = await fetchWithRetry(submitUrl, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  console.log('\n--- Submission Result ---');
  console.log(JSON.stringify(submitResponse, null, 2));

  if (submitResponse.feedback) {
    console.log('\nFeedback:', JSON.stringify(submitResponse.feedback, null, 2));
  }

  if (submitResponse.results?.breakdown) {
    console.log('\nBreakdown:', JSON.stringify(submitResponse.results.breakdown, null, 2));
  }
}

main().catch(err => {
  console.error('\nFatal Error:', err.message);
});
