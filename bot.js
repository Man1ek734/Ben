import 'dotenv/config';
import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID || '1566469722365493340';

if (!token || !clientId) {
  console.error('Uzupełnij DISCORD_TOKEN i DISCORD_CLIENT_ID w pliku .env');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Sprawdź, czy bot działa'),
  new SlashCommandBuilder().setName('pomoc').setDescription('Pokaż dostępne komendy'),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Usuń wybraną liczbę wiadomości')
    .addIntegerOption(option => option.setName('liczba').setDescription('Od 1 do 100').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, readyClient => {
  console.log(`Bot zalogowany: ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'ping') {
      await interaction.reply({ content: 'Pong! Bot działa.', ephemeral: true });
    } else if (interaction.commandName === 'pomoc') {
      await interaction.reply({ content: 'Komendy: /ping, /pomoc, /clear', ephemeral: true });
    } else if (interaction.commandName === 'clear') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({ content: 'Nie masz uprawnienia Zarządzanie wiadomościami.', ephemeral: true });
        return;
      }
      if (!interaction.channel?.bulkDelete) {
        await interaction.reply({ content: 'Na tym kanale nie można usuwać wiadomości hurtowo.', ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const amount = interaction.options.getInteger('liczba', true);
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await interaction.editReply(`Usunięto ${deleted.size} wiadomości. Wiadomości starszych niż 14 dni nie można usunąć tą metodą.`);
    }
  } catch (error) {
    console.error(error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('Wystąpił błąd podczas wykonywania komendy.').catch(console.error);
    } else {
      await interaction.reply({ content: 'Wystąpił błąd podczas wykonywania komendy.', ephemeral: true }).catch(console.error);
    }
  }
});

client.login(token);
