require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { startEconomyBot } = require('./economy');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  await startEconomyBot(message);
});

client.login(process.env.DISCORD_TOKEN);
