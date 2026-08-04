const fs = require('fs');
const path = require('path');

const LEADS_PATH = path.join(__dirname, '..', 'leads.json');

function readLeads() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_PATH, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeLeads(leads) {
  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2));
}

function appendLead(lead) {
  const leads = readLeads();
  leads.push({ ...lead, capturedAt: new Date().toISOString() });
  writeLeads(leads);
}

module.exports = { appendLead, readLeads, writeLeads };
