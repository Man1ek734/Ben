import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, Partials
} from 'discord.js';
import { registerServerLogs } from './server-logs.js';
import { findManagedChannel, cleanupManagedDuplicates } from './channel-dedupe.js';
import { createWorkSystem } from './work-system.js';
import { createLeaveSystem } from './leave-system.js';
import { createAntiRaid } from './anti-raid.js';
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID || '1566469722365493340';
if (!token || !clientId) {
  console.error('Brak DISCORD_TOKEN lub DISCORD_CLIENT_ID w zmiennych środowiskowych.');
  process.exit(1);
}
const ranks = [
  { key: 'new', name: 'Nowy', color: 0x8892a2, permissions: 0n },
  { key: 'student', name: 'Uczeń', color: 0x779ba9, permissions: 0n },
  { key: 'intern', name: 'Praktykant', color: 0x5296ab, permissions: 0n },
  { key: 'mechanic1', name: 'Mechanik I Stopnia', color: 0x328bb3, permissions: 0n },
  { key: 'mechanic2', name: 'Mechanik II Stopnia', color: 0x287fae, permissions: 0n },
  { key: 'mechanic3', name: 'Mechanik III Stopnia', color: 0x1871b1, permissions: 0n },
  { key: 'mechanic4', name: 'Mechanik IV Stopnia', color: 0x1763b4, permissions: 0n },
  { key: 'specialist', name: 'Specjalista', color: 0x296ebc, permissions: 0n },
  { key: 'expert', name: 'Ekspert Mechaniki', color: 0x6562c4, permissions: 0n },
  { key: 'master', name: 'Mistrz Mechaniki', color: 0x9360c8, permissions: 0n },
  { key: 'leader', name: 'Lider Zespołu', color: 0xc171af, permissions: 0n, hoist: true },
  { key: 'foreman', name: 'Brygadzista', color: 0xd57b69, permissions: 0n, hoist: true },
  { key: 'manager', name: 'Kierownik', color: 0xd4504b, permissions: PermissionFlagsBits.ManageMessages, hoist: true },
  { key: 'director', name: 'Dyrektor LSC', color: 0xc93439, permissions: PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageMessages, hoist: true },
  { key: 'coowner', name: 'Współwłaściciel', color: 0xdca943, permissions: PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageMessages, hoist: true },
  { key: 'owner', name: 'Właściciel', color: 0xf5cd52, permissions: PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageMessages, hoist: true }
];
const legacyRoles = {
  'Praktykant': '🧰・Praktykant',
  'Mechanik I Stopnia': '🛠️・Młodszy Mechanik',
  'Mechanik II Stopnia': '🔧・Mechanik',
  'Mechanik III Stopnia': '🏆・Starszy Mechanik',
  'Kierownik': '📋・Kierownik',
  'Dyrektor LSC': '🎖️・Dyrektor',
  'Współwłaściciel': '💠・Współwłaściciel',
  'Właściciel': '👑・Właściciel'
};
const staffKeys = [...ranks.map(rank => rank.key), 'opiekunFirm'];
const managers = ['manager', 'director', 'coowner', 'owner', 'opiekunFirm'];
const executives = ['director', 'coowner', 'owner', 'opiekunFirm'];
const legacyMoves = {
  '📢〢ogloszenia': ['Informacje', '💬〢ogłoszenia'],
  '⭕〢wprowadzenie': ['🏁・START', '👋・start-tutaj'],
  '📜〢zasady': ['🏁・START', '📜・regulamin'],
  '💬〢ogłoszenia': ['🏁・START', '📢・ogłoszenia'],
  '🎫〢cennik': ['🚘・BENNY’S MOTOR WORKS', '💰・cennik'],
  '💬〢pracowniczy-chat': ['🔧・STREFA MECHANIKÓW', '💬・ekipa-chat'],
  '📌〢zarzad-chat': ['👑・ZARZĄD', '💬・zarząd-chat'],
  '💵〢wynagrodzenia': ['Informacje', '💵〢tygodniówki']
};
const layout = [
  {
    name: '▶ LOBBY ◀', area: 'public', channels: [
      ['text', '👋〢nowi', 'Powitanie nowych członków społeczności Benny’s.', 'welcome'],
      ['text', '🏷️〢prosba-o-range', 'Poproś kierownictwo o przydzielenie stopnia Benny’s.'],
      ['text', '📝〢rekrutacja', 'Informacje i rozmowy na temat rekrutacji do warsztatu.'],
      ['text', '📢〢ogloszenia', 'Oficjalne ogłoszenia Benny’s Original Motor Works.', 'announcements']
    ]
  },
  {
    name: '● TICKETY', area: 'public', channels: [
      ['text', '🟥〢wzór-podania', 'Wzór podania dla kandydatów.', 'form'],
      ['text', '🔴〢tickety', 'Pomoc i prywatne zgłoszenia: /ticket.', 'tickets']
    ]
  },
  {
    name: 'Współprace', area: 'public', channels: [
      ['text', '🤖〢partnerstwo', 'Informacje o partnerstwie.', 'partners'],
      ['text', '🚙〢partnerstwo', 'Współprace motoryzacyjne.', 'partners'],
      ['text', '😺〢partnerstwo', 'Współprace społecznościowe.', 'partners']
    ]
  },
  {
    name: 'Informacje', area: 'public', channels: [
      ['text', '💬〢zebrania', 'Komunikaty o zebraniach.', 'announcements', 'staff'],
      ['text', '💵〢wynagrodzenia', 'Raporty wypłat i przepracowanych godzin w każdą sobotę o 12:00.', '', 'staff'],
      ['text', '🎫〢cennik', 'Cennik usług Benny’s.', 'prices'],
      ['text', '⭕〢wprowadzenie', 'Najważniejsze informacje dla nowych członków.', 'start'],
      ['text', '📜〢zasady', 'Zasady serwera i pracy w Benny’s.', 'rules'],
      ['text', '📜〢czarna-lista', 'Wewnętrzna lista ograniczeń.', 'announcements', 'staff'],
      ['text', '📜〢changelog', 'Aktualizacje i zmiany.', 'announcements'],
      ['text', '⏰-wyrobione-godziny', 'Panel rozpoczęcia, przerwy i zakończenia pracy.', '', 'staff'],
      ['text', '💰〢godzinówki', 'Stawki godzinowe stopni Benny’s.', '', 'staff']
    ]
  },
  {
    name: '● Strefa Pracownika', area: 'staff', channels: [
      ['text', '💬〢pracowniczy-chat', 'Czat pracowników Benny’s.'],
      ['text', '🎥〢klipy', 'Nagrania z pracy.'],
      ['text', '📷〢fotki', 'Zdjęcia i realizacje pracowników.'],
      ['text', '📈〢awanse-degrady', 'Informacje o awansach i degradacjach.'],
      ['text', '📉〢zwolnienia', 'Informacje o zwolnieniach.'],
      ['text', '📉〢wypowiedzenia', 'Wypowiedzenia i sprawy kadrowe.'],
      ['text', '🧠〢plusy-minusy', 'Oceny pracy i uwagi.'],
      ['text', '🗓️〢urlopy', 'Zgłoszenia urlopowe.'],
      ['text', '📢〢reklama', 'Materiały reklamowe pracowników.'],
      ['text', '📣〢dostępność-zarządu', 'Godziny dostępności zarządu.'],
      ['text', '👖〢ubrania', 'Ubrania i stroje pracownicze.'],
      ['text', '🪪〢csn', 'Dane identyfikacyjne pracowników.']
    ]
  },
  {
    name: '● Zarząd-ZONE', area: 'executive', channels: [
      ['text', '📌〢ważne', 'Najważniejsze informacje zarządu.'],
      ['text', '📌〢notatnik', 'Notatki kierownictwa.'],
      ['text', '📌〢zarzad-chat', 'Prywatny czat zarządu.'],
      ['text', '📌〢auto-mod', 'Ustalenia dotyczące automoderacji.'],
      ['text', '📌〢webhooki', 'Konfiguracje webhooków i integracji.'],
      ['text', '📌〢wypłaty-firmowe', 'Wewnętrzne rozliczenia wynagrodzeń.'],
      ['text', '📜〢pracownicy', 'Spis pracowników i przydziały.'],
      ['text', 'reklama', 'Materiały promocyjne zatwierdzane przez zarząd.'],
      ['text', 'zebranie', 'Organizacja zebrań zarządu.'],
      ['text', 'csn-zarzad', 'Wewnętrzne sprawy zarządu CSN.']
    ]
  }

];
const readOnly = new Set(['welcome', 'start', 'rules', 'announcements', 'roles', 'offer', 'prices', 'tickets', 'form', 'partners']);
const ticketKinds = {
  pomoc: { label: 'Pomoc ogólna', emoji: '❓', description: 'Pytania i kontakt z ekipą Benny’s', staff: ['leader', 'foreman', 'manager', 'director', 'coowner', 'owner'] },
  rekrutacja: { label: 'Podanie o pracę', emoji: '📋', description: 'Rekrutacja do warsztatu', staff: ['manager', 'director', 'coowner', 'owner'] },
  skarga: { label: 'Skarga', emoji: '⚠️', description: 'Zgłoszenie problemu z pracownikiem', staff: ['director', 'coowner', 'owner'] },
  wspolpraca: { label: 'Współpraca', emoji: '🤝', description: 'Propozycja partnerstwa lub współpracy', staff: ['manager', 'director', 'coowner', 'owner'] }
};
const panelMenuId = 'benny_ticket_category_v2';
const closeButtonId = 'benny_ticket_close_v1';
const confirmButtonId = 'benny_ticket_close_confirm_v1';
const cancelButtonId = 'benny_ticket_close_cancel_v1';
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Sprawdź, czy bot jest online'),
  new SlashCommandBuilder().setName('pomoc').setDescription('Zobacz dostępne komendy'),
  new SlashCommandBuilder().setName('urlop').setDescription('Otwórz panel urlopów i dyspozycyjności Benny’s'),
  new SlashCommandBuilder().setName('antyraid').setDescription('Zarządzaj zabezpieczeniem serwera Benny’s')
    .addSubcommand(s => s.setName('status').setDescription('Sprawdź aktywne zabezpieczenia'))
    .addSubcommand(s => s.setName('wlacz').setDescription('Włącz ochronę Anti-Raid'))
    .addSubcommand(s => s.setName('wylacz').setDescription('Wyłącz ochronę Anti-Raid'))
    .addSubcommand(s => s.setName('blokada').setDescription('Zablokuj publiczne czaty na 5 minut'))
    .addSubcommand(s => s.setName('odblokuj').setDescription('Zdejmij awaryjną blokadę'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('ticket').setDescription('Otwórz prywatne zgłoszenie do mechaników')
    .addStringOption(o => o.setName('opis').setDescription('Krótki opis sprawy').setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName('zamknij-ticket').setDescription('Zamknij bieżące zgłoszenie'),
  new SlashCommandBuilder()
    .setName('panel-ticket').setDescription('Opublikuj lub odśwież panel wyboru ticketów')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('setup').setDescription('Utwórz lub uzupełnij strukturę serwera Benny’s')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('clear').setDescription('Usuń wskazaną liczbę wiadomości')
    .addIntegerOption(o => o.setName('liczba').setDescription('Od 1 do 100').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
].map(c => c.toJSON());
const rest = new REST({ version: '10' }).setToken(token);
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
const baseIntents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildInvites, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.AutoModerationConfiguration, GatewayIntentBits.AutoModerationExecution];
if (process.env.DISCORD_ENABLE_MEMBERS_INTENT === 'true') baseIntents.push(GatewayIntentBits.GuildMembers);
if (process.env.DISCORD_ENABLE_MESSAGE_CONTENT_INTENT === 'true') baseIntents.push(GatewayIntentBits.MessageContent);
const client = new Client({ intents: baseIntents, partials: [Partials.Message, Partials.Channel, Partials.Reaction] });
const sendLog = registerServerLogs(client);
const workSystem = createWorkSystem(client, guildId);
const leaveSystem = createLeaveSystem(client, guildId);
const antiRaid = createAntiRaid(client, { guildId, log: sendLog,
  membersIntent: process.env.DISCORD_ENABLE_MEMBERS_INTENT === 'true',
  contentIntent: process.env.DISCORD_ENABLE_MESSAGE_CONTENT_INTENT === 'true' });
let setupPromise;
function permissionsFor(guild, roles, area, botId, locked = false) {
  const everyone = { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [] };
  if (area !== 'public') {
    everyone.allow = [];
    everyone.deny = [PermissionFlagsBits.ViewChannel];
  }
  if (locked) everyone.deny.push(PermissionFlagsBits.SendMessages);
  const result = [everyone];
  const authorized = area === 'staff' ? staffKeys : area === 'executive' ? executives : [];
  for (const key of authorized) {
    if (roles[key]) {
      result.push({
        id: roles[key].id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect],
        deny: []
      });
    }
  }
  if (locked) {
    for (const key of managers) {
      if (roles[key] && !result.some(o => o.id === roles[key].id)) {
        result.push({ id: roles[key].id, allow: [PermissionFlagsBits.SendMessages], deny: [] });
      } else if (roles[key]) {
        const entry = result.find(o => o.id === roles[key].id);
        if (!entry.allow.includes(PermissionFlagsBits.SendMessages)) entry.allow.push(PermissionFlagsBits.SendMessages);
      }
    }
  }
  result.push({ id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.Connect], deny: [] });
  return result;
}
const unwantedAutomaticEmbeds = new Set([
  '🏁 WITAJ W BENNY’S!', '📜 REGULAMIN SERWERA', '📢 OGŁOSZENIA',
  '🏷️ ODBIERZ ROLĘ', '🛠️ NASZE USŁUGI', '💰 CENNIK',
  '🎫 PRYWATNE ZGŁOSZENIA', '🟥 WZÓR PODANIA'
]);

