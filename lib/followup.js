const Anthropic = require('@anthropic-ai/sdk');
const { readLeads, writeLeads } = require('./leads');
const { loadClients } = require('./clients');
const { sendMessage } = require('./greenapi');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function langLabel(lang) {
  if (lang === 'es') return 'espanhol';
  if (lang === 'en') return 'inglês';
  return 'português europeu';
}

async function composeFollowUpMessage(client, lead) {
  const cfg = client.business;
  const prompt = `Escreve uma mensagem curta de WhatsApp (2-3 frases), em ${langLabel(cfg.lang)}, da parte de "${cfg.name}". A mensagem é um follow-up simpático para ${lead.name || 'um cliente'}, que mostrou interesse em: "${lead.need || 'os nossos serviços'}" mas ainda não respondeu desde então. Tom caloroso, sem soar a spam nem pressão, como alguém que se lembrou genuinamente da pessoa. Não uses markdown nem emojis em excesso. Responde APENAS com o texto da mensagem, nada mais.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
  });

  return (response.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

async function checkAndSendFollowUps() {
  const clients = loadClients();
  const clientsById = Object.fromEntries(clients.map(c => [c.id, c]));
  const leads = readLeads();
  let changed = false;

  for (const lead of leads) {
    const client = clientsById[lead.clientId];
    if (!client || !client.followUp?.enabled) continue;
    if (lead.followUpSentAt) continue;
    if (!lead.capturedAt || !lead.from) continue;

    const delayHours = client.followUp.delayHours ?? 48;
    const capturedAt = new Date(lead.capturedAt).getTime();
    const dueAt = capturedAt + delayHours * 60 * 60 * 1000;

    if (Date.now() >= dueAt) {
      try {
        const message = await composeFollowUpMessage(client, lead);
        await sendMessage(client, lead.from, message);
        lead.followUpSentAt = new Date().toISOString();
        changed = true;
        console.log(`[${client.id}] Follow-up enviado a ${lead.from}`);
      } catch (err) {
        console.error(`[${client.id}] Erro a enviar follow-up:`, err.message);
      }
    }
  }

  if (changed) writeLeads(leads);
}

function startFollowUpScheduler() {
  const CHECK_INTERVAL_MS = 30 * 60 * 1000; // a cada 30 minutos

  checkAndSendFollowUps().catch(err =>
    console.error('Erro no scheduler de follow-up:', err.message)
  );

  setInterval(() => {
    checkAndSendFollowUps().catch(err =>
      console.error('Erro no scheduler de follow-up:', err.message)
    );
  }, CHECK_INTERVAL_MS);
}

module.exports = { startFollowUpScheduler, checkAndSendFollowUps };
