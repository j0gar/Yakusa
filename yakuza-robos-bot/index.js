require('dotenv').config();

const fs = require('fs');
const path = require('path');
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
  Events,
} = require('discord.js');

const DATA_FILE = path.join(__dirname, 'data.json');
const TZ = 'Europe/Madrid';

const ROBOS = [
  { id: 'desguaces', nombre: 'Desguaces', limite: 4, tipo: 'diario' },
  { id: 'atm', nombre: 'ATM', limite: 3, tipo: 'diario' },
  { id: 'saqueos_vehiculos', nombre: 'Saqueos de vehículos', limite: 8, tipo: 'diario' },
  { id: 'tienda_ropa', nombre: 'Tienda de ropa', limite: 1, tipo: 'diario' },
  { id: 'badulaques', nombre: 'Badulaques / licorerías', limite: 1, tipo: 'diario' },
  { id: 'casa', nombre: 'Casa', limite: 1, tipo: 'diario' },

  { id: 'farmacia', nombre: 'Farmacia', limite: 2, tipo: 'semanal' },
  { id: 'pawn', nombre: 'Pawn', limite: 2, tipo: 'semanal' },
  { id: 'ammu', nombre: 'Ammu', limite: 1, tipo: 'semanal' },
  { id: 'almacen_lvl1', nombre: 'Almacenes lvl1', limite: 1, tipo: 'semanal' },
  { id: 'almacen_lvl2', nombre: 'Almacenes lvl2', limite: 1, tipo: 'semanal' },
  { id: 'blindado', nombre: 'Blindado', limite: 1, tipo: 'semanal' },

  { id: 'fleeca', nombre: 'Fleeca', limite: 1, tipo: 'quincenal' },
  { id: 'joyeria', nombre: 'Joyería', limite: 1, tipo: 'quincenal' },
];

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const base = {
      counts: Object.fromEntries(ROBOS.map(r => [r.id, 0])),
      lastReset: { diario: '', semanal: '', quincenal: '' },
      logs: [],
      panel: null,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(base, null, 2));
    return base;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function madridParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short',
  }).formatToParts(date);
  const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    ymd: `${obj.year}-${obj.month}-${obj.day}`,
    hour: Number(obj.hour),
    minute: Number(obj.minute),
    weekday: obj.weekday,
    weekKey: getWeekKey(date),
  };
}

function getWeekKey(date = new Date()) {
  const d = new Date(date.toLocaleString('en-US', { timeZone: TZ }));
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return `${d.getFullYear()}-W${1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)}`;
}

function getBiweekKey(date = new Date()) {
  const week = Number(getWeekKey(date).split('W')[1]);
  const year = getWeekKey(date).split('-W')[0];
  return `${year}-B${Math.floor((week - 1) / 2) + 1}`;
}

function resetIfNeeded(data) {
  const now = madridParts();
  if (now.hour < 4) return false;

  let changed = false;

  if (data.lastReset.diario !== now.ymd) {
    ROBOS.filter(r => r.tipo === 'diario').forEach(r => data.counts[r.id] = 0);
    data.lastReset.diario = now.ymd;
    changed = true;
  }

  if (now.weekday === 'Sun' && data.lastReset.semanal !== now.weekKey) {
    ROBOS.filter(r => r.tipo === 'semanal').forEach(r => data.counts[r.id] = 0);
    data.lastReset.semanal = now.weekKey;
    changed = true;
  }

  const biweekKey = getBiweekKey();
  if (now.weekday === 'Sun' && data.lastReset.quincenal !== biweekKey) {
    ROBOS.filter(r => r.tipo === 'quincenal').forEach(r => data.counts[r.id] = 0);
    data.lastReset.quincenal = biweekKey;
    changed = true;
  }

  if (changed) saveData(data);
  return changed;
}

function bar(count, limit) {
  const full = '█'.repeat(Math.min(count, limit));
  const empty = '░'.repeat(Math.max(limit - count, 0));
  return `${full}${empty}`;
}

