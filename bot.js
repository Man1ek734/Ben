import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle
} from 'discord.js';

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

const staffKeys = ranks.map(rank => rank.key);
const managers = ['manager', 'director', 'coowner', 'owner'];
const executives = ['director', 'coowner', 'owner'];

const legacyLayout = {
  '🏁・START': ['👋・start-tutaj', '📜・regulamin', '📢・ogłoszenia', '🏷️・odbierz-role'],
  '🚘・BENNY’S MOTOR WORKS': ['🛠️・oferta-usług', '💰・cennik', '📸・nasze-realizacje', '📝・zamówienia', '📅・wolne-terminy', '⭐・opinie-klientów'],
  '💬・SPOŁECZNOŚĆ': ['💬・general', '❓・pytania', '📷・galeria-aut', '🎮・off-topic', '🤖・komendy-bota'],
  '🎫・POMOC I ZGŁOSZENIA': ['🎟️・otwórz-ticket', '📌・pomoc'],
  '🔧・STREFA MECHANIKÓW': ['💬・ekipa-chat', '📋・zlecenia-ekipy', '🔩・magazyn-części', '📆・grafik-pracy', '🧾・raporty-z-napraw'],
  '👑・ZARZĄD': ['💬・zarząd-chat', '📊・finanse', '📑・decyzje'],
  '🔊・KANAŁY GŁOSOWE': ['🔊・Poczekalnia', '🚗・Garaż 1', '🏎️・Garaż 2', '🔧・Ekipa', '👑・Zarząd']
};

const legacyMoves = {
  '⭕〢wprowadzenie': ['🏁・START', '👋・start-tutaj'],
  '📜〢zasady': ['🏁・START', '📜・regulamin'],
  '💬〢ogłoszenia': ['🏁・START', '📢・ogłoszenia'],
  '🎫〢cennik': ['🚘・BENNY’S MOTOR WORKS', '💰・cennik'],
  '💬〢pracowniczy-chat': ['🔧・STREFA MECHANIKÓW', '💬・ekipa-chat'],
  '📌〢zarzad-chat': ['👑・ZARZĄD', '💬・zarząd-chat']
};

const layout = [
  {
    name: '●', area: 'executive', channels: [
      ['text', '📁〢zaproszenia', 'Zaproszenia i materiały dla zarządu.']
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
      ['text', '💬〢ogłoszenia', 'Oficjalne wiadomości Benny’s.', 'announcements'],
      ['text', '💬〢zebrania', 'Komunikaty o zebraniach.', 'announcements', 'staff'],
      ['text', '💵〢tygodniówki', 'Informacje o tygodniowych wypłatach.', 'announcements', 'staff'],
      ['text', '🎫〢cennik', 'Cennik usług Benny’s.', 'prices'],
      ['text', '⭕〢wprowadzenie', 'Najważniejsze informacje dla nowych członków.', 'start'],
      ['text', '📜〢zasady', 'Zasady serwera i pracy w Benny’s.', 'rules'],
      ['text', '📜〢czarna-lista', 'Wewnętrzna lista ograniczeń.', 'announcements', 'staff'],
      ['text', '📜〢changelog', 'Aktualizacje i zmiany.', 'announcements'],
      ['text', '⏰ wyrobione-godziny', 'Raporty przepracowanych godzin.', '', 'staff']
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
  }
];

const readOnly = new Set(['start', 'rules', 'announcements', 'roles', 'offer', 'prices', 'tickets', 'form', 'partners']);

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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
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
  result.push({ id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.Connect], deny: [] });
  return result;
}

