require("dotenv").config();

const fs = require("fs");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const app = express();
app.get("/", (req, res) => res.send("Kerobot activo"));
app.listen(process.env.PORT || 3000, () => console.log("Web activa para Render"));

const DATA_FILE = "./data.json";

const DEFAULT_DATA = {
  panelChannelId: null,
  panelMessageId: null,
  alertChannelId: null,
  alertMessageId: null,
  daily: {
    desguaces: { name: "Desguaces", emoji: "🧰", count: 0, max: 4 },
    atm: { name: "ATM", emoji: "🏧", count: 0, max: 3 },
    saqueos: { name: "Saqueos de vehículos", emoji: "🚗", count: 0, max: 8 },
    ropa: { name: "Tienda de ropa", emoji: "👕", count: 0, max: 1, doneBy: null },
    badulaques: { name: "Badulaques / Licorerías", emoji: "🥃", count: 0, max: 1, doneBy: null },
    casa: { name: "Casa", emoji: "🏠", count: 0, max: 1, doneBy: null }
  },
  weekly: {
    farmacia: { name: "Farmacia", emoji: "💊", count: 0, max: 2 },
    pawn: { name: "Pawn", emoji: "💍", count: 0, max: 2 },
    ammu: { name: "Ammu", emoji: "🔫", count: 0, max: 1, doneBy: null },
    almacen1: { name: "Almacén LVL 1", emoji: "📦", count: 0, max: 1, doneBy: null },
    almacen2: { name: "Almacén LVL 2", emoji: "🏗️", count: 0, max: 1, doneBy: null },
    blindado: { name: "Blindado", emoji: "🚚", count: 0, max: 1, doneBy: null }
  },
  biweekly: {
    fleeca: { name: "Fleeca", emoji: "🏦", count: 0, max: 1, doneBy: null },
    joyeria: { name: "Joyería", emoji: "💎", count: 0, max: 1, doneBy: null }
  },
  lastDailyReset: "",
  lastWeeklyReset: "",
  lastBiweeklyResetWeek: null
};

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return structuredClone(DEFAULT_DATA);
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  return mergeDefaults(structuredClone(DEFAULT_DATA), saved);
}

function mergeDefaults(defaults, saved) {
  for (const key of Object.keys(saved)) {
    if (
      saved[key] &&
      typeof saved[key] === "object" &&
      !Array.isArray(saved[key]) &&
      defaults[key] &&
      typeof defaults[key] === "object"
    ) {
      defaults[key] = mergeDefaults(defaults[key], saved[key]);
    } else {
      defaults[key] = saved[key];
    }
  }
  return defaults;
}

let data = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function progressBar(count, max) {
  const total = 8;
  const filled = Math.round((count / max) * total);
  return "█".repeat(filled) + "░".repeat(total - filled);
}

function line(item) {
  const done = item.count >= item.max;
  const status = done ? "✅" : "❌";
  const by = item.max === 1 && item.doneBy ? `\n> Hecho por: <@${item.doneBy}>` : "";
  return `${item.emoji} **${item.name}** ${status}\n\`${progressBar(item.count, item.max)}\` **${item.count}/${item.max}**${by}`;
}

function buildEmbed() {
  const dailyRepeat = Object.values(data.daily).filter(x => x.max > 1).map(line).join("\n\n");
  const dailyUnique = Object.values(data.daily).filter(x => x.max === 1).map(line).join("\n\n");
  const weekly = Object.values(data.weekly).map(line).join("\n\n");
  const biweekly = Object.values(data.biweekly).map(line).join("\n\n");

  return new EmbedBuilder()
    .setColor(0x8b0000)
    .setTitle("⛩️ YAKUZA TANAKA — PANEL DE ROBOS")
    .setDescription("Sistema interno de control de robos.\nPulsa un botón para marcar avances.")
    .addFields(
      { name: "📅 ROBOS DIARIOS", value: dailyRepeat || "Sin datos", inline: false },
      { name: "🔒 DIARIOS ÚNICOS", value: dailyUnique || "Sin datos", inline: false },
      { name: "📆 ROBOS SEMANALES", value: weekly || "Sin datos", inline: false },
      { name: "🌓 CADA 2 SEMANAS", value: biweekly || "Sin datos", inline: false }
    )
    .setFooter({ text: "Reinicio diario: 04:00 · Semanal: domingo 04:00" })
    .setTimestamp();
}

function makeButtons(groupName, group) {
  const rows = [];
  let current = new ActionRowBuilder();

  for (const [key, item] of Object.entries(group)) {
    if (current.components.length === 5) {
      rows.push(current);
      current = new ActionRowBuilder();
    }

    current.addComponents(
      new ButtonBuilder()
        .setCustomId(`robbery:${groupName}:${key}`)
        .setLabel(item.name.slice(0, 80))
        .setEmoji(item.emoji)
        .setStyle(item.count >= item.max ? ButtonStyle.Secondary : ButtonStyle.Danger)
        .setDisabled(item.count >= item.max)
    );
  }

  if (current.components.length > 0) rows.push(current);
  return rows;
}

