require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');
const { loadConfig, buildSystemPrompt } = require('./lib/agentConfig');
const { appendLead } = require('./lib/leads');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERRO: falta a variável ANTHROPIC_API_KEY no ficheiro .env');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Memória simples das conversas de WhatsApp, por número de telefone.
// Nota: isto reinicia sempre que o servidor reinicia (ex: quando o Render
// "adormece" no plano gratuito). Para produção a sério, trocar por uma
// base de dados (ex: Redis, PostgreSQL).
const whatsappConversations = new Map();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // o Twilio envia os dados assim
app.use(express.static('public'));

// Endpoint que o frontend chama. A chave da API nunca sai daqui.
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

// Endpoint que o Twilio chama sempre que chega uma mensagem de WhatsApp.
// Configurar este URL + "/webhook/whatsapp" no painel do Twilio Sandbox.
app.post('/webhook/whatsapp', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const from = req.body.From; // ex: "whatsapp:+351912345678"
    const userText = req.body.Body || '';

    if (!from || !userText) {
      twiml.message('Não recebi nenhuma mensagem de texto.');
      return res.type('text/xml').send(twiml.toString());
    }

    const cfg = loadConfig();

    if (!whatsappConversations.has(from)) {
      whatsappConversations.set(from, []);
    }
    const history = whatsappConversations.get(from);
    history.push({ role: 'user', content: userText });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: buildSystemPrompt(cfg),
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
        appendLead({ ...lead, channel: 'whatsapp', from });
      } catch (e) {
        console.error('Não consegui interpretar o lead capturado:', e.message);
      }
    }

    history.push({ role: 'assistant', content: full });
    whatsappConversations.set(from, history);

    twiml.message(displayText || 'Desculpa, não percebi. Podes repetir?');
    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('Erro no webhook do WhatsApp:', err.message);
    twiml.message('Desculpa, tive um problema técnico. Tenta novamente daqui a pouco.');
    res.type('text/xml').send(twiml.toString());
  }
});

// Endpoint simples para veres os leads capturados (WhatsApp + web).
// Em produção, protege isto com password ou liga a um CRM em vez disto.
app.get('/leads', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  try {
    const leads = JSON.parse(fs.readFileSync(path.join(__dirname, 'leads.json'), 'utf-8'));
    res.json(leads);
  } catch (e) {
    res.json([]);
  }
});

// ---- Green API (WhatsApp via QR code) ----
// Documentação: https://green-api.com
const GREENAPI_ID_INSTANCE = process.env.GREENAPI_ID_INSTANCE;
const GREENAPI_API_TOKEN = process.env.GREENAPI_API_TOKEN;

async function sendGreenApiMessage(chatId, message) {
  if (!GREENAPI_ID_INSTANCE || !GREENAPI_API_TOKEN) {
    console.error('GREENAPI_ID_INSTANCE ou GREENAPI_API_TOKEN em falta no .env');
    return;
  }
  const url = `https://api.green-api.com/waInstance${GREENAPI_ID_INSTANCE}/sendMessage/${GREENAPI_API_TOKEN}`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message })
  });
}

async function handleIncomingMessage(chatId, userText) {
  const cfg = loadConfig();

  if (!whatsappConversations.has(chatId)) {
    whatsappConversations.set(chatId, []);
  }
  const history = whatsappConversations.get(chatId);
  history.push({ role: 'user', content: userText });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: buildSystemPrompt(cfg),
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
      appendLead({ ...lead, channel: 'whatsapp', from: chatId });
    } catch (e) {
      console.error('Não consegui interpretar o lead capturado:', e.message);
    }
  }

  history.push({ role: 'assistant', content: full });
  whatsappConversations.set(chatId, history);

  await sendGreenApiMessage(chatId, displayText || 'Desculpa, não percebi. Podes repetir?');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Vai perguntando ativamente ao Green API se há mensagens novas (em vez de
// depender de um webhook automático, que nem todos os planos suportam bem).
async function startGreenApiPolling() {
  if (!GREENAPI_ID_INSTANCE || !GREENAPI_API_TOKEN) {
    console.log('Green API não configurado — polling de WhatsApp desativado.');
    return;
  }
  console.log('A iniciar polling do Green API para o WhatsApp...');

  while (true) {
    try {
      const url = `https://api.green-api.com/waInstance${GREENAPI_ID_INSTANCE}/receiveNotification/${GREENAPI_API_TOKEN}?receiveTimeout=20`;
      const res = await fetch(url);

      if (!res.ok) {
        await sleep(3000);
        continue;
      }

      const data = await res.json();
      if (!data) continue; // nada de novo, volta a perguntar

      const { receiptId, body } = data;

      try {
        if (body?.typeWebhook === 'incomingMessageReceived') {
          const chatId = body.senderData?.chatId;
          const userText =
            body.messageData?.textMessageData?.textMessage ||
            body.messageData?.extendedTextMessageData?.text ||
            '';
          if (chatId && userText) {
            await handleIncomingMessage(chatId, userText);
          }
        }
      } catch (procErr) {
        console.error('Erro a processar mensagem do WhatsApp:', procErr.message);
      } finally {
        // Confirma ao Green API que já processámos esta notificação.
        const delUrl = `https://api.green-api.com/waInstance${GREENAPI_ID_INSTANCE}/deleteNotification/${GREENAPI_API_TOKEN}/${receiptId}`;
        await fetch(delUrl, { method: 'DELETE' }).catch(() => {});
      }
    } catch (err) {
      console.error('Erro no polling do Green API:', err.message);
      await sleep(5000);
    }
  }
}

// Endpoint que o Green API chama sempre que chega uma mensagem de WhatsApp
// (mantido como alternativa, caso o webhook automático funcione no teu plano).
app.post('/webhook/greenapi', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.typeWebhook !== 'incomingMessageReceived') return;
    const chatId = body.senderData?.chatId;
    const userText =
      body.messageData?.textMessageData?.textMessage ||
      body.messageData?.extendedTextMessageData?.text ||
      '';
    if (!chatId || !userText) return;
    await handleIncomingMessage(chatId, userText);
  } catch (err) {
    console.error('Erro no webhook do Green API:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor do agente a correr em http://localhost:${PORT}`);
  startGreenApiPolling(); // não bloqueia o arranque do servidor
});
