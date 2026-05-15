require('dotenv').config();

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const TZ = process.env.TZ || 'Europe/Madrid';
const STATE_PATH = path.join(__dirname, 'state.json');

const robberies = [
  { id: 'desguaces', name: 'Desguaces', limit: 4, period: 'daily', emoji: '🔧' },
  { id: 'atm', name: 'ATM', limit: 3, period: 'daily', emoji: '💳' },
  { id: 'saqueos_vehiculos', name: 'Saqueos de vehículos', limit: 8, period: 'daily', emoji: '🚗' },
  { id: 'tienda_ropa', name: 'Tienda de ropa', limit: 1, period: 'daily', emoji: '👕' },
  { id: 'badulaques', name: 'Badulaques/licorerías', limit: 1, period: 'daily', emoji: '🏪' },
  { id: 'casa', name: 'Casa', limit: 1, period: 'daily', emoji: '🏠' },
  { id: 'farmacia', name: 'Farmacia', limit: 2, period: 'weekly', emoji: '💊' },
  { id: 'pawn', name: 'Pawn', limit: 2, period: 'weekly', emoji: '💍' },
  { id: 'ammu', name: 'Ammu', limit: 1, period: 'weekly', emoji: '🧰' },
  { id: 'almacen_lvl1', name: 'Almacenes lvl1', limit: 1, period: 'weekly', emoji: '📦' },
  { id: 'almacen_lvl2', name: 'Almacenes lvl2', limit: 1, period: 'weekly', emoji: '📦' },
  { id: 'blindado', name: 'Blindado', limit: 1, period: 'weekly', emoji: '🚚' },
  { id: 'fleeca', name: 'Fleeca', limit: 1, period: 'biweekly', emoji: '🏦' },
  { id: 'joyeria', name: 'Joyería', limit: 1, period: 'biweekly', emoji: '💎' },
];

function defaultState() {
  return {
    counts: {},
    panelChannelId: null,
    panelMessageId: null,
    alertChannelId: null,
    alertMessageId: null,
    alertWebhookMessageId: null,
    lastDailyReset: null,
    lastWeeklyReset: null,
    lastBiweeklyReset: null,
    biweeklyCycleStart: null,
  };
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return defaultState();
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) };
  } catch (error) {
    console.error('No se pudo leer state.json:', error);
    return defaultState();
  }
}

let state = loadState();

