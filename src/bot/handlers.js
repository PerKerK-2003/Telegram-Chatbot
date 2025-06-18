const handleMessage = require("./handleMessage");
const handleCommand = require("./handleCommand");

async function handleMessageOrCommand(bot, msg) {
  if (msg.text && msg.text.startsWith("/")) {
    const handled = handleCommand(bot, msg);
    if (handled) return;
  }
  await handleMessage(bot, msg);
}

module.exports = handleMessageOrCommand;
