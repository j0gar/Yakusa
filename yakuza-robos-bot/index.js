require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST
} = require('discord.js');

const express = require('express');
const app = express();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

const robos = {
  "Desguaces": { actual: 0, max: 4 },
  "ATM": { actual: 0, max: 3 },
  "Saqueos": { actual: 0, max: 8 },
  "Tienda ropa": { actual: 0, max: 1 },
  "Badulaques": { actual: 0, max: 1 },
  "Casa": { actual: 0, max: 1 }
};

client.once('ready', async () => {
  console.log(`Conectado como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('panelrobos')
      .setDescription('Muestra el panel de robos')
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log('Comandos registrados');
  } catch (err) {
    console.error(err);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'panelrobos') {

    let texto = '## Yakuza Tanaka\\n\\n';

    for (const [nombre, datos] of Object.entries(robos)) {
      texto += `• ${nombre}: ${datos.actual}/${datos.max}\\n`;
    }

    await interaction.reply(texto);
  }
});

app.get('/', (req, res) => {
  res.send('Kerobot activo');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Web activa');
});

client.login(process.env.TOKEN);
