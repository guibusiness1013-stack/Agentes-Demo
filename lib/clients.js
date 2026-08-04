const fs = require('fs');
const path = require('path');

// Em produção no Render, é recomendado carregar isto como "Secret File"
// (fica em /etc/secrets/clients.json) em vez de o commitar no GitHub,
// já que contém tokens de API de cada cliente. Localmente, ou se preferires
// simplicidade, usa o clients.json normal na raiz do projeto.
const SECRET_PATH = '/etc/secrets/clients.json';
const LOCAL_PATH = path.join(__dirname, '..', 'clients.json');

function loadClients() {
  const filePath = fs.existsSync(SECRET_PATH) ? SECRET_PATH : LOCAL_PATH;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const clients = JSON.parse(raw);
  return clients.filter(c => c.active !== false);
}

module.exports = { loadClients };