async function removeAutomaticEmbeds(guild) {
  await guild.channels.fetch();
  let removed = 0;
  const targets = new Set();
  for (const section of layout) {
    const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === section.name);
    if (!category) continue;
    for (const spec of section.channels) {
      if (!spec[3]) continue;
      const channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText &&
        c.parentId === category.id && c.name === spec[1]);
      if (channel) targets.add(channel);
    }
  }
  for (const channel of targets) {
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      for (const message of messages.values()) {
        if (message.author.id !== client.user.id || message.content || message.components.length) continue;
        if (!message.embeds.some(embed => unwantedAutomaticEmbeds.has(embed.title) &&
          embed.footer?.text === 'BENNY’S ORIGINAL MOTOR WORKS • EST. LOS SANTOS')) continue;
        await message.delete();
        removed++;
        console.log('BENNY CLEANUP: usunięto automatyczną wiadomość z ' + channel.name + ' (' + message.id + ')');
      }
    } catch (error) {
      console.error('BENNY CLEANUP: ' + channel.name + ': ' + error.message);
    }
  }
  console.log('BENNY CLEANUP GOTOWE: usunięto ' + removed + ' automatycznych wiadomości; kanały i panele zachowane.');
}
function ticketPanelMessage() {
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Tickety – Benny’s Original Motor Works')
    .setDescription('Wybierz kategorię poniżej, aby utworzyć prywatny ticket.\nPo wybraniu odpowiedniej opcji bot utworzy dla Ciebie osobny kanał.')
    .setFooter({ text: 'Benny’s Original Motor Works © 2026' });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(panelMenuId)
    .setPlaceholder('Wybierz opcję')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(Object.entries(ticketKinds).map(([value, item]) => ({
      label: item.label,
      value,
      description: item.description,
      emoji: item.emoji
    })));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}
