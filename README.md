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

## Próximos passos possíveis

- Guardar os leads capturados numa base de dados ou enviá-los por email/Google Sheets automaticamente, em vez de só aparecerem no ecrã.
- Ligar isto a um canal real como WhatsApp Business API, em vez do chat de demonstração.
- Adicionar autenticação simples se fores mostrar isto a vários clientes ao mesmo tempo, para cada um ter a sua configuração guardada.
