const fs = require('fs');
const path = require('path');

const LEADS_PATH = path.join(__dirname, '..', 'leads.json');

function appendLead(lead) {
  let leads = [];
  try {
    leads = JSON.parse(fs.readFileSync(LEADS_PATH, 'utf-8'));
  } catch (e) {
    leads = [];
  }
  leads.push({ ...lead, capturedAt: new Date().toISOString() });
  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2));
}

module.exports = { appendLead };
