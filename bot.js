import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder
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

const layout = [
  {
    name: '🏁・START',
    area: 'public',
    channels: [
      ['text', '👋・start-tutaj', 'Najważniejsze informacje dla nowych członków.', 'start'],
      ['text', '📜・regulamin', 'Zasady społeczności Benny’s Motor Works.', 'rules'],
      ['text', '📢・ogłoszenia', 'Oficjalne komunikaty zarządu.', 'announcements'],
      ['text', '🏷️・odbierz-role', 'Stopnie i stanowiska przydzielane przez kierownictwo.', 'roles']
    ]
  },
  {
    name: '🚘・BENNY’S MOTOR WORKS',
    area: 'public',
    channels: [
      ['text', '🛠️・oferta-usług', 'Informacje o tuningu i usługach warsztatu.', 'offer'],
      ['text', '💰・cennik', 'Wycena usług ustalana indywidualnie.', 'prices'],
      ['text', '📸・nasze-realizacje', 'Zdjęcia i efekty pracy mechaników.'],
      ['text', '📝・zamówienia', 'Zapytania o naprawy i modyfikacje pojazdów.'],
      ['text', '📅・wolne-terminy', 'Dostępność i ustalanie wizyt.'],
      ['text', '⭐・opinie-klientów', 'Opinie po skorzystaniu z usług.']
    ]
  },
  {
    name: '💬・SPOŁECZNOŚĆ',
    area: 'public',
    channels: [
      ['text', '💬・general', 'Rozmowy społeczności Benny’s.'],
      ['text', '❓・pytania', 'Zapytaj ekipę lub innych członków.'],
      ['text', '📷・galeria-aut', 'Pochwal się swoim pojazdem.'],
      ['text', '🎮・off-topic', 'Rozmowy poza tematem motoryzacji.'],
      ['text', '🤖・komendy-bota', 'Testuj komendy /ping, /pomoc i inne.']
    ]
  },
  {
    name: '🎫・POMOC I ZGŁOSZENIA',
    area: 'public',
    channels: [
      ['text', '🎟️・otwórz-ticket', 'Wpisz /ticket, aby utworzyć prywatne zgłoszenie.', 'tickets'],
      ['text', '📌・pomoc', 'Pytania dotyczące zamówień i działania serwera.']
    ]
  },
  {
    name: '🔧・STREFA MECHANIKÓW',
    area: 'staff',
    channels: [
      ['text', '💬・ekipa-chat', 'Prywatny kanał pracowników.'],
      ['text', '📋・zlecenia-ekipy', 'Zlecenia i przydział pracy.'],
      ['text', '🔩・magazyn-części', 'Informacje o częściach i wyposażeniu.'],
      ['text', '📆・grafik-pracy', 'Ustalenia dotyczące zmian i dyżurów.'],
      ['text', '🧾・raporty-z-napraw', 'Raporty i zakończone naprawy.']
    ]
  },
  {
    name: '👑・ZARZĄD',
    area: 'executive',
    channels: [
      ['text', '💬・zarząd-chat', 'Prywatna dyskusja osób zarządzających.'],
      ['text', '📊・finanse', 'Wewnętrzne rozliczenia.'],
      ['text', '📑・decyzje', 'Ustalenia zarządu.']
    ]
  },
  {
    name: '🔊・KANAŁY GŁOSOWE',
    area: 'public',
    channels: [
      ['voice', '🔊・Poczekalnia'],
      ['voice', '🚗・Garaż 1'],
      ['voice', '🏎️・Garaż 2'],
      ['voice', '🔧・Ekipa', '', '', 'staff'],
      ['voice', '👑・Zarząd', '', '', 'executive']
    ]
  }
];

