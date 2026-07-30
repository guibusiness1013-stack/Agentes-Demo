require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERRO: falta a variável ANTHROPIC_API_KEY no ficheiro .env');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());
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

app.listen(PORT, () => {
  console.log(`Servidor do agente a correr em http://localhost:${PORT}`);
});
