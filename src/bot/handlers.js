const handleMessage = require("./handleMessage");

async function HandleUserMessage(bot, msg) {
  await handleMessage(bot, msg);
}

module.exports = HandleUserMessage;