function section(data, tipo) {
  return ROBOS.filter(r => r.tipo === tipo).map(r => {
    const c = data.counts[r.id] || 0;
    const ok = c >= r.limite ? '✅' : '⬜';
    return `${ok} **${r.nombre}** — ${c}/${r.limite} \`${bar(c, r.limite)}\``;
  }).join('\n');
}

function makeEmbed(data) {
  return new EmbedBuilder()
    .setTitle('🐉 Yakuza Tanaka — Checklist de robos')
    .setColor(0x8b0000)
    .setDescription('Pulsa el botón del robo realizado para sumarlo. Usa “Restar” si alguien se equivoca.')
    .addFields(
      { name: '📅 Robos diarios', value: section(data, 'diario') },
      { name: '🗓️ Robos semanales', value: section(data, 'semanal') },
      { name: '⛩️ Robos cada 2 semanas', value: section(data, 'quincenal') },
      { name: '🔄 Reinicios', value: 'Diarios: **04:00**\nSemanales: **domingo 04:00**\nQuincenales: **domingo 04:00**' }
    )
    .setFooter({ text: 'Sistema de control interno' })
    .setTimestamp();
}

function makeRows() {
  const rows = [];
  let current = [];
  for (const r of ROBOS) {
    current.push(new ButtonBuilder()
      .setCustomId(`add:${r.id}`)
      .setLabel(`+ ${r.nombre}`.slice(0, 80))
      .setStyle(ButtonStyle.Secondary));
    if (current.length === 5) {
      rows.push(new ActionRowBuilder().addComponents(current));
      current = [];
    }
  }
  if (current.length) rows.push(new ActionRowBuilder().addComponents(current));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('undo').setLabel('Restar último').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('refresh').setLabel('Actualizar').setStyle(ButtonStyle.Primary)
  ));

  return rows.slice(0, 5);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function updatePanel() {
  const data = loadData();
  resetIfNeeded(data);
  if (!data.panel) return;

  try {
    const channel = await client.channels.fetch(data.panel.channelId);
    const message = await channel.messages.fetch(data.panel.messageId);
    await message.edit({ embeds: [makeEmbed(data)], components: makeRows() });
  } catch (e) {
    console.error('No pude actualizar el panel:', e.message);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Conectado como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('panelrobos')
      .setDescription('Crea el panel de robos de Yakuza Tanaka'),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  setInterval(updatePanel, 60 * 1000);
  updatePanel();
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'panelrobos') {
    const data = loadData();
    resetIfNeeded(data);
    const msg = await interaction.channel.send({ embeds: [makeEmbed(data)], components: makeRows() });
    data.panel = { channelId: msg.channel.id, messageId: msg.id };
    saveData(data);
    await interaction.reply({ content: 'Panel de robos creado.', ephemeral: true });
    return;
  }

  if (!interaction.isButton()) return;

  const data = loadData();
  resetIfNeeded(data);

  if (interaction.customId.startsWith('add:')) {
    const id = interaction.customId.split(':')[1];
    const robo = ROBOS.find(r => r.id === id);
    if (!robo) return interaction.reply({ content: 'Robo no encontrado.', ephemeral: true });

    const current = data.counts[id] || 0;
    if (current >= robo.limite) {
      return interaction.reply({ content: `${robo.nombre} ya está completo: ${current}/${robo.limite}.`, ephemeral: true });
    }

    data.counts[id] = current + 1;
    data.logs.push({ id, userId: interaction.user.id, userTag: interaction.user.tag, at: new Date().toISOString() });
    saveData(data);
    await interaction.update({ embeds: [makeEmbed(data)], components: makeRows() });
    return;
  }

  if (interaction.customId === 'undo') {
    const last = data.logs.pop();
    if (!last) return interaction.reply({ content: 'No hay nada que restar.', ephemeral: true });
    data.counts[last.id] = Math.max((data.counts[last.id] || 0) - 1, 0);
    saveData(data);
    await interaction.update({ embeds: [makeEmbed(data)], components: makeRows() });
    return;
  }

  if (interaction.customId === 'refresh') {
    saveData(data);
    await interaction.update({ embeds: [makeEmbed(data)], components: makeRows() });
  }
});

client.login(process.env.TOKEN);
