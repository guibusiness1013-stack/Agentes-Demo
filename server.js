require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemPrompt } = require('./lib/agentConfig');
const { appendLead } = require('./lib/leads');
const { loadClients } = require('./lib/clients');
const { sendMessage: sendGreenApiMessage } = require('./lib/greenapi');
const { startFollowUpScheduler } = require('./lib/followup');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERRO: falta a variável ANTHROPIC_API_KEY no ficheiro .env');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Memória das conversas de WhatsApp, por cliente + número de telefone.
// Nota: isto reinicia sempre que o servidor reinicia (ex: quando o Render
// "adormece" no plano gratuito). Para produção a sério, trocar por uma
// base de dados (ex: Redis, PostgreSQL).
const conversations = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Endpoint que o chat web de demonstração chama. A chave da API nunca sai daqui.
app.post('/api/chat', async (req, res) => {
  try {
    const { system, messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Faltam mensagens.' });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: system || '',
      messages: messages
    });

    res.json(response);
  } catch (err) {
    console.error('Erro ao chamar a Anthropic API:', err.message);
    res.status(500).json({ error: 'Erro ao contactar o modelo.' });
  }
});

// Endpoint para veres os leads capturados de todos os clientes (ou filtra por clientId).
// Em produção, protege isto com password ou liga a um CRM em vez disto.
app.get('/leads', (req, res) => {
  try {
    const leads = JSON.parse(fs.readFileSync(path.join(__dirname, 'leads.json'), 'utf-8'));
    const { clientId } = req.query;
    res.json(clientId ? leads.filter(l => l.clientId === clientId) : leads);
  } catch (e) {
    res.json([]);
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleIncomingMessage(client, chatId, userText) {
  const convKey = `${client.id}::${chatId}`;

  if (!conversations.has(convKey)) {
    conversations.set(convKey, []);
  }
  const history = conversations.get(convKey);
  history.push({ role: 'user', content: userText });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: buildSystemPrompt(client.business),
    messages: history
  });

  const textBlocks = (response.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text);
  let full = textBlocks.join('\n').trim();

  let displayText = full;
  const match = full.match(/\[\[LEAD_CAPTURED\]\]([\s\S]*?)\[\[\/LEAD_CAPTURED\]\]/);
  if (match) {
    displayText = full.replace(match[0], '').trim();
    try {
      const lead = JSON.parse(match[1]);
      appendLead({ ...lead, clientId: client.id, channel: 'whatsapp', from: chatId });

      if (client.notifyNumber) {
        const notifyText =
          `🔔 Novo lead — ${client.business.name}\n` +
          `Nome: ${lead.name || '—'}\n` +
          `Contacto: ${lead.contact || '—'}\n` +
          `Pedido: ${lead.need || '—'}`;
        sendGreenApiMessage(client, client.notifyNumber, notifyText).catch(err =>
          console.error(`[${client.id}] Erro a notificar staff:`, err.message)
        );
      }
    } catch (e) {
      console.error(`[${client.id}] Não consegui interpretar o lead capturado:`, e.message);
    }
  }

  history.push({ role: 'assistant', content: full });
  conversations.set(convKey, history);

  await sendGreenApiMessage(client, chatId, displayText || 'Desculpa, não percebi. Podes repetir?');
}

// Um "polling loop" independente por cada cliente — cada um pergunta ao
// respetivo Green API (a respetiva instância/número de WhatsApp) se há
// mensagens novas.
async function startPollingForClient(client) {
  console.log(`[${client.id}] A iniciar polling do WhatsApp...`);
  const { idInstance, apiToken } = client.greenapi;

  while (true) {
    try {
      const url = `https://api.green-api.com/waInstance${idInstance}/receiveNotification/${apiToken}?receiveTimeout=20`;
      const res = await fetch(url);

      if (!res.ok) {
        await sleep(3000);
        continue;
      }

      const rawText = await res.text();
      if (!rawText) continue; // resposta vazia = nada de novo

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        continue;
      }
      if (!data) continue;

      const { receiptId, body } = data;

      try {
        if (body?.typeWebhook === 'incomingMessageReceived') {
          const chatId = body.senderData?.chatId;
          const userText =
            body.messageData?.textMessageData?.textMessage ||
            body.messageData?.extendedTextMessageData?.text ||
            '';
          if (chatId && userText) {
            if (client.notifyNumber && chatId === client.notifyNumber) {
              console.log(`[${client.id}] Mensagem do staff ignorada (não é conversa de cliente).`);
            } else {
              await handleIncomingMessage(client, chatId, userText);
            }
          }
        }
      } catch (procErr) {
        console.error(`[${client.id}] Erro a processar mensagem:`, procErr.message);
      } finally {
        const delUrl = `https://api.green-api.com/waInstance${idInstance}/deleteNotification/${apiToken}/${receiptId}`;
        await fetch(delUrl, { method: 'DELETE' }).catch(() => {});
      }
    } catch (err) {
      console.error(`[${client.id}] Erro no polling:`, err.message);
      await sleep(5000);
    }
  }
}

app.listen(PORT, () => {
  console.log(`Servidor do agente a correr em http://localhost:${PORT}`);

  try {
    const clients = loadClients();
    if (clients.length === 0) {
      console.log('Nenhum cliente ativo em clients.json — só o chat web de demonstração está disponível.');
    }
    clients.forEach(client => {
      if (client.greenapi?.idInstance && client.greenapi?.apiToken) {
        startPollingForClient(client); // não bloqueia o arranque
      } else {
        console.log(`[${client.id}] Sem credenciais Green API válidas — a ignorar.`);
      }
    });
    startFollowUpScheduler();
  } catch (err) {
    console.error('Erro ao carregar clients.json:', err.message);
  }
});
