# Agente IA — Demo (FAQ + qualificação de leads)

Este projeto tem duas partes:
- `server.js` — um pequeno servidor que guarda a tua chave da API da Anthropic em segredo e fala com o modelo.
- `public/index.html` — a interface (configuração do negócio + chat + leads capturados), que agora fala com o teu servidor em vez de falar diretamente com a Anthropic.

## Porque isto é necessário

Um ficheiro HTML sozinho, aberto no browser, nunca pode chamar a API da Anthropic diretamente:
1. Precisa de uma chave de API válida — e essa chave nunca deve aparecer no código de uma página (qualquer pessoa que veja o código-fonte pode copiá-la e usá-la à tua custa).
2. Mesmo sem essa preocupação, a Anthropic bloqueia por segurança pedidos feitos diretamente do browser para a API.

Por isso a chave fica só no servidor, e o browser fala com o teu servidor.

## Como correr localmente

1. Certifica-te que tens o [Node.js](https://nodejs.org) instalado (versão 18 ou superior).
2. Neste diretório, corre:
   ```
   npm install
   ```
3. Copia o `.env.example` para `.env`:
   ```
   cp .env.example .env
   ```
4. Vai a [console.anthropic.com](https://console.anthropic.com), cria uma chave de API, e cola-a no `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
5. Arranca o servidor:
   ```
   npm start
   ```
6. Abre o browser em `http://localhost:3000`.

A partir daqui, qualquer pessoa na tua rede local (ou tu próprio) consegue testar o agente sem erros.

## Como pôr isto online para mostrares a clientes

Localmente só funciona no teu computador. Para teres um link que podes enviar a um cliente, precisas de alojar isto num serviço. Opções simples e baratas:
- **Render** (render.com) — plano gratuito para testes, fácil de configurar.
- **Railway** (railway.app) — também simples, bom para protótipos.

Em qualquer um destes, o processo é parecido:
1. Sobes este código para um repositório no GitHub.
2. Ligas o repositório ao Render/Railway.
3. Defines a variável de ambiente `ANTHROPIC_API_KEY` nas definições do serviço (nunca no código).
4. O serviço dá-te um URL público (ex: `https://o-teu-agente.onrender.com`).

## Ligar ao WhatsApp (Twilio Sandbox)

O servidor já tem um endpoint pronto em `/webhook/whatsapp`. Para o ligar ao WhatsApp:

1. Cria conta em [twilio.com](https://www.twilio.com) (tem plano gratuito com créditos de teste).
2. No painel, vai a **Messaging → Try it out → Send a WhatsApp message**. Isto ativa o "WhatsApp Sandbox" — um número de teste da Twilio que qualquer pessoa pode usar temporariamente.
3. Segue as instruções do Twilio para "entrares" no sandbox a partir do teu próprio WhatsApp (normalmente é enviar uma palavra-código para o número deles).
4. O teu projeto já está online no Render (ex: `https://agentes-demo.onrender.com`). No painel do Twilio, em **Sandbox Settings**, cola este URL no campo "WHEN A MESSAGE COMES IN":
   ```
   https://agentes-demo.onrender.com/webhook/whatsapp
   ```
   Método: `HTTP POST`.
5. Guarda. Agora, qualquer mensagem enviada para o número do sandbox chega ao teu agente, e a resposta dele volta automaticamente pelo WhatsApp.

**Importante:** o Sandbox é só para testes — qualquer pessoa que "entre" no mesmo sandbox partilha o mesmo número. Para um cliente real, precisas de pedir um número de WhatsApp Business próprio através do Twilio (processo de aprovação da Meta, feito dentro do painel do Twilio).

**Configurar o negócio:** edita o ficheiro `config.json` na raiz do projeto com a informação desse cliente (nome, horário, serviços, FAQ) — é isso que o agente usa nas respostas por WhatsApp. Depois de editares, precisas de fazer novo deploy no Render para a alteração ter efeito.

**Ver os leads capturados:** abre `https://agentes-demo.onrender.com/leads` no browser — mostra em JSON todos os leads capturados por WhatsApp e pelo chat web. Isto é propositadamente simples; num produto real, liga isto a um Google Sheets, email automático, ou CRM.

## Credenciais dos clientes de WhatsApp (`clients.json`) — IMPORTANTE

O `clients.json` guarda os tokens reais do Green API de cada cliente (`greenapi.apiToken`) e por isso **não deve ser commitado no GitHub**. Este ficheiro está agora no `.gitignore`; usa o `clients.example.json` como modelo.

**Localmente:** copia `clients.example.json` para `clients.json` e preenche com as credenciais reais (esse ficheiro fica só na tua máquina, nunca é enviado ao GitHub).

**No Render (produção):** o `lib/clients.js` procura primeiro um "Secret File" em `/etc/secrets/clients.json` antes de olhar para o `clients.json` local. Para configurar:
1. No painel do serviço no Render, vai a **Environment → Secret Files**.
2. Cria um ficheiro com o caminho `/etc/secrets/clients.json` e cola lá o conteúdo completo do teu `clients.json` real (com os tokens verdadeiros).
3. Faz deploy/redeploy — o servidor passa a carregar as credenciais a partir daí, nunca do repositório.

**Se o repositório já teve tokens reais commitados antes (era o caso deste projeto):** considera esses tokens comprometidos, mesmo depois de removidos do ficheiro — continuam visíveis no histórico do Git. Vai a [console.green-api.com](https://console.green-api.com) e regenera (rotate) o `apiToken` de cada instância afetada assim que possível, e usa só os tokens novos no Secret File do Render.

## Próximos passos possíveis

- Guardar os leads capturados numa base de dados ou enviá-los por email/Google Sheets automaticamente, em vez de só aparecerem no ecrã.
- Ligar isto a um canal real como WhatsApp Business API, em vez do chat de demonstração.
- Adicionar autenticação simples se fores mostrar isto a vários clientes ao mesmo tempo, para cada um ter a sua configuração guardada.
