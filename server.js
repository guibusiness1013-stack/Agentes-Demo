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

app.listen(PORT, () => {
  console.log(`Servidor do agente a correr em http://localhost:${PORT}`);
});