function saveState() {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function getCount(id) {
  return state.counts[id] || 0;
}

function setCount(id, value) {
  const robbery = robberies.find((r) => r.id === id);
  state.counts[id] = Math.max(0, Math.min(value, robbery.limit));
  saveState();
}

function resetPeriod(period) {
  for (const robbery of robberies.filter((r) => r.period === period)) {
    state.counts[robbery.id] = 0;
  }
  saveState();
}

function todayKey() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function buildPanelEmbed() {
  const byPeriod = {
    daily: robberies.filter((r) => r.period === 'daily'),
    weekly: robberies.filter((r) => r.period === 'weekly'),
    biweekly: robberies.filter((r) => r.period === 'biweekly'),
  };

  const format = (items) => items.map((r) => {
    const count = getCount(r.id);
    const done = count >= r.limit;
    return `${done ? '✅' : '⬜'} ${r.emoji} **${r.name}** — ${count}/${r.limit}`;
  }).join('\n');

  return new EmbedBuilder()
    .setTitle('🐉 Yakuza Tanaka — Checklist de robos')
    .setDescription('Pulsa los botones para marcar cada robo realizado.')
    .addFields(
      { name: '📅 Diarios', value: format(byPeriod.daily) || 'Nada', inline: false },
      { name: '🗓️ Semanales', value: format(byPeriod.weekly) || 'Nada', inline: false },
      { name: '⏳ Cada 2 semanas', value: format(byPeriod.biweekly) || 'Nada', inline: false },
    )
    .setFooter({ text: 'Reset diario 04:00 · Reset semanal domingo 04:00' })
    .setColor(0x8b0000)
    .setTimestamp();
}

function buildRows() {
  const rows = [];
  let current = new ActionRowBuilder();

  robberies.forEach((r, index) => {
    if (index > 0 && index % 5 === 0) {
      rows.push(current);
      current = new ActionRowBuilder();
    }

    const count = getCount(r.id);
    current.addComponents(
      new ButtonBuilder()
        .setCustomId(`robbery:${r.id}`)
        .setLabel(`${r.name} ${count}/${r.limit}`.slice(0, 80))
        .setEmoji(r.emoji)
        .setStyle(count >= r.limit ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(count >= r.limit),
    );
  });

  if (current.components.length > 0) rows.push(current);
  return rows;
}

function pendingRobberies(periods = ['daily', 'weekly', 'biweekly']) {
  return robberies.filter((r) => periods.includes(r.period) && getCount(r.id) < r.limit);
}

function buildAlertEmbed(title = '⚠️ Robos pendientes') {
  const pendingDaily = pendingRobberies(['daily']);
  const pendingWeekly = pendingRobberies(['weekly']);
  const pendingBiweekly = pendingRobberies(['biweekly']);

  const format = (items) => items.length
    ? items.map((r) => `${r.emoji} **${r.name}** — ${getCount(r.id)}/${r.limit}`).join('\n')
    : '✅ Todo completado';

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription('Resumen automático de la actividad pendiente de **Yakuza Tanaka**.')
    .addFields(
      { name: '📅 Diarios', value: format(pendingDaily), inline: false },
      { name: '🗓️ Semanales', value: format(pendingWeekly), inline: false },
      { name: '⏳ Cada 2 semanas', value: format(pendingBiweekly), inline: false },
    )
    .setColor(pendingDaily.length || pendingWeekly.length || pendingBiweekly.length ? 0xff9900 : 0x2ecc71)
    .setFooter({ text: 'Mensaje de alertas único: se edita, no se spamea.' })
    .setTimestamp();
}

async function updatePanel(client) {
  if (!state.panelChannelId || !state.panelMessageId) return;
  try {
    const channel = await client.channels.fetch(state.panelChannelId);
    const msg = await channel.messages.fetch(state.panelMessageId);
    await msg.edit({ embeds: [buildPanelEmbed()], components: buildRows() });
  } catch (error) {
    console.error('No se pudo actualizar el panel:', error.message);
  }
}

async function upsertAlert(client, title = '⚠️ Robos pendientes') {
  const embed = buildAlertEmbed(title);
  const channelId = process.env.ALERT_CHANNEL_ID || state.alertChannelId || state.panelChannelId;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);

    if (state.alertMessageId) {
      try {
        const msg = await channel.messages.fetch(state.alertMessageId);
        await msg.edit({ embeds: [embed] });
        return;
      } catch (error) {
        console.error('No se pudo editar la alerta anterior. Creando una nueva:', error.message);
        state.alertMessageId = null;
        saveState();
      }
    }

    const sent = await channel.send({ embeds: [embed] });
    state.alertChannelId = channel.id;
    state.alertMessageId = sent.id;
    saveState();
  } catch (error) {
    console.error('No se pudo crear/actualizar la alerta:', error.message);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {
  console.log(`Bot conectado como ${client.user.tag}`);

  cron.schedule('0 4 * * *', async () => {
    const key = todayKey();
    if (state.lastDailyReset === key) return;
    resetPeriod('daily');
    state.lastDailyReset = key;
    saveState();
    await updatePanel(client);
    await upsertAlert(client, '🔄 Reinicio diario realizado');
  }, { timezone: TZ });

  cron.schedule('0 4 * * 0', async () => {
    const key = todayKey();
    if (state.lastWeeklyReset !== key) {
      resetPeriod('weekly');
      state.lastWeeklyReset = key;
    }

    if (!state.biweeklyCycleStart) state.biweeklyCycleStart = key;
    const lastBi = state.lastBiweeklyReset;
    const shouldBiweeklyReset = !lastBi || ((Date.now() - new Date(`${lastBi}T04:00:00`).getTime()) >= 13 * 24 * 60 * 60 * 1000);
    if (shouldBiweeklyReset && state.lastBiweeklyReset !== key) {
      resetPeriod('biweekly');
      state.lastBiweeklyReset = key;
    }

    saveState();
    await updatePanel(client);
    await upsertAlert(client, '🔄 Reinicio semanal realizado');
  }, { timezone: TZ });

  cron.schedule('0 20 * * *', async () => {
    await upsertAlert(client, '⚠️ Aviso de robos pendientes');
  }, { timezone: TZ });

  cron.schedule('30 3 * * *', async () => {
    await upsertAlert(client, '🚨 Último aviso antes del reset diario');
  }, { timezone: TZ });
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'panelrobos') {
        const sent = await interaction.channel.send({ embeds: [buildPanelEmbed()], components: buildRows() });
        state.panelChannelId = interaction.channel.id;
        state.panelMessageId = sent.id;
        if (!state.alertChannelId) state.alertChannelId = interaction.channel.id;
        saveState();
        await interaction.reply({ content: 'Panel de robos creado.', ephemeral: true });
        return;
      }

      if (interaction.commandName === 'alertarobos') {
        state.alertChannelId = interaction.channel.id;
        saveState();
        await upsertAlert(client, '⚠️ Robos pendientes');
        await interaction.reply({ content: 'Mensaje único de alertas creado/actualizado.', ephemeral: true });
        return;
      }

      if (interaction.commandName === 'resetrobos') {
        resetPeriod('daily');
        resetPeriod('weekly');
        resetPeriod('biweekly');
        await updatePanel(client);
        await upsertAlert(client, '🔄 Reset manual realizado');
        await interaction.reply({ content: 'Robos reiniciados.', ephemeral: true });
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('robbery:')) {
      const id = interaction.customId.split(':')[1];
      const robbery = robberies.find((r) => r.id === id);
      if (!robbery) return interaction.reply({ content: 'Robo no encontrado.', ephemeral: true });

      const count = getCount(id);
      if (count >= robbery.limit) {
        return interaction.reply({ content: 'Ese robo ya está completado.', ephemeral: true });
      }

      setCount(id, count + 1);
      await interaction.update({ embeds: [buildPanelEmbed()], components: buildRows() });
      await upsertAlert(client, '⚠️ Robos pendientes');
    }
  } catch (error) {
    console.error(error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Ha ocurrido un error.', ephemeral: true }).catch(() => {});
    }
  }
});

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName('panelrobos').setDescription('Crea el panel de checklist de robos'),
    new SlashCommandBuilder().setName('alertarobos').setDescription('Crea o actualiza el mensaje único de alertas en este canal'),
    new SlashCommandBuilder().setName('resetrobos').setDescription('Reinicia manualmente todos los robos'),
  ].map((cmd) => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log('Comandos registrados.');
}

if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error('Faltan TOKEN, CLIENT_ID o GUILD_ID en variables de entorno.');
  process.exit(1);
}

registerCommands()
  .then(() => client.login(process.env.TOKEN))
  .catch((error) => {
    console.error('Error iniciando el bot:', error);
    process.exit(1);
  });
