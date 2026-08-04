async function sendMessage(client, chatId, message) {
  const { idInstance, apiToken } = client.greenapi;
  const url = `https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiToken}`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message })
  });
}

module.exports = { sendMessage };
