const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const DATA_FILE = path.join(__dirname, 'data', 'economy.json');
const PREFIX = '!';

const SHOP_ITEMS = {
  coffee: {
    name: 'Kaffee',
    price: 75,
    description: 'Ein kleiner Energieschub für deinen Tag.',
  },
  booster: {
    name: 'Booster',
    price: 150,
    description: 'Erhöht deinen Work-Gewinn um 20% für eine Runde.',
  },
  premium: {
    name: 'Premium-Token',
    price: 300,
    description: 'Ein exklusiver Token für besondere Extras.',
  },
};

function ensureDataFile() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '{}', 'utf8');
  }
}

function loadData() {
  ensureDataFile();

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getProfile(data, userId) {
  if (!data[userId]) {
    data[userId] = {
      wallet: 0,
      bank: 200,
      lastDaily: 0,
      lastWork: 0,
      lastRob: 0,
      inventory: {},
    };
  }

  return data[userId];
}

function formatMoney(amount) {
  return `${Number(amount).toLocaleString('de-DE')} Coins`;
}

function getLeaderboard(data) {
  return Object.entries(data)
    .map(([id, profile]) => ({
      id,
      total: (profile.wallet || 0) + (profile.bank || 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

function getCooldownLeft(lastTimestamp, cooldownMs) {
  if (!lastTimestamp) return 0;

  const elapsed = Date.now() - lastTimestamp;
  return Math.max(0, cooldownMs - elapsed);
}

async function startEconomyBot(message) {
  if (!message.content.startsWith(PREFIX)) return;
  if (message.author.bot) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();
  const data = loadData();
  const profile = getProfile(data, message.author.id);

  switch (command) {
    case 'help': {
      const embed = new EmbedBuilder()
        .setColor('#00b894')
        .setTitle('💰 Wirtschaftssystem')
        .setDescription('Verfügbare Befehle:')
        .addFields(
          { name: '📊 `!balance`', value: 'Zeigt Wallet, Bank und Gesamtstand an.', inline: false },
          { name: '💼 `!work`', value: 'Verdiene Coins alle 45 Sekunden.', inline: false },
          { name: '🎁 `!daily`', value: 'Erhalte einmal pro Tag eine Belohnung.', inline: false },
          { name: '🏦 `!deposit <betrag>`', value: 'Zahle Coins in die Bank.', inline: false },
          { name: '🏧 `!withdraw <betrag>`', value: 'Nimm Coins aus der Bank.', inline: false },
          { name: '💸 `!transfer @user <betrag>`', value: 'Überweise Coins an einen anderen Nutzer.', inline: false },
          { name: '🛍️ `!shop`', value: 'Zeigt die Shop-Items an.', inline: false },
          { name: '🛒 `!buy <item>`', value: 'Kaufe ein Item aus dem Shop.', inline: false },
          { name: '🎒 `!inventory`', value: 'Zeigt das Inventar an.', inline: false },
          { name: '🏆 `!leaderboard`', value: 'Zeigt die Top 10 an.', inline: false },
          { name: '🕶️ `!rob @user`', value: 'Versuche, Coins von einem anderen Nutzer zu stehlen.', inline: false }
        );

      await message.reply({ embeds: [embed] });
      break;
    }

    case 'balance':
    case 'bal': {
      const embed = new EmbedBuilder()
        .setColor('#0984e3')
        .setTitle(`💳 Kontostand von ${message.author.username}`)
        .addFields(
          { name: 'Wallet', value: formatMoney(profile.wallet || 0), inline: true },
          { name: 'Bank', value: formatMoney(profile.bank || 0), inline: true },
          { name: 'Gesamt', value: formatMoney((profile.wallet || 0) + (profile.bank || 0)), inline: true }
        );

      await message.reply({ embeds: [embed] });
      break;
    }

    case 'daily': {
      const oneDayMs = 24 * 60 * 60 * 1000;
      const timeLeft = getCooldownLeft(profile.lastDaily, oneDayMs);

      if (timeLeft > 0) {
        const hours = Math.ceil(timeLeft / (60 * 60 * 1000));
        await message.reply(`🎁 Du kannst deine tägliche Belohnung erst in etwa ${hours} Stunden erneut abholen.`);
        break;
      }

      profile.wallet += 200;
      profile.lastDaily = Date.now();
      saveData(data);

      await message.reply('🎁 Tägliche Belohnung erhalten: 200 Coins');
      break;
    }

    case 'work': {
      const cooldownMs = 45 * 1000;
      const timeLeft = getCooldownLeft(profile.lastWork, cooldownMs);

      if (timeLeft > 0) {
        const seconds = Math.ceil(timeLeft / 1000);
        await message.reply(`⏳ Du musst noch ${seconds} Sekunden warten, bevor du wieder arbeiten kannst.`);
        break;
      }

      let reward = Math.floor(Math.random() * 90) + 30;

      if (profile.inventory?.booster) {
        reward = Math.round(reward * 1.2);
        profile.inventory.booster -= 1;
        if (profile.inventory.booster <= 0) delete profile.inventory.booster;
      }

      profile.wallet += reward;
      profile.lastWork = Date.now();
      saveData(data);

      await message.reply(`💼 Arbeit erledigt! Du hast ${formatMoney(reward)} verdient.`);
      break;
    }

    case 'deposit':
    case 'dep': {
      const amount = Number(args[0]);

      if (!amount || amount <= 0 || amount > (profile.wallet || 0)) {
        await message.reply('❌ Bitte gib einen gültigen Betrag ein, den du im Wallet hast.');
        break;
      }

      profile.wallet -= amount;
      profile.bank += amount;
      saveData(data);

      await message.reply(`🏦 Du hast ${formatMoney(amount)} in die Bank eingezahlt.`);
      break;
    }

    case 'withdraw':
    case 'with': {
      const amount = Number(args[0]);

      if (!amount || amount <= 0 || amount > (profile.bank || 0)) {
        await message.reply('❌ Bitte gib einen gültigen Betrag ein, den du in der Bank hast.');
        break;
      }

      profile.bank -= amount;
      profile.wallet += amount;
      saveData(data);

      await message.reply(`🏧 Du hast ${formatMoney(amount)} aus der Bank abgehoben.`);
      break;
    }

    case 'transfer': {
      const recipient = message.mentions.users.first();
      const amount = Number(args[1]);

      if (!recipient || !amount || amount <= 0 || amount > (profile.wallet || 0)) {
        await message.reply('❌ Nutzung: `!transfer @user betrag`');
        break;
      }

      const targetProfile = getProfile(data, recipient.id);
      profile.wallet -= amount;
      targetProfile.wallet += amount;
      saveData(data);

      await message.reply(`💸 Du hast ${recipient.username} ${formatMoney(amount)} überwiesen.`);
      break;
    }

    case 'shop': {
      const embed = new EmbedBuilder()
        .setColor('#e17055')
        .setTitle('🛍️ Shop')
        .setDescription('Kaufe Items mit Coins.');

      Object.entries(SHOP_ITEMS).forEach(([key, item]) => {
        embed.addFields({
          name: `${item.name} (${key})`,
          value: `${item.description}\nPreis: ${formatMoney(item.price)}`,
          inline: false,
        });
      });

      await message.reply({ embeds: [embed] });
      break;
    }

    case 'buy': {
      const itemKey = args[0]?.toLowerCase();
      const item = SHOP_ITEMS[itemKey];

      if (!item) {
        await message.reply('❌ Dieses Item existiert nicht. Nutze `!shop` für eine Liste.');
        break;
      }

      if ((profile.wallet || 0) < item.price) {
        await message.reply(`❌ Du hast nicht genug Coins für ${item.name}.`);
        break;
      }

      profile.wallet -= item.price;
      profile.inventory[itemKey] = (profile.inventory[itemKey] || 0) + 1;
      saveData(data);

      await message.reply(`✅ Du hast ${item.name} gekauft.`);
      break;
    }

    case 'inventory':
    case 'inv': {
      const entries = Object.entries(profile.inventory || {});
      const embed = new EmbedBuilder()
        .setColor('#a29bfe')
        .setTitle(`🎒 Inventar von ${message.author.username}`);

      if (!entries.length) {
        embed.setDescription('Du hast noch keine Items im Inventar.');
      } else {
        embed.setDescription(
          entries
            .map(([item, count]) => `• ${SHOP_ITEMS[item]?.name || item}: ${count}x`)
            .join('\n')
        );
      }

      await message.reply({ embeds: [embed] });
      break;
    }

    case 'leaderboard':
    case 'lb': {
      const top = getLeaderboard(data);
      const embed = new EmbedBuilder()
        .setColor('#fdcb6e')
        .setTitle('🏆 Top 10 Wirtschaftsrangliste');

      if (!top.length) {
        embed.setDescription('Noch keine Einträge vorhanden.');
      } else {
        embed.setDescription(
          top
            .map((entry, index) => `${index + 1}. <@${entry.id}> — ${formatMoney(entry.total)}`)
            .join('\n')
        );
      }

      await message.reply({ embeds: [embed] });
      break;
    }

    case 'rob': {
      const victim = message.mentions.users.first();

      if (!victim || victim.id === message.author.id) {
        await message.reply('❌ Nutzung: `!rob @user`');
        break;
      }

      const robCooldownMs = 60 * 1000;
      const robTimeLeft = getCooldownLeft(profile.lastRob, robCooldownMs);

      if (robTimeLeft > 0) {
        const seconds = Math.ceil(robTimeLeft / 1000);
        await message.reply(`⏳ Du musst noch ${seconds} Sekunden warten, bevor du erneut ausrauben kannst.`);
        break;
      }

      const victimProfile = getProfile(data, victim.id);
      const victimTotal = (victimProfile.wallet || 0) + (victimProfile.bank || 0);

      if (victimTotal <= 0) {
        await message.reply('❌ Dieses Ziel hat keine Coins, die du stehlen kannst.');
        break;
      }

      profile.lastRob = Date.now();

      const success = Math.random() < 0.45;

      if (success) {
        const stolen = Math.floor(Math.random() * Math.min(100, victimTotal)) + 20;

        if ((victimProfile.wallet || 0) >= stolen) {
          victimProfile.wallet -= stolen;
        } else {
          const fromBank = stolen - (victimProfile.wallet || 0);
          victimProfile.wallet = 0;
          victimProfile.bank = Math.max(0, (victimProfile.bank || 0) - fromBank);
        }

        profile.wallet += stolen;
        saveData(data);

        await message.reply(`💰 Überfall erfolgreich! Du hast ${formatMoney(stolen)} gestohlen.`);
      } else {
        const penalty = Math.floor(Math.random() * 40) + 10;
        profile.wallet = Math.max(0, (profile.wallet || 0) - penalty);
        saveData(data);

        await message.reply(`🚨 Der Überfall ist misslungen! Du hast ${formatMoney(penalty)} verloren.`);
      }

      break;
    }

    default:
      await message.reply('❌ Unbekannter Befehl. Nutze `!help` für eine Liste.');
      break;
  }
}

module.exports = { startEconomyBot };