function buildRows() {
  return [
    ...makeButtons("daily", data.daily),
    ...makeButtons("weekly", data.weekly),
    ...makeButtons("biweekly", data.biweekly),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("refresh_panel")
        .setLabel("Actualizar")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("undo_last")
        .setLabel("Deshacer no disponible")
        .setEmoji("↩️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    )
  ].slice(0, 5);
}

async function updatePanel() {
  if (!data.panelChannelId || !data.panelMessageId) return;

  try {
    const channel = await client.channels.fetch(data.panelChannelId);
    const msg = await channel.messages.fetch(data.panelMessageId);
    await msg.edit({ embeds: [buildEmbed()], components: buildRows() });
  } catch (err) {
    console.log("No se pudo actualizar el panel:", err.message);
  }
}

function pendingText() {
  const groups = [
    ["Diarios", data.daily],
    ["Semanales", data.weekly],
    ["Cada 2 semanas", data.biweekly]
  ];

  let text = "## ⚠️ Robos pendientes\n\n";
  let hasPending = false;

  for (const [title, group] of groups) {
    const pending = Object.values(group)
      .filter(x => x.count < x.max)
      .map(x => `${x.emoji} **${x.name}** — ${x.count}/${x.max}`);

    if (pending.length) {
      hasPending = true;
      text += `### ${title}\n${pending.join("\n")}\n\n`;
    }
  }

  if (!hasPending) text += "✅ Todo completado. Buen trabajo.\n";
  text += "\n_El mensaje se actualiza solo. No spamea el canal._";
  return text;
}

async function updateAlertMessage(channel) {
  try {
    if (data.alertMessageId) {
      try {
        const old = await channel.messages.fetch(data.alertMessageId);
        await old.edit(pendingText());
        return;
      } catch {}
    }

    const msg = await channel.send(pendingText());
    data.alertChannelId = channel.id;
    data.alertMessageId = msg.id;
    saveData();
  } catch (err) {
    console.log("Error actualizando alerta:", err.message);
  }
}

function resetGroup(group) {
  for (const item of Object.values(group)) {
    item.count = 0;
    if ("doneBy" in item) item.doneBy = null;
  }
}

function nowMadrid() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function weekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

async function checkResetsAndAlerts() {
  const d = nowMadrid();
  const hour = d.getHours();
  const min = d.getMinutes();
  const today = isoDate(d);

  if (hour === 1 && min === 0 && data.lastDailyReset !== today) {
    resetGroup(data.daily);
    data.lastDailyReset = today;
    saveData();
    await updatePanel();
  }

  if (d.getDay() === 1 && hour === 0 && min === 0 && data.lastWeeklyReset !== today) {
    resetGroup(data.weekly);
    data.lastWeeklyReset = today;

    const week = weekNumber(d);
    if (data.lastBiweeklyResetWeek === null || Math.abs(week - data.lastBiweeklyResetWeek) >= 2) {
      resetGroup(data.biweekly);
      data.lastBiweeklyResetWeek = week;
    }

    saveData();
    await updatePanel();
  }

  const shouldAlert =
    (hour === 20 && min === 0) ||
    (hour === 3 && min === 30);

  if (shouldAlert) {
    const channelId = data.alertChannelId || data.panelChannelId;
    if (channelId) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel) await updateAlertMessage(channel);
    }
  }
}

client.once("ready", async () => {
  console.log(`Conectado como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("panelrobos")
      .setDescription("Crea el panel principal de robos"),
    new SlashCommandBuilder()
      .setName("alertarobos")
      .setDescription("Crea o actualiza el mensaje fijo de alertas"),
    new SlashCommandBuilder()
      .setName("resetrobos")
      .setDescription("Resetea robos manualmente")
      .addStringOption(opt =>
        opt.setName("tipo")
          .setDescription("Qué quieres resetear")
          .setRequired(true)
          .addChoices(
            { name: "Diarios", value: "daily" },
            { name: "Semanales", value: "weekly" },
            { name: "Cada 2 semanas", value: "biweekly" },
            { name: "Todo", value: "all" }
          )
      )
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log("Comandos registrados");
  setInterval(checkResetsAndAlerts, 60 * 1000);
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "panelrobos") {
        const msg = await interaction.reply({
          embeds: [buildEmbed()],
          components: buildRows(),
          fetchReply: true
        });

        data.panelChannelId = interaction.channelId;
        data.panelMessageId = msg.id;
        saveData();
        return;
      }

      if (interaction.commandName === "alertarobos") {
        await interaction.deferReply({ ephemeral: true });
        data.alertChannelId = interaction.channelId;
        saveData();
        await updateAlertMessage(interaction.channel);
        await interaction.editReply("Mensaje fijo de alertas creado/actualizado.");
        return;
      }

      if (interaction.commandName === "resetrobos") {
        const tipo = interaction.options.getString("tipo");

        if (tipo === "daily" || tipo === "all") resetGroup(data.daily);
        if (tipo === "weekly" || tipo === "all") resetGroup(data.weekly);
        if (tipo === "biweekly" || tipo === "all") resetGroup(data.biweekly);

        saveData();
        await updatePanel();
        await interaction.reply({ content: "Robos reseteados.", ephemeral: true });
        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "refresh_panel") {
        await interaction.update({ embeds: [buildEmbed()], components: buildRows() });
        return;
      }

      const [prefix, groupName, key] = interaction.customId.split(":");
      if (prefix !== "robbery") return;

      const item = data[groupName]?.[key];
      if (!item) {
        await interaction.reply({ content: "Ese robo ya no existe.", ephemeral: true });
        return;
      }

      if (item.count >= item.max) {
        await interaction.reply({ content: "Ese robo ya está completado.", ephemeral: true });
        return;
      }

      item.count += 1;
      if (item.max === 1) item.doneBy = interaction.user.id;

      saveData();

      await interaction.update({
        embeds: [buildEmbed()],
        components: buildRows()
      });

      const alertChannelId = data.alertChannelId;
      if (alertChannelId) {
        const ch = await client.channels.fetch(alertChannelId).catch(() => null);
        if (ch) await updateAlertMessage(ch);
      }
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Ha fallado algo, mira los logs de Render.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);
