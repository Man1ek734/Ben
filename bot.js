import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, Partials,
  ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { registerServerLogs } from './server-logs.js';
import { findManagedChannel, cleanupManagedDuplicates } from './channel-dedupe.js';
import { createWorkSystem } from './work-system.js';
import { createLeaveSystem } from './leave-system.js';
import { createAntiRaid } from './anti-raid.js';
import { cleanDuplicatedRanks } from './rank-deduper.js';
import { createPromotionSystem } from './promotion-system.js';
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID || '1566469722365493340';
const welcomeRoleIds = ['1568803257642393600', '1568803436030328832'];
const welcomeChannelId = '1566809428693618791';
const clientRoleId = '1568803257642393600';
const bennysRoleId = '1568799161476976693';
const clientCategories = new Set(['1566479027089318069', '1566479020089151641', '1566809427573473440']);
const clientCategoryNames = new Set(['▶ LOBBY ◀', '● TICKETY', 'Współprace']);
const clientWriteChannelId = '1566809429985329404';
const channelToDeleteId = '1566803396881551431';
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
const staffKeys = [...ranks.map(rank => rank.key), 'opiekunFirm', 'bennys'];
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
const readOnlyChannels = new Set([
  '💬〢zebrania',
  '💵〢wynagrodzenia',
  '📜〢czarna-lista',
  '⏰-wyrobione-godziny',
  '💰〢godzinówki',
  '📈〢awanse-degrady',
  '📉〢zwolnienia',
  '🧠〢plusy-minusy',
  '🗓️〢urlopy',
  '📣〢dostępność-zarządu'
]);
const writingFlags = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads
];
const ticketKinds = {
  pomoc: { label: 'Pomoc ogólna', emoji: '❓', description: 'Pytania i kontakt z ekipą Benny’s', staff: ['leader', 'foreman', 'manager', 'director', 'coowner', 'owner'] },
  rekrutacja: { label: 'Podanie o pracę', emoji: '📋', description: 'Rekrutacja do warsztatu', staff: ['manager', 'director', 'coowner', 'owner'] },
  skarga: { label: 'Skarga', emoji: '⚠️', description: 'Zgłoszenie problemu z pracownikiem', staff: ['director', 'coowner', 'owner'] },
  wspolpraca: { label: 'Współpraca', emoji: '🤝', description: 'Propozycja partnerstwa lub współpracy', staff: ['manager', 'director', 'coowner', 'owner'] }
};
const panelMenuId = 'benny_ticket_category_v2';
const recruitmentModalId = 'benny_recruitment_application_v1';
const closeButtonId = 'benny_ticket_close_v1';
const confirmButtonId = 'benny_ticket_close_confirm_v1';
const cancelButtonId = 'benny_ticket_close_cancel_v1';
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Sprawdź, czy bot jest online'),
  new SlashCommandBuilder().setName('pomoc').setDescription('Zobacz dostępne komendy'),
  new SlashCommandBuilder().setName('urlop').setDescription('Otwórz panel urlopów i dyspozycyjności Benny’s'),
  new SlashCommandBuilder()
    .setName('awans')
    .setDescription('Awansuj pracownika Benny’s automatycznie o jeden stopień')
    .addStringOption(o => o.setName('nick')
      .setDescription('Nick pracownika, np. coslubie')
      .setRequired(true).setMinLength(1).setMaxLength(100)),
  new SlashCommandBuilder()
    .setName('degrad')
    .setDescription('Obniż stopień pracownika Benny’s dokładnie o jeden poziom')
    .addStringOption(o => o.setName('nick')
      .setDescription('Nick pracownika, np. coslubie')
      .setRequired(true).setMinLength(1).setMaxLength(100)),
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
const promotionSystem = createPromotionSystem(client, guildId, ranks, workSystem);
const leaveSystem = createLeaveSystem(client, guildId);
const antiRaid = createAntiRaid(client, { guildId, log: sendLog,
  membersIntent: process.env.DISCORD_ENABLE_MEMBERS_INTENT === 'true',
  contentIntent: process.env.DISCORD_ENABLE_MESSAGE_CONTENT_INTENT === 'true' });