function introEmbed(key) {
  const contents = {
    start: ['🏁 WITAJ W BENNY’S!', 'Witaj na oficjalnym serwerze **Benny’s Original Motor Works**! 🚘\n\n📜 Zapoznaj się z regulaminem.\n🏷️ Stopnie pracownicze nadaje kierownictwo.\n🛠️ Sprawdź ofertę i pochwal się swoim autem.\n🎫 Potrzebujesz pomocy? Wpisz **/ticket**.'],
    rules: ['📜 REGULAMIN SERWERA', '🤝 Traktuj innych z szacunkiem.\n🚫 Zakaz spamu, obrażania i nękania.\n🔒 Nie publikuj danych prywatnych.\n📢 Reklamy tylko za zgodą administracji.\n🎫 Sprawy prywatne zgłaszaj poprzez **/ticket**.\n\nAdministracja może reagować na naruszenia zasad.'],
    announcements: ['📢 OGŁOSZENIA', 'Tutaj ekipa Benny’s publikuje oficjalne informacje, zmiany i ważne komunikaty. 🏁'],
    roles: ['🏷️ ODBIERZ ROLĘ', 'Na serwerze obowiązuje 16 stopni od **Nowy** do **Właściciel**.\n\nStopnie pracownicze przydziela kierownictwo warsztatu.'],
    offer: ['🛠️ NASZE USŁUGI', '🚗 Naprawy i diagnostyka\n🏎️ Tuning i personalizacja\n🎨 Stylizacja i wykończenie\n🔧 Konsultacje techniczne\n\nNapisz w kanale zamówień, aby omówić szczegóły.'],
    prices: ['💰 CENNIK', 'Ceny zależą od zakresu prac i rodzaju pojazdu. Zapytaj ekipę o indywidualną wycenę na kanale **zamówienia**.'],
    tickets: ['🎫 PRYWATNE ZGŁOSZENIA', 'Wybierz kategorię z menu poniżej, aby otworzyć prywatny ticket.'],
    form: ['🟥 WZÓR PODANIA', 'Przygotuj zgłoszenie z imieniem RP, doświadczeniem, dyspozycyjnością i uzasadnieniem chęci dołączenia do Benny’s. Wpisz **/ticket**, aby przesłać podanie prywatnie.']
  };
  const data = contents[key];
  if (!data) return null;
  return new EmbedBuilder().setColor(0xb61c25).setTitle(data[0]).setDescription(data[1]).setFooter({ text: 'BENNY’S ORIGINAL MOTOR WORKS • EST. LOS SANTOS' });
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
    for (const [type, name, topic, embedKey, overrideArea] of section.channels) {
      const kind = type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
      const area = overrideArea || section.area;
      const overwrites = permissionsFor(guild, roles, area, client.user.id, readOnly.has(embedKey));
      let channel = guild.channels.cache.find(c => c.parentId === category.id && c.type === kind && c.name === name && !usedChannelIds.has(c.id));
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
      if (kind === ChannelType.GuildText && embedKey) {
        const embed = introEmbed(embedKey);
        if (embed) {
          try { await channel.send({ embeds: [embed] }); }
          catch (error) { console.error('BENNY LAYOUT: błąd publikacji na ' + name + ': ' + error.message); }
        }
      }
    }
  }
  const oldTicketCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '🎫・POMOC I ZGŁOSZENIA');
  const newTicketCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '● TICKETY');
  if (oldTicketCategory && newTicketCategory) {
    for (const channel of guild.channels.cache.filter(c => c.parentId === oldTicketCategory.id && c.type === ChannelType.GuildText && c.topic?.startsWith('BENNY_TICKET_OWNER:')).values()) {
      await channel.setParent(newTicketCategory.id, { lockPermissions: false, reason: 'Zachowanie aktywnego ticketu w nowej kategorii' });
      console.log('BENNY LAYOUT: zachowano aktywny ticket ' + channel.name);
    }
  }

  let deletedChannels = 0;
  let deletedCategories = 0;
  await guild.channels.fetch();
  for (const [oldName, oldChannelNames] of Object.entries(legacyLayout)) {
    const oldCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === oldName);
    if (!oldCategory) continue;
    const knownOld = new Set(oldChannelNames);
    for (const channel of guild.channels.cache.filter(c => c.parentId === oldCategory.id && knownOld.has(c.name)).values()) {
      await channel.delete('Zastąpienie kanałów poprzedniego układu Benny’s zgodnie z życzeniem właściciela');
      deletedChannels++;
      console.log('BENNY LAYOUT: usunięto dawny kanał ' + channel.name);
    }
    await guild.channels.fetch();
    const remaining = guild.channels.cache.filter(c => c.parentId === oldCategory.id);
    if (remaining.size === 0) {
      await oldCategory.delete('Usunięcie pustej kategorii poprzedniego układu Benny’s');
      deletedCategories++;
      console.log('BENNY LAYOUT: usunięto dawną kategorię ' + oldName);
    } else {
      console.log('BENNY LAYOUT: pozostawiono kategorię ' + oldName + ' ze względu na ' + remaining.size + ' inne kanały');
    }
  }
  try {
    await ensureTicketPanel(guild);
  } catch (error) {
    console.error('BENNY TICKETY: błąd panelu: ' + error.message);
  }
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
    await runSetup(await guild.fetch());
  } catch (error) {
    console.error('BENNY SETUP ERROR: ' + error.message);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.guildId !== guildId) return;
  try {
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
      await interaction.channel.delete('Benny’s: zamknięcie ticketu przez ' + interaction.user.username);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const name = interaction.commandName;
    if (name === 'ping') {
      return interaction.reply({ content: '🏎️ Pong! Benny’s jest online.', ephemeral: true });
    }
    if (name === 'pomoc') {
      return interaction.reply({ content: '🏁 **Benny’s Motor Works**\n**/ticket** – prywatne zgłoszenie\n**/zamknij-ticket** – zamknij zgłoszenie\n**/ping** – stan bota\n**/clear** – usuń wiadomości (moderacja)\n**/setup** – skonfiguruj serwer (zarząd)\n**/panel-ticket** – odśwież panel ticketów (zarząd)', ephemeral: true });
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

client.login(token);