async function ensureTicketPanel(guild, forceResend = false) {
  await guild.channels.fetch();
  const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '● TICKETY');
  const channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.parentId === category?.id && c.name === '🔴〢tickety');
  if (!channel) {
    console.error('BENNY TICKETY: nie znaleziono kanału 🔴〢tickety');
    return { ok: false, reason: 'Nie znaleziono kanału 🔴〢tickety.' };
  }
  const messages = await channel.messages.fetch({ limit: 100 });
  const isTicketPanel = m => m.author.id === client.user.id && (
    m.components.some(row => row.components.some(c => c.customId?.startsWith('benny_ticket_category_'))) ||
    m.embeds.some(e => e.title === '🎫 PRYWATNE ZGŁOSZENIA')
  );
  const current = messages.find(m => m.author.id === client.user.id &&
    m.components.some(row => row.components.some(c => c.customId === panelMenuId)));
  if (current && !forceResend) {
    console.log('BENNY TICKETY: panel bez zmian ' + current.id + ' w kanale ' + channel.id);
    return { ok: true, channelId: channel.id, messageId: current.id };
  }
  const panel = await channel.send(ticketPanelMessage());
  console.log('BENNY TICKETY: wysłano NOWY panel ' + panel.id + ' w kanale ' + channel.id);
  for (const oldPanel of messages.filter(isTicketPanel).values()) {
    if (oldPanel.id === panel.id) continue;
    try {
      await oldPanel.delete();
      console.log('BENNY TICKETY: usunięto poprzedni panel ' + oldPanel.id);
    } catch (error) {
      console.error('BENNY TICKETY: nie udało się usunąć poprzedniego panelu ' + oldPanel.id + ': ' + error.message);
    }
  }
  return { ok: true, channelId: channel.id, messageId: panel.id };
}
function ticketFromTopic(topic) {
  const match = topic?.match(/^BENNY_TICKET_OWNER:(\d+)(?:\|([a-z0-9-]+))?$/);
  return match ? { ownerId: match[1], kind: match[2] || 'pomoc' } : null;
}
async function memberMayCloseTicket(interaction, ticket) {
  if (interaction.user.id === ticket.ownerId) return true;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const allowedKeys = ticketKinds[ticket.kind]?.staff || ticketKinds.pomoc.staff;
  return allowedKeys.some(key => member.roles.cache.some(role => role.name === ranks.find(rank => rank.key === key)?.name));
}
async function openTicket(interaction, kindKey, description = '') {
  const kind = ticketKinds[kindKey];
  if (!kind) return interaction.reply({ content: 'Nieznana kategoria zgłoszenia.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  await guild.channels.fetch();
  const previous = guild.channels.cache.find(channel => {
    if (channel.type !== ChannelType.GuildText) return false;
    const ticket = ticketFromTopic(channel.topic);
    return ticket?.ownerId === interaction.user.id && ticket.kind === kindKey;
  });
  if (previous) return interaction.editReply('Masz już ticket w tej kategorii: <#' + previous.id + '>.');
  const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '● TICKETY');
  if (!category) return interaction.editReply('Kategoria TICKETY jest niedostępna. Skontaktuj się z zarządem.');
  await guild.roles.fetch();
  const allow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks
  ];
  const overrides = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow },
    { id: client.user.id, allow: [...allow, PermissionFlagsBits.ManageChannels] }
  ];
  const added = new Set(overrides.map(x => x.id));
  for (const key of kind.staff) {
    const role = guild.roles.cache.find(r => r.name === ranks.find(rank => rank.key === key)?.name);
    if (!role || added.has(role.id)) continue;
    overrides.push({ id: role.id, allow });
    added.add(role.id);
  }
  const channel = await guild.channels.create({
    name: 'ticket-' + kindKey + '-' + interaction.user.id.slice(-6),
    type: ChannelType.GuildText,
    parent: category.id,
    topic: 'BENNY_TICKET_OWNER:' + interaction.user.id + '|' + kindKey,
    permissionOverwrites: overrides,
    reason: 'Benny’s: prywatny ticket ' + kind.label + ' (' + interaction.user.id + ')'
  });
  const content = '**Klient:** <@' + interaction.user.id + '>\n**Kategoria:** ' + kind.emoji + ' ' + kind.label
    + (description ? '\n**Opis:** ' + description : '\nOpisz szczegółowo swoją sprawę poniżej.')
    + '\n\nAby zamknąć zgłoszenie, kliknij przycisk poniżej lub wpisz **/zamknij-ticket**.';
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Ticket – ' + kind.label)
    .setDescription(content)
    .setFooter({ text: 'Benny’s Original Motor Works © 2026' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(closeButtonId).setLabel('Zamknij ticket').setEmoji('🔒').setStyle(ButtonStyle.Secondary)
  );
  await channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  console.log('BENNY TICKETY: utworzono ' + channel.name + ' kategoria=' + kindKey);
  await sendLog(guild, '🎫 Utworzono ticket', [['Użytkownik', '<@' + interaction.user.id + '>'], ['Kategoria', kind.label], ['Kanał', '<#' + channel.id + '>']], 0x57f287);
  return interaction.editReply('✅ Utworzono prywatny ticket: <#' + channel.id + '>.');
}
async function askToCloseTicket(interaction) {
  const ticket = ticketFromTopic(interaction.channel?.topic);
  if (!ticket) return interaction.reply({ content: 'To nie jest kanał ticketu.', ephemeral: true });
  if (!await memberMayCloseTicket(interaction, ticket)) {
    return interaction.reply({ content: 'Nie masz uprawnień do zamknięcia tego ticketu.', ephemeral: true });
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(confirmButtonId).setLabel('Tak, zamknij').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(cancelButtonId).setLabel('Nie, anuluj').setStyle(ButtonStyle.Secondary)
  );
  return interaction.reply({ content: 'Czy na pewno chcesz zamknąć i usunąć ten kanał ticketu?', components: [row], ephemeral: true });
}
function overwritesMatch(channel, expected) {
  const current = channel.permissionOverwrites.cache;
  if (current.size !== expected.length) return false;
  return expected.every(entry => {
    const actual = current.get(entry.id);
    if (!actual) return false;
    const allow = entry.allow.reduce((value, flag) => value | BigInt(flag), 0n);
    const deny = entry.deny.reduce((value, flag) => value | BigInt(flag), 0n);
    return actual.allow.bitfield === allow && actual.deny.bitfield === deny;
  });
}
async function configure(guild) {
  const botMember = await guild.members.fetchMe();
  const required = [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  const missing = required.filter(flag => !botMember.permissions.has(flag));
  if (missing.length) {
    console.error('BENNY SETUP: brak uprawnień ManageChannels / ManageRoles / ViewChannel / SendMessages. Przyznaj je roli bota.');
    return { ok: false, reason: 'Bot potrzebuje uprawnień Zarządzanie kanałami i Zarządzanie rolami.' };
  }
  await guild.roles.fetch();
  await guild.channels.fetch();
  const roles = {};
  let madeRoles = 0;
  let madeCategories = 0;
  let madeChannels = 0;
  let removedDuplicates = 0;
  for (const spec of ranks) {
    let role = guild.roles.cache.find(r => r.name === spec.name);
    if (!role && legacyRoles[spec.name]) {
      role = guild.roles.cache.find(r => r.name === legacyRoles[spec.name]);
      if (role) {
        await role.edit({
          name: spec.name, color: spec.color, permissions: spec.permissions,
          hoist: !!spec.hoist, mentionable: false
        }, 'Aktualizacja stopni Benny’s Motor Works');
        console.log('BENNY RANKS: zmieniono ' + legacyRoles[spec.name] + ' na ' + spec.name);
      }
    }
    if (!role) {
      role = await guild.roles.create({
        name: spec.name, color: spec.color, permissions: spec.permissions,
        hoist: !!spec.hoist, mentionable: false, reason: 'Stopnie Benny’s Motor Works'
      });
      madeRoles++;
      console.log('BENNY RANKS: dodano ' + role.name);
    }
    if (role.permissions.bitfield !== spec.permissions || role.color !== spec.color || role.hoist !== !!spec.hoist) {
      await role.edit({
        color: spec.color, permissions: spec.permissions, hoist: !!spec.hoist, mentionable: false
      }, 'Aktualizacja uprawnień stopnia Benny’s');
    }
    roles[spec.key] = role;
  }
  for (const oldName of ['🚗・Klient', '💎・VIP']) {
    const oldRole = guild.roles.cache.find(r => r.name === oldName);
    if (oldRole) {
      await oldRole.delete('Zastąpienie poprzednich ról stopniami Benny’s');
      console.log('BENNY RANKS: usunięto poprzednią rolę ' + oldName);
    }
  }
  try {
    await guild.roles.fetch();
    const self = await guild.members.fetchMe();
    const desired = [...ranks].reverse().map(spec => guild.roles.cache.get(roles[spec.key].id));
    const current = desired.map(role => ({ name: role.name, position: role.position, editable: role.editable }));
    console.log('BENNY RANKS: najwyższa rola bota: ' + self.roles.highest.name + ' (pozycja ' + self.roles.highest.position + ')');
    console.log('BENNY RANKS: pozycje przed sortowaniem: ' + JSON.stringify(current));
    const locked = desired.filter(role => !role.editable);
    if (locked.length) {
      console.error('BENNY RANKS: bot nie może zmienić ról: ' + locked.map(role => role.name).join(', ') + '. Umieść rolę bota Benny’s ponad rangami warsztatu w ustawieniach Discorda.');
    } else {
      const positions = desired.map(role => role.position).sort((a, b) => b - a);
      await rest.patch(Routes.guildRoles(guild.id), {
        body: desired.map((role, index) => ({ id: role.id, position: positions[index] }))
      });
      await guild.roles.fetch();
      const after = desired.map(role => ({ name: role.name, position: guild.roles.cache.get(role.id)?.position }));
      console.log('BENNY RANKS: pozycje po sortowaniu: ' + JSON.stringify(after));
      const correct = after.every((entry, index) => index === 0 || after[index - 1].position > entry.position);
      console.log(correct ? 'BENNY RANKS GOTOWE: Właściciel > Współwłaściciel > ... > Nowy' : 'BENNY RANKS: kolejność nie została w pełni zastosowana');
    }
  } catch (error) {
    console.error('BENNY RANKS: błąd zmiany kolejności: ' + error.message + ' status=' + error.status + ' code=' + error.code + ' detail=' + JSON.stringify(error.rawError || {}));
  }
  try {
    await guild.roles.fetch();
    const self = await guild.members.fetchMe();
    let opiekun = guild.roles.cache.find(role => role.name === 'Opiekun Firm');
    if (!opiekun) {
      opiekun = await guild.roles.create({
        name: 'Opiekun Firm',
        color: 0x9b59b6,
        permissions: 0n,
        hoist: true,
        mentionable: false,
        reason: 'Dodanie rangi Opiekun Firm na prośbę właściciela'
      });
      madeRoles++;
      console.log('BENNY OPIEKUN FIRM: utworzono rolę ' + opiekun.id);
    }
    await guild.roles.fetch();
    opiekun = guild.roles.cache.get(opiekun.id);
    const maximum = self.roles.highest.position - 1;
    if (opiekun.editable && maximum > 0 && opiekun.position !== maximum) {
      await opiekun.setPosition(maximum, 'Opiekun Firm najwyżej, ponad Właścicielem');
      await guild.roles.fetch();
      opiekun = guild.roles.cache.get(opiekun.id);
    }
    roles.opiekunFirm = opiekun;
    console.log('BENNY OPIEKUN FIRM: rola=' + opiekun.name +
      ', pozycja=' + opiekun.position +
      ', rola bota=' + self.roles.highest.name +
      ', pozycja bota=' + self.roles.highest.position);
  } catch (error) {
    console.error('BENNY OPIEKUN FIRM: nie udało się ustawić roli: ' + error.message);
  }
  for (const section of layout) {
    let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === section.name);
    if (!category) {
      category = await guild.channels.create({
        name: section.name, type: ChannelType.GuildCategory,
        permissionOverwrites: permissionsFor(guild, roles, section.area, client.user.id),
        reason: 'Konfiguracja kategorii Benny’s Motor Works'
      });
      madeCategories++;
      console.log('BENNY SETUP: kategoria ' + category.name);
    } else {
      const overwrites = permissionsFor(guild, roles, section.area, client.user.id);
      if (!overwritesMatch(category, overwrites)) {
        await category.permissionOverwrites.set(overwrites, 'Ustawienie uprawnień aktualnych stopni Benny’s');
      }
    }
    const usedChannelIds = new Set();
    const expectedNames = section.channels.map(spec => spec[1]);
    for (const [type, name, topic, embedKey, overrideArea] of section.channels) {
      const kind = type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
      const area = overrideArea || section.area;
      const overwrites = permissionsFor(guild, roles, area, client.user.id, readOnly.has(embedKey));
      let channel = findManagedChannel(guild, category.id, kind, name, expectedNames, usedChannelIds);
      if (!channel && legacyMoves[name]) {
        const [sourceCategoryName, sourceChannelName] = legacyMoves[name];
        const sourceCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === sourceCategoryName);
        const sourceChannel = sourceCategory && guild.channels.cache.find(c => c.parentId === sourceCategory.id && c.type === kind && c.name === sourceChannelName);
        if (sourceChannel) {
          await sourceChannel.edit({ name, parent: category.id, topic, permissionOverwrites: overwrites }, 'Przeniesienie kanału do nowego układu Benny’s');
          channel = sourceChannel;
          console.log('BENNY LAYOUT: przeniesiono ' + sourceChannelName + ' na ' + name);
        }
      }
      if (channel) {
        usedChannelIds.add(channel.id);
        if (channel.name !== name) {
          const oldName = channel.name;
          await channel.setName(name, 'Zmiana emotki kanału bez usuwania wiadomości');
          console.log('BENNY LOBBY: przemianowano ' + oldName + ' na ' + name);
        }
        if (!overwritesMatch(channel, overwrites)) {
          await channel.permissionOverwrites.set(overwrites, 'Uprawnienia nowego układu Benny’s');
        }
        continue;
      }
      channel = await guild.channels.create({
        name, type: kind, parent: category.id, topic,
        permissionOverwrites: overwrites, reason: 'Nowy układ kanałów Benny’s'
      });
      usedChannelIds.add(channel.id);
      madeChannels++;
      console.log('BENNY LAYOUT: utworzono kanał ' + channel.name);
    }
    try {
      const cleaned = await cleanupManagedDuplicates(guild, category, section);
      removedDuplicates += cleaned.removed;
    } catch (error) {
      console.error('BENNY DUPLIKATY: problem w kategorii ' + category.name + ': ' + error.message);
    }
  }
  let checkedEmployeePermissions = 0;
  let missingEmployeePermissions = 0;
  const employeeRoles = staffKeys.map(key => roles[key]).filter(Boolean);
  for (const section of layout) {
    const category = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildCategory && c.name === section.name);
    if (!category) continue;
    const targets = [
      { channel: category, area: section.area },
      ...section.channels.map(spec => ({
        channel: guild.channels.cache.find(c =>
          c.parentId === category.id && c.name === spec[1]),
        area: spec[4] || section.area
      }))
    ];
    for (const target of targets) {
      if (!target.channel || target.area !== 'staff') continue;
      for (const role of employeeRoles) {
        checkedEmployeePermissions++;
        const rights = target.channel.permissionsFor(role);
        if (!rights?.has(PermissionFlagsBits.ViewChannel) ||
            !rights?.has(PermissionFlagsBits.ReadMessageHistory)) {
          missingEmployeePermissions++;
          console.error('BENNY DOSTEP: BRAK ' + role.name + ' -> ' + target.channel.name);
        }
      }
    }
  }
  console.log('BENNY DOSTEP PRACOWNIKOW: sprawdzono ' + checkedEmployeePermissions +
    ' kombinacji kanał/stopień, brakujących=' + missingEmployeePermissions +
    ', stopni=' + employeeRoles.length);
  const oldTicketCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '🎫・POMOC I ZGŁOSZENIA');
  const newTicketCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '● TICKETY');
  if (oldTicketCategory && newTicketCategory) {
    for (const channel of guild.channels.cache.filter(c => c.parentId === oldTicketCategory.id && c.type === ChannelType.GuildText && c.topic?.startsWith('BENNY_TICKET_OWNER:')).values()) {
      await channel.setParent(newTicketCategory.id, { lockPermissions: false, reason: 'Zachowanie aktywnego ticketu w nowej kategorii' });
      console.log('BENNY LAYOUT: zachowano aktywny ticket ' + channel.name);
    }
  }
  try {
    const lobby = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildCategory && c.name === '▶ LOBBY ◀');
    if (lobby) {
      if (lobby.rawPosition !== 0) await lobby.setPosition(0, 'Lobby Benny’s na samej górze');
      const names = layout[0].channels.map(item => item[1]);
      for (let i = 0; i < names.length; i++) {
        const channel = guild.channels.cache.find(c =>
          c.parentId === lobby.id && c.name === names[i]);
        if (channel && channel.rawPosition !== i) {
          await channel.setPosition(i, 'Ustawienie kolejności kanałów LOBBY');
        }
      }
      console.log('BENNY LOBBY: kategoria na górze, kanały według wzoru');
    }
    await guild.channels.fetch();
    const zarzad = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildCategory && c.name === '● Zarząd-ZONE');
    if (zarzad) {
      const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
      const lastPosition = Math.max(0, categories.size - 1);
      await zarzad.setPosition(lastPosition, 'Przenieś Zarząd-ZONE na sam dół listy kategorii');
      await guild.channels.fetch();
      const current = guild.channels.cache.get(zarzad.id);
      const latest = [...guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).values()]
        .sort((a, b) => a.rawPosition - b.rawPosition);
      console.log('BENNY ZARZAD: pozycja=' + current?.rawPosition +
        ', ostatnia kategoria=' + latest.at(-1)?.name);
    }
  } catch (error) {
    console.error('BENNY LOBBY: nie można zmienić kolejności: ' + error.message);
  }
  const deletedChannels = removedDuplicates;
  const deletedCategories = 0;
  console.log('BENNY DUPLIKATY GOTOWE: usunięto ' + removedDuplicates + ' zduplikowanych kanałów.');
  console.log('BENNY LAYOUT GOTOWY: nowe kategorie=' + madeCategories + ', nowe kanały=' + madeChannels + ', usunięte dawne kanały=' + deletedChannels + ', usunięte dawne kategorie=' + deletedCategories);
  const summary = 'Utworzono ' + madeRoles + ' ról, ' + madeCategories + ' kategorii i ' + madeChannels + ' kanałów, usunięto ' + deletedChannels + ' dawnych kanałów.';
  console.log('BENNY SETUP GOTOWY: ' + summary);
  return { ok: true, summary };
}
function runSetup(guild) {
  if (!setupPromise) setupPromise = configure(guild).finally(() => { setupPromise = null; });
  return setupPromise;
}
client.once(Events.ClientReady, async ready => {
  console.log('Bot zalogowany: ' + ready.user.tag);
  try {
    const guild = await client.guilds.fetch(guildId);
    const activeGuild = await guild.fetch();
    await runSetup(activeGuild);
    await workSystem.setup(activeGuild);
    await leaveSystem.setup(activeGuild);
    await antiRaid.setup(activeGuild);
    await removeAutomaticEmbeds(activeGuild);
  } catch (error) {
    console.error('BENNY SETUP ERROR: ' + error.message);
  }
});
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.guildId !== guildId) return;
  try {
    if (await antiRaid.handle(interaction)) return;
    if (await leaveSystem.handle(interaction)) return;
    if (interaction.isButton() && interaction.customId.startsWith('benny_work_')) {
      return workSystem.handle(interaction);
    }
    if (interaction.isStringSelectMenu() && interaction.customId === panelMenuId) {
      return openTicket(interaction, interaction.values[0]);
    }
    if (interaction.isButton() && interaction.customId === closeButtonId) {
      return askToCloseTicket(interaction);
    }
    if (interaction.isButton() && interaction.customId === cancelButtonId) {
      return interaction.update({ content: 'Anulowano zamykanie ticketu.', components: [] });
    }
    if (interaction.isButton() && interaction.customId === confirmButtonId) {
      const ticket = ticketFromTopic(interaction.channel?.topic);
      if (!ticket || !await memberMayCloseTicket(interaction, ticket)) {
        return interaction.update({ content: 'Nie masz uprawnień do zamknięcia tego ticketu.', components: [] });
      }
      await interaction.update({ content: '🔒 Ticket został zamknięty.', components: [] });
      await sendLog(interaction.guild, '🔒 Zamknięto ticket', [['Użytkownik', '<@' + ticket.ownerId + '>'], ['Zamknął', '<@' + interaction.user.id + '>'], ['Kanał', interaction.channel.name + ' (' + interaction.channel.id + ')']], 0xed4245);
      await interaction.channel.delete('Benny’s: zamknięcie ticketu przez ' + interaction.user.username);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const name = interaction.commandName;
    if (name === 'ping') {
      return interaction.reply({ content: '🏎️ Pong! Benny’s jest online.', ephemeral: true });
    }
    if (name === 'pomoc') {
      return interaction.reply({ content: '🏁 **Benny’s Motor Works**\n**/ticket** – prywatne zgłoszenie\n**/zamknij-ticket** – zamknij zgłoszenie\n**/ping** – stan bota\n**/clear** – usuń wiadomości (moderacja)\n**/setup** – skonfiguruj serwer (zarząd)\n**/panel-ticket** – odśwież panel ticketów (zarząd)\n**/urlop** – panel urlopów i nieobecności\n**/antyraid** – ochrona przed raidami (zarząd)', ephemeral: true });
    }
    if (name === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'Nie masz dostępu do konfiguracji.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const result = await runSetup(interaction.guild);
      return interaction.editReply(result.ok ? '✅ ' + result.summary : '❌ ' + result.reason);
    }
    if (name === 'panel-ticket') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'Nie masz dostępu do panelu administracyjnego.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const result = await ensureTicketPanel(interaction.guild, true);
      return interaction.editReply(result.ok ? '✅ Panel ticketów gotowy: <#' + result.channelId + '>.' : '❌ ' + result.reason);
    }
    if (name === 'ticket') {
      return openTicket(interaction, 'pomoc', interaction.options.getString('opis', true));
    }
    if (name === 'zamknij-ticket') {
      return askToCloseTicket(interaction);
    }
    if (name === 'clear') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: 'Nie masz uprawnienia Zarządzanie wiadomościami.', ephemeral: true });
      }
      if (!interaction.channel?.bulkDelete) {
        return interaction.reply({ content: 'Na tym kanale nie można hurtowo usuwać wiadomości.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const amount = interaction.options.getInteger('liczba', true);
      const deleted = await interaction.channel.bulkDelete(amount, true);
      return interaction.editReply('🧹 Usunięto ' + deleted.size + ' wiadomości. Wiadomości starsze niż 14 dni nie zostały usunięte.');
    }
  } catch (error) {
    console.error('BENNY COMMAND ERROR: ' + error.stack);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('❌ Wystąpił błąd. Sprawdź uprawnienia bota.').catch(() => {});
    } else {
      await interaction.reply({ content: '❌ Wystąpił błąd. Sprawdź uprawnienia bota.', ephemeral: true }).catch(() => {});
    }
  }
});
client.on(Events.GuildMemberAdd, async member => {
  if (member.guild.id !== guildId) return;
  try {
    await member.guild.channels.fetch();
    const category = member.guild.channels.cache.find(c =>
      c.type === ChannelType.GuildCategory && c.name === '▶ LOBBY ◀');
    const channel = member.guild.channels.cache.find(c =>
      c.type === ChannelType.GuildText &&
      c.parentId === category?.id &&
      c.name.includes('nowi'));
    if (!channel) {
      console.error('BENNY WELCOME: brak kanału nowi w LOBBY');
      return;
    }
    const rankChannel = member.guild.channels.cache.find(c =>
      c.parentId === category.id && c.name.includes('prosba-o-range'));
    const recruitChannel = member.guild.channels.cache.find(c =>
      c.parentId === category.id && c.name.includes('rekrutacja'));
    const announceChannel = member.guild.channels.cache.find(c =>
      c.parentId === category.id && c.name.includes('ogloszenia'));
    const logo = member.guild.iconURL({ size: 128 }) || client.user.displayAvatarURL({ size: 128 });
    const embed = new EmbedBuilder()
      .setColor(0xb51c25)
      .setAuthor({ name: 'BENNY’S ORIGINAL MOTOR WORKS • WITAMY', iconURL: logo })
      .setTitle('🏁 WITAJ W NASZYM GARAŻU!')
      .setDescription(
        'Siema <@' + member.id + '>! 🚘\n\n' +
        'Właśnie dołączyłeś do **Benny’s Original Motor Works** — miejsca, ' +
        'gdzie liczą się dobre auta, świetna ekipa i porządny tuning. 🔧🔥\n\n' +
        '**Rozgość się i zacznij swoją przygodę z Benny’s!**'
      )
      .addFields({
        name: '📍 OD CZEGO ZACZĄĆ?',
        value:
          (rankChannel ? '👮 Prośba o stopień: <#' + rankChannel.id + '>\n' : '') +
          (recruitChannel ? '📋 Rekrutacja: <#' + recruitChannel.id + '>\n' : '') +
          (announceChannel ? '📢 Aktualności: <#' + announceChannel.id + '>' : 'Poznaj kanały serwera.')
      })
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: 'Benny’s Original Motor Works © 2026 • Szerokości!' })
      .setTimestamp();
    await channel.send({
      content: '<@' + member.id + '>',
      embeds: [embed],
      allowedMentions: { users: [member.id], parse: [] }
    });
    console.log('BENNY WELCOME: powitano ' + member.id + ' na kanale ' + channel.id);
  } catch (error) {
    console.error('BENNY WELCOME ERROR: ' + error.message);
  }
});
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  workSystem.roleChanged(oldMember, newMember).catch(error => console.error('BENNY GODZINY RANGI: ' + error.message));
});
client.login(token);