let setupPromise;
function permissionsFor(guild, roles, area, botId, locked = false, channelName = null, categoryName = null) {
  const everyone = {
    id: guild.roles.everyone.id,
    allow: [],
    deny: [PermissionFlagsBits.ViewChannel]
  };
  if (locked) everyone.deny.push(...writingFlags);
  const result = [everyone];
  const authorized = area === 'executive' ? executives : staffKeys;
  for (const key of authorized) {
    if (!roles[key]) continue;
    const canPost = !locked || managers.includes(key);
    result.push({
      id: roles[key].id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.Connect,
        ...(canPost ? writingFlags : [])
      ],
      deny: locked && !canPost ? [...writingFlags] : []
    });
  }
  if (locked) {
    for (const key of managers) {
      if (!roles[key]) continue;
      let entry = result.find(o => o.id === roles[key].id);
      if (!entry) {
        entry = { id: roles[key].id, allow: [], deny: [] };
        result.push(entry);
      }
      for (const flag of writingFlags) {
        if (!entry.allow.includes(flag)) entry.allow.push(flag);
        entry.deny = entry.deny.filter(other => other !== flag);
      }
    }
  }
  if (area === 'public' && clientCategoryNames.has(categoryName)) {
    const clientRole = guild.roles.cache.get(clientRoleId);
    if (clientRole) {
      const writable = channelName === '🏷️〢prosba-o-range';
      result.push({
        id: clientRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          ...(writable ? writingFlags : [])
        ],
        deny: writable ? [] : [...writingFlags]
      });
    }
  }
  result.push({
    id: botId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.Connect,
      ...writingFlags
    ],
    deny: []
  });
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
function recruitmentApplicationModal() {
  const modal = new ModalBuilder()
    .setCustomId(recruitmentModalId)
    .setTitle('Benny’s • Podanie o pracę');
  const questions = [
    ['ic_name', 'Imię i nazwisko (IC)', 'np. John Carter', TextInputStyle.Short, 80],
    ['ic_age', 'Wiek (IC)', 'np. 25', TextInputStyle.Short, 3],
    ['experience', 'Czy masz doświadczenie jako mechanik?', 'Opisz krótko swoje doświadczenie', TextInputStyle.Paragraph, 400],
    ['motivation', 'Dlaczego chcesz dołączyć do Benny’s?', 'Napisz, dlaczego chcesz u nas pracować', TextInputStyle.Paragraph, 600],
    ['availability', 'Ile czasu dziennie możesz pracować?', 'np. 2–3 godziny', TextInputStyle.Short, 100]
  ];
  for (const [id, label, placeholder, style, maxLength] of questions) {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(style)
      .setMaxLength(maxLength)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

async function submitRecruitmentApplication(interaction) {
  const questions = [
    ['ic_name', 'Imię i nazwisko (IC)'],
    ['ic_age', 'Wiek (IC)'],
    ['experience', 'Doświadczenie jako mechanik'],
    ['motivation', 'Dlaczego chcesz dołączyć do Benny’s?'],
    ['availability', 'Ile czasu dziennie możesz pracować?']
  ];
  const answers = questions.map(([id, label]) => ({
    label, answer: interaction.fields.getTextInputValue(id).trim()
  }));
  if (answers.some(item => !item.answer)) {
    return interaction.reply({ content: 'Wypełnij wszystkie pola podania i spróbuj ponownie.', ephemeral: true });
  }
  if (!/^[0-9]{1,3}$/.test(answers[1].answer)) {
    return interaction.reply({ content: 'Wiek (IC) wpisz cyframi, np. 25. Wybierz ponownie „Podanie o pracę”, aby poprawić formularz.', ephemeral: true });
  }
  const description = answers.map((item, index) =>
    '**' + String(index + 1).padStart(2, '0') + '. ' + item.label + ':**\n' + item.answer
  ).join('\n\n');
  return openTicket(interaction, 'rekrutacja', description);
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
  const application = kindKey === 'rekrutacja' && description;
  const content = '**' + (application ? 'Kandydat' : 'Klient') + ':** <@' + interaction.user.id + '>\n**Kategoria:** ' + kind.emoji + ' ' + kind.label
    + (application ? '\n\n**Wypełnione podanie:**\n\n' + description
      : description ? '\n**Opis:** ' + description : '\nOpisz szczegółowo swoją sprawę poniżej.')
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
    const role = guild.roles.cache.find(role => role.name === '・' + spec.name) ||
      guild.roles.cache.find(role => role.name === spec.name);
    if (role) {
      roles[spec.key] = role;
    } else {
      console.log('BENNY ROLE PRESERVE: stopień ' + spec.name +
        ' nie istnieje i nie zostanie utworzony ponownie.');
    }
  }
  const opiekun = guild.roles.cache.find(role => role.name === '・Opiekun Firm') ||
    guild.roles.cache.find(role => role.name === 'Opiekun Firm');
  if (opiekun) roles.opiekunFirm = opiekun;
  else console.log('BENNY ROLE PRESERVE: rola Opiekun Firm nie istnieje i nie zostanie odtworzona.');
  const bennysRole = guild.roles.cache.get(bennysRoleId);
  if (bennysRole) roles.bennys = bennysRole;
  else console.error('BENNY DOSTEP: brak roli ・Benny\'s (' + bennysRoleId + ')');
  console.log('BENNY ROLE PRESERVE: aktywne stopnie=' +
    Object.values(roles).map(role => role.name).join(', ') +
    '; bez tworzenia, usuwania, zmieniania nazw, uprawnień ani pozycji ról.');
  for (const section of layout) {
    let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === section.name);
    if (!category) {
      category = await guild.channels.create({
        name: section.name, type: ChannelType.GuildCategory,
        permissionOverwrites: permissionsFor(guild, roles, section.area, client.user.id, false, null, section.name),
        reason: 'Konfiguracja kategorii Benny’s Motor Works'
      });
      madeCategories++;
      console.log('BENNY SETUP: kategoria ' + category.name);
    } else {
      const overwrites = permissionsFor(guild, roles, section.area, client.user.id, false, null, section.name);
      if (!overwritesMatch(category, overwrites)) {
        await category.permissionOverwrites.set(overwrites, 'Ustawienie uprawnień aktualnych stopni Benny’s');
      }
    }
    const usedChannelIds = new Set();
    const expectedNames = section.channels.map(spec => spec[1]);
    for (const [type, name, topic, embedKey, overrideArea] of section.channels) {
      const kind = type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
      const area = overrideArea || section.area;
      const overwrites = permissionsFor(guild, roles, area, client.user.id, readOnly.has(embedKey) || readOnlyChannels.has(name), name, section.name);
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
  try {
    await cleanDuplicatedRanks(guild, [...ranks.map(rank => rank.name), 'Opiekun Firm']);
  } catch (error) {
    console.error('BENNY ROLE CLEANUP ERROR: ' + error.message);
  }
  const clientGroup = guild.roles.cache.get(clientRoleId);
  const everyoneRole = guild.roles.everyone;
  let protectedChannels = 0;
  let updatedClientChannels = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!channel.permissionOverwrites) continue;
    const isCategory = channel.type === ChannelType.GuildCategory;
    const categoryId = isCategory ? channel.id : channel.parentId;
    const allowedForClient = clientCategories.has(categoryId);
    const isPrivateTicket = !isCategory &&
      (channel.topic?.startsWith('BENNY_TICKET_OWNER:') ||
        /^ticket-/.test(channel.name));
    try {
      const baseOverwrite = channel.permissionOverwrites.cache.get(everyoneRole.id);
      if (!baseOverwrite?.deny.has(PermissionFlagsBits.ViewChannel) ||
          baseOverwrite?.allow.has(PermissionFlagsBits.ViewChannel)) {
        await channel.permissionOverwrites.edit(everyoneRole.id, {
          ViewChannel: false
        }, { reason: 'Benny’s: kanały widoczne wyłącznie po przydzieleniu roli' });
      }
      protectedChannels++;
      if (!clientGroup || isPrivateTicket) continue;
      const desiredView = allowedForClient;
      const writable = !isCategory && channel.id === clientWriteChannelId;
      const prior = channel.permissionOverwrites.cache.get(clientGroup.id);
      const configured =
        prior &&
        (desiredView ? prior.allow.has(PermissionFlagsBits.ViewChannel) :
          prior.deny.has(PermissionFlagsBits.ViewChannel)) &&
        (writable ? prior.allow.has(PermissionFlagsBits.SendMessages) :
          prior.deny.has(PermissionFlagsBits.SendMessages));
      if (!configured) {
        await channel.permissionOverwrites.edit(clientGroup.id, {
          ViewChannel: desiredView,
          ReadMessageHistory: desiredView,
          SendMessages: writable,
          SendMessagesInThreads: writable,
          CreatePublicThreads: writable,
          CreatePrivateThreads: writable
        }, { reason: 'Benny’s: klient widzi tylko LOBBY, TICKETY i Współprace' });
        updatedClientChannels++;
      }
    } catch (error) {
      console.error('BENNY PRYWATNOSC ERROR: ' + channel.name + ' (' + channel.id +
        '): ' + error.message);
    }
  }
  console.log('BENNY PRYWATNOSC GOTOWE: kanały chronione=' + protectedChannels +
    ', poprawione uprawnienia klienta=' + updatedClientChannels);
  let visibilityErrors = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!channel.permissionOverwrites) continue;
    const categoryId = channel.type === ChannelType.GuildCategory ? channel.id : channel.parentId;
    const privateTicket = channel.topic?.startsWith('BENNY_TICKET_OWNER:') ||
      /^ticket-/.test(channel.name);
    const expectedClient = clientCategories.has(categoryId) && !privateTicket;
    const publicVisible = channel.permissionsFor(everyoneRole)?.has(PermissionFlagsBits.ViewChannel) || false;
    const clientVisible = clientGroup && !privateTicket ?
      !!channel.permissionsFor(clientGroup)?.has(PermissionFlagsBits.ViewChannel) : null;
    if (publicVisible || (clientGroup && !privateTicket && clientVisible !== expectedClient)) {
      visibilityErrors++;
      console.error('BENNY PRYWATNOSC CHECK: ' + JSON.stringify({
        channel: channel.name, id: channel.id, everyoneVisible: publicVisible,
        clientVisible, expectedClient
      }));
    }
  }
  console.log('BENNY PRYWATNOSC AUDYT: błędów=' + visibilityErrors +
    ', rola Benny\'s=' + (bennysRole?.name || 'BRAK'));
  const clientRole = guild.roles.cache.get(clientRoleId);
  if (clientRole) {
    const publicCategories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory &&
      (c.name === '▶ LOBBY ◀' || c.name === '● TICKETY'));
    for (const category of publicCategories.values()) {
      for (const channel of guild.channels.cache.filter(c => c.parentId === category.id).values()) {
        if (channel.type !== ChannelType.GuildText) continue;
        const perms = channel.permissionsFor(clientRole);
        const canView = perms?.has(PermissionFlagsBits.ViewChannel) || false;
        const canWrite = perms?.has(PermissionFlagsBits.SendMessages) || false;
        console.log('BENNY KLIENT UPRAWNIENIA: ' + JSON.stringify({
          id: channel.id, name: channel.name, view: canView, send: canWrite,
          expectedSend: channel.id === clientWriteChannelId
        }));
      }
    }
  } else {
    console.error('BENNY KLIENT UPRAWNIENIA: brak roli ' + clientRoleId);
  }
  let checkedEmployeePermissions = 0;
  let missingEmployeePermissions = 0;
  let incorrectlyWritableChannels = 0;
  const employeeRoles = staffKeys.map(key => roles[key]).filter(Boolean);
  for (const section of layout) {
    if (section.area === 'executive') continue;
    const category = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildCategory && c.name === section.name);
    if (!category) continue;
    for (const [type, name, topic, embedKey, overrideArea] of section.channels) {
      const channel = guild.channels.cache.find(c =>
        c.parentId === category.id && c.name === name);
      if (!channel) continue;
      const locked = readOnly.has(embedKey) || readOnlyChannels.has(name);
      for (const role of employeeRoles) {
        checkedEmployeePermissions++;
        const rights = channel.permissionsFor(role);
        const canRead = rights?.has(PermissionFlagsBits.ViewChannel) &&
          rights?.has(PermissionFlagsBits.ReadMessageHistory);
        const canWrite = rights?.has(PermissionFlagsBits.SendMessages) || false;
        if (!canRead) {
          missingEmployeePermissions++;
          console.error('BENNY DOSTEP: brak widoczności ' + role.name + ' -> ' + name);
        }
        if (locked && !managers.some(key => roles[key]?.id === role.id) && canWrite) {
          incorrectlyWritableChannels++;
          console.error('BENNY DOSTEP: niezamierzony zapis ' + role.name + ' -> ' + name);
        }
      }
    }
  }
  console.log('BENNY DOSTEP PRACOWNIKOW: sprawdzono ' + checkedEmployeePermissions +
    ' kombinacji kanał/stopień, brakujących=' + missingEmployeePermissions +
    ', niepoprawnych uprawnień pisania=' + incorrectlyWritableChannels +
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
    await activeGuild.channels.fetch();
    await activeGuild.roles.fetch();
    for (const id of ['1566479027089318069', '1566479020089151641', '1566809427573473440']) {
      const role = activeGuild.roles.cache.get(id);
      const channel = activeGuild.channels.cache.get(id);
      const parent = channel?.parentId ? activeGuild.channels.cache.get(channel.parentId) : null;
      console.log('BENNY TARGET ID CHECK: ' + JSON.stringify({
        id, role: role?.name || null, channel: channel?.name || null,
        type: channel?.type ?? null, parent: parent?.name || null
      }));
    }
    const obsoleteChannel = activeGuild.channels.cache.get(channelToDeleteId);
    if (obsoleteChannel) {
      try {
        await obsoleteChannel.delete('Benny’s: usunięcie kanału wzór-podania na prośbę administratora');
        console.log('BENNY KANAL USUNIETY: ' + channelToDeleteId + ' (' + obsoleteChannel.name + ')');
      } catch (error) {
        console.error('BENNY KANAL DELETE ERROR: ' + channelToDeleteId + ': ' + error.message);
      }
    }
    await runSetup(activeGuild);
    await activeGuild.roles.fetch();
    console.log('BENNY AUTOROLA: wymagany Server Members Intent=' +
      (process.env.DISCORD_ENABLE_MEMBERS_INTENT === 'true') +
      '; role=' + welcomeRoleIds.map(id => {
        const role = activeGuild.roles.cache.get(id);
        return role ? role.name + ' (' + id + ')' : 'BRAK (' + id + ')';
      }).join(', '));
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
    if (await promotionSystem.handle(interaction)) return;
    if (await antiRaid.handle(interaction)) return;
    if (await leaveSystem.handle(interaction)) return;
    if (interaction.isButton() && interaction.customId.startsWith('benny_work_')) {
      return workSystem.handle(interaction);
    }
    if (interaction.isStringSelectMenu() && interaction.customId === panelMenuId) {
      if (interaction.values[0] === 'rekrutacja') {
        return interaction.showModal(recruitmentApplicationModal());
      }
      return openTicket(interaction, interaction.values[0]);
    }
    if (interaction.isModalSubmit() && interaction.customId === recruitmentModalId) {
      return submitRecruitmentApplication(interaction);
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
      return interaction.reply({ content: '🏁 **Benny’s Motor Works**\n**/ticket** – prywatne zgłoszenie\n**/zamknij-ticket** – zamknij zgłoszenie\n**/ping** – stan bota\n**/clear** – usuń wiadomości (moderacja)\n**/setup** – skonfiguruj serwer (zarząd)\n**/panel-ticket** – odśwież panel ticketów (zarząd)\n**/urlop** – panel urlopów i nieobecności\n**/awans nick** – awans o jeden stopień (kierownictwo)\n**/degrad nick** – degradacja o jeden stopień (kierownictwo)\n**/antyraid** – ochrona przed raidami (zarząd)', ephemeral: true });
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
    await member.guild.roles.fetch();
    const self = await member.guild.members.fetchMe();
    const eligible = welcomeRoleIds.filter(id => {
      const role = member.guild.roles.cache.get(id);
      if (!role) {
        console.error('BENNY AUTOROLA: rola ' + id + ' nie istnieje.');
        return false;
      }
      if (role.managed || role.position >= self.roles.highest.position) {
        console.error('BENNY AUTOROLA: nie można przyznać ' + role.name +
          ' (' + id + '), zbyt wysoka pozycja lub rola zarządzana.');
        return false;
      }
      return true;
    });
    if (!self.permissions.has(PermissionFlagsBits.ManageRoles)) {
      console.error('BENNY AUTOROLA: bot wymaga Zarządzanie rolami.');
    } else if (eligible.length) {
      try {
        await member.roles.add(eligible, 'Benny’s: automatyczne role po wejściu na serwer');
        const freshMember = await member.guild.members.fetch({ user: member.id, force: true });
        const granted = welcomeRoleIds.filter(id => freshMember.roles.cache.has(id));
        console.log('BENNY AUTOROLA: użytkownik=' + member.id + ' przyznane=' + granted.join(', ') +
          (granted.length === welcomeRoleIds.length ? ' OK' : ' BRAK CZĘŚCI RÓL'));
      } catch (error) {
        console.error('BENNY AUTOROLA ERROR: ' + member.id + ': ' + error.message);
      }
    }
  } catch (error) {
    console.error('BENNY AUTOROLA SETUP ERROR: ' + error.message);
  }
  try {
    const channel = await member.guild.channels.fetch(welcomeChannelId).catch(error => {
      console.error('BENNY WELCOME: nie można pobrać kanału ' + welcomeChannelId + ': ' + error.message);
      return null;
    });
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.error('BENNY WELCOME: kanał powitalny ' + welcomeChannelId + ' nie jest dostępny jako kanał tekstowy.');
      return;
    }
    await member.guild.channels.fetch();
    const category = member.guild.channels.cache.get(channel.parentId) ||
      member.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '▶ LOBBY ◀');
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
