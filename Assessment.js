// Fetch setup as before
let fetch;
try {
  fetch = global.fetch || require('node-fetch');
} catch (e) {
  console.error("❌ 'node-fetch' is not installed. Run: npm install node-fetch");
  process.exit(1);
}

const API_KEY = 'ak_12dd97ceceec3200c2b5b661c92dd559d9b0b78cb8fa0b7e';
const BASE_URL = 'https://assessment.ksensetech.com/api';

async function fetchPatients(page = 1, limit = 20) {
  const res = await fetch(`${BASE_URL}/patients?page=${page}&limit=${limit}`, {
    headers: { 'x-api-key': API_KEY }
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

function getBPRisk(bp) {
  if (!bp) return 0;
  const parts = bp.split('/');
  if (parts.length !== 2) return 0;
  const sys = Number(parts[0]);
  const dia = Number(parts[1]);
  if (isNaN(sys) || isNaN(dia)) return 0;

  function bpStage(value, isSystolic) {
    if (isSystolic) {
      if (value < 120) return 1;
      if (value >= 120 && value <= 129) return 2;
      if (value >= 130 && value <= 139) return 3;
      if (value >= 140) return 4;
    } else {
      if (value < 80) return 1;
      if (value >= 80 && value <= 89) return 3;
      if (value >= 90) return 4;
    }
    return 0;
  }

  const sysRisk = bpStage(sys, true);
  const diaRisk = bpStage(dia, false);
  return Math.max(sysRisk, diaRisk);
}

function getTempRisk(temp) {
  const t = Number(temp);
  if (isNaN(t)) return 0;
  if (t <= 99.5) return 0;
  if (t >= 99.6 && t <= 100.9) return 1;
  if (t >= 100.1) return 2;
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
  const bp = patient.blood_pressure;
  if (!bp || !/^\d+\/\d+$/.test(bp)) return true;
  if (!patient.age || isNaN(Number(patient.age))) return true;
  if (!patient.temperature || isNaN(Number(patient.temperature))) return true;
  return false;
}

async function main() {
  let highRisk = [];
  let fever = [];
  let dataIssues = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await fetchPatients(page);
    data.data.forEach(p => {
      if (hasDataQualityIssues(p)) {
        dataIssues.push(p.patient_id);
        return;
      }
      const bpScore = getBPRisk(p.blood_pressure);
      const tempScore = getTempRisk(p.temperature);
      const ageScore = getAgeRisk(p.age);
      const total = bpScore + tempScore + ageScore;

      if (total >= 4) highRisk.push(p.patient_id);
      if (Number(p.temperature) >= 99.6) fever.push(p.patient_id);
    });
    hasNext = data.pagination.hasNext;
    page++;
  }

  // Print the alert lists clearly:
  console.log('--- Alert Lists ---');
  console.log('High-Risk Patients (total risk score ≥ 4):');
  console.log(highRisk.length > 0 ? highRisk.join(', ') : 'None');

  console.log('\nFever Patients (temperature ≥ 99.6°F):');
  console.log(fever.length > 0 ? fever.join(', ') : 'None');

  console.log('\nData Quality Issues (invalid or missing BP, Age, or Temp):');
  console.log(dataIssues.length > 0 ? dataIssues.join(', ') : 'None');

  // Submit results (optional, if needed)
  /*
  const res = await fetch(`${BASE_URL}/submit-assessment`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      high_risk_patients: highRisk,
      fever_patients: fever,
      data_quality_issues: dataIssues
    })
  });

  const json = await res.json();
  console.log('\nSubmission result:', json);
  */
}

main().catch(console.error);