const readOnly = new Set(['start', 'rules', 'announcements', 'roles', 'offer', 'prices', 'tickets']);

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Sprawdź, czy bot jest online'),
  new SlashCommandBuilder().setName('pomoc').setDescription('Zobacz dostępne komendy'),
  new SlashCommandBuilder()
    .setName('ticket').setDescription('Otwórz prywatne zgłoszenie do mechaników')
    .addStringOption(o => o.setName('opis').setDescription('Krótki opis sprawy').setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName('zamknij-ticket').setDescription('Zamknij bieżące zgłoszenie'),
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
    tickets: ['🎫 PRYWATNE ZGŁOSZENIA', 'Wpisz **/ticket opis:Twoja sprawa**, aby utworzyć prywatny kanał dostępny tylko dla Ciebie i ekipy.\n\nPo zakończeniu sprawy użyj **/zamknij-ticket**.']
  };
  const data = contents[key];
  if (!data) return null;
  return new EmbedBuilder().setColor(0xb61c25).setTitle(data[0]).setDescription(data[1]).setFooter({ text: 'BENNY’S ORIGINAL MOTOR WORKS • EST. LOS SANTOS' });
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
      await guild.roles.setPositions(desired.map((role, index) => ({ role: role.id, position: positions[index] })));
      await guild.roles.fetch();
      const after = desired.map(role => ({ name: role.name, position: guild.roles.cache.get(role.id)?.position }));
      console.log('BENNY RANKS: pozycje po sortowaniu: ' + JSON.stringify(after));
      const correct = after.every((entry, index) => index === 0 || after[index - 1].position > entry.position);
      console.log(correct ? 'BENNY RANKS GOTOWE: Właściciel > Współwłaściciel > ... > Nowy' : 'BENNY RANKS: kolejność nie została w pełni zastosowana');
    }
  } catch (error) {
    console.error('BENNY RANKS: błąd zmiany kolejności: ' + error.message);
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
    for (const [type, name, topic, embedKey, overrideArea] of section.channels) {
      const kind = type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
      const existing = guild.channels.cache.find(c => c.parentId === category.id && c.type === kind && c.name === name);
      const area = overrideArea || section.area;
      if (existing) {
        const overwrites = permissionsFor(guild, roles, area, client.user.id, readOnly.has(embedKey));
        if (!overwritesMatch(existing, overwrites)) {
          await existing.permissionOverwrites.set(overwrites, 'Aktualizacja dostępu do kanałów Benny’s');
        }
        continue;
      }
      const options = {
        name, type: kind, parent: category.id,
        permissionOverwrites: permissionsFor(guild, roles, area, client.user.id, readOnly.has(embedKey)),
        reason: 'Konfiguracja kanałów Benny’s Motor Works'
      };
      if (kind === ChannelType.GuildText && topic) options.topic = topic;
      if (kind === ChannelType.GuildVoice) options.userLimit = 0;
      const channel = await guild.channels.create(options);
      madeChannels++;
      console.log('BENNY SETUP: kanał ' + channel.name);
      if (kind === ChannelType.GuildText && embedKey) {
        const embed = introEmbed(embedKey);
        if (embed) {
          try { await channel.send({ embeds: [embed] }); }
          catch (err) { console.error('BENNY SETUP: nie udało się wysłać powitania na ' + name + ': ' + err.message); }
        }
      }
    }
  }
  const summary = 'Utworzono ' + madeRoles + ' ról, ' + madeCategories + ' kategorii i ' + madeChannels + ' kanałów.';
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
  if (!interaction.isChatInputCommand() || interaction.guildId !== guildId) return;
  try {
    const name = interaction.commandName;
    if (name === 'ping') {
      return interaction.reply({ content: '🏎️ Pong! Benny’s jest online.', ephemeral: true });
    }
    if (name === 'pomoc') {
      return interaction.reply({ content: '🏁 **Benny’s Motor Works**\n**/ticket** – prywatne zgłoszenie\n**/zamknij-ticket** – zamknij zgłoszenie\n**/ping** – stan bota\n**/clear** – usuń wiadomości (moderacja)\n**/setup** – skonfiguruj serwer (zarząd)', ephemeral: true });
    }
    if (name === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'Nie masz dostępu do konfiguracji.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const result = await runSetup(interaction.guild);
      return interaction.editReply(result.ok ? '✅ ' + result.summary : '❌ ' + result.reason);
    }
    if (name === 'ticket') {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;
      await guild.channels.fetch();
      const found = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === 'BENNY_TICKET_OWNER:' + interaction.user.id);
      if (found) return interaction.editReply('Masz już otwarty ticket: <#' + found.id + '>.');
      const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '🎫・POMOC I ZGŁOSZENIA');
      if (!category) return interaction.editReply('Najpierw administrator musi wykonać /setup.');
      const roles = {};
      for (const spec of ranks) roles[spec.key] = guild.roles.cache.find(r => r.name === spec.name);
      const overwrites = permissionsFor(guild, roles, 'staff', client.user.id);
      overwrites.push({ id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], deny: [] });
      const channel = await guild.channels.create({
        name: 'ticket-' + interaction.user.id.slice(-6),
        type: ChannelType.GuildText, parent: category.id,
        topic: 'BENNY_TICKET_OWNER:' + interaction.user.id,
        permissionOverwrites: overwrites,
        reason: 'Ticket Benny’s utworzony przez ' + interaction.user.username
      });
      await channel.send({ embeds: [new EmbedBuilder().setColor(0x1669a9).setTitle('🎫 Nowe zgłoszenie').setDescription('**Klient:** <@' + interaction.user.id + '>\n**Sprawa:** ' + interaction.options.getString('opis', true) + '\n\nAby zakończyć zgłoszenie, wpisz **/zamknij-ticket**.')] });
      return interaction.editReply('✅ Otworzono prywatne zgłoszenie: <#' + channel.id + '>.');
    }
    if (name === 'zamknij-ticket') {
      const channel = interaction.channel;
      const match = channel.topic && channel.topic.match(/^BENNY_TICKET_OWNER:(\d+)$/);
      if (!match) return interaction.reply({ content: 'Tę komendę można wykonać tylko w kanale ticketu.', ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) || member.roles.cache.some(role => staffKeys.some(key => ranks.find(r => r.key === key)?.name === role.name));
      if (interaction.user.id !== match[1] && !isStaff) return interaction.reply({ content: 'Nie możesz zamknąć tego zgłoszenia.', ephemeral: true });
      await interaction.reply({ content: '✅ Zgłoszenie zostaje zamknięte.', ephemeral: true });
      return channel.delete('Zamknięcie ticketu przez ' + interaction.user.username);
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
