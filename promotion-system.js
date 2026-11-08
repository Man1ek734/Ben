import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

const STORE = process.env.PROMOTION_DATA_FILE || '/data/benny-promotions.json';
const CATEGORY = '● Strefa Pracownika';
const CHANNEL = '📈〢awanse-degrady';
const COLOR = 0xc91e32;
const DEGRAD_COLOR = 0xeb8734;
const IGNORED_ROLE_ID = '1568798400521179328';
const RANK_PREFIX = '・';
const MANAGEMENT = new Set(['Opiekun Firm', 'Właściciel', 'Współwłaściciel', 'Dyrektor LSC', 'Kierownik']);
const clean = text => String(text || '').replace(/@/g, '@\u200b').replace(/[\r\n]+/g, ' ').slice(0, 120);
const nameOf = user => String(user.nick || user.user?.global_name || user.user?.username || user.user?.id || 'Użytkownik');
const normalize = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('pl-PL');

async function findByNick(guild, nick) {
  const query = nick.trim().replace(/^@(?=\D)/, '');
  const byId = query.match(/^<@!?(\d{17,20})>$/) || query.match(/^(\d{17,20})$/);
  if (byId) {
    const member = await guild.members.fetch({ user: byId[1], force: true }).catch(() => null);
    return { member };
  }
  let raw;
  try {
    raw = await guild.client.rest.get('/guilds/' + guild.id + '/members/search', {
      query: new URLSearchParams({ query, limit: '100' })
    });
  } catch (error) {
    console.error('BENNY AWANS NICK SEARCH: ' + error.message);
    return { error: '❌ Nie udało się wyszukać pracownika. Spróbuj wpisać jego pełny nick lub ID.' };
  }
  const entries = (Array.isArray(raw) ? raw : []).filter(item => item.user?.id);
  const names = item => [item.nick, item.user?.global_name, item.user?.username]
    .filter(Boolean).map(normalize);
  const needle = normalize(query);
  const exact = entries.filter(item => names(item).includes(needle));
  const starts = entries.filter(item => names(item).some(name => name.startsWith(needle)));
  const matches = exact.length ? exact : starts.length ? starts : entries;
  if (matches.length === 0) return { error: '❌ Nie znalazłem pracownika o nicku **' + clean(query) + '**.' };
  if (matches.length > 1) {
    return { error: '⚠️ Znalazłem kilka osób pasujących do nicku **' + clean(query) +
      '**: ' + matches.slice(0, 5).map(item => '**' + clean(nameOf(item)) + '**').join(', ') +
      '. Wpisz pełny nick lub ID użytkownika.' };
  }
  const member = await guild.members.fetch({ user: matches[0].user.id, force: true }).catch(() => null);
  if (!member) return { error: '❌ Nie mogę odczytać danych tego pracownika.' };
  return { member };
}

function load() {
  try {
    if (fs.existsSync(STORE)) {
      const raw = JSON.parse(fs.readFileSync(STORE, 'utf8'));
      return {
        nextId: Math.max(1, Math.floor(Number(raw.nextId) || 1)),
        nextDegradId: Math.max(1, Math.floor(Number(raw.nextDegradId) || 1))
      };
    }
  } catch (error) {
    console.error('BENNY AWANS ODCZYT: ' + error.message);
  }
  return { nextId: 1, nextDegradId: 1 };
}

function save(data) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  const tmp = STORE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, STORE);
}

export function createPromotionSystem(client, guildId, ranks, workSystem) {
  const data = load();
  let jobs = Promise.resolve();

  async function run(interaction) {
    if (interaction.guildId !== guildId ||
        !['awans', 'degrad'].includes(interaction.commandName)) return false;
    const isDegrad = interaction.commandName === 'degrad';

    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const actor = await guild.members.fetch(interaction.user.id);
    const isOwner = guild.ownerId === actor.id;
    const isManager = actor.roles.cache.some(role => MANAGEMENT.has(role.name.replace(/^・/, '')));
    if (!isOwner && !isManager && !actor.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.editReply('⛔ Komenda **/' + interaction.commandName + '** jest dostępna tylko dla kierownictwa Benny’s.');
      return true;
    }

    const nickname = interaction.options.getString('nick', true).trim();
    const found = await findByNick(guild, nickname);
    if (found.error || !found.member) {
      await interaction.editReply(found.error || '❌ Nie znaleziono pracownika.');
      return true;
    }
    const member = found.member;
    const user = member.user;
    if (user.bot || member.id === actor.id) {
      await interaction.editReply('❌ Nie można awansować bota ani samego siebie.');
      return true;
    }
    const bot = await guild.members.fetchMe();
    if (!bot.permissions.has(PermissionFlagsBits.ManageRoles) || !member.manageable) {
      await interaction.editReply('❌ Bot nie może zmienić ról tego użytkownika. Sprawdź hierarchię ról.');
      return true;
    }
    await guild.roles.fetch();
    const currentRanks = ranks.map((rank, index) => {
      const role = member.roles.cache.find(role => role.id !== IGNORED_ROLE_ID &&
        (role.name === RANK_PREFIX + rank.name || role.name === rank.name));
      return role ? { role, index } : null;
    }).filter(Boolean);
    if (!currentRanks.length) {
      await interaction.editReply('❌ Użytkownik nie ma obecnego stopnia pracowniczego. Najpierw nadaj mu stopień początkowy.');
      return true;
    }
    const current = currentRanks.sort((a, b) => b.index - a.index)[0];
    const next = ranks[current.index + (isDegrad ? -1 : 1)];
    if (!next) {
      await interaction.editReply(isDegrad
        ? 'ℹ️ **' + clean(member.displayName) +
          '** ma już najniższy stopień: **' + clean(current.role.name) + '**.'
        : 'ℹ️ **' + clean(member.displayName) +
          '** ma już najwyższy stopień: **' + clean(current.role.name) + '**.');
      return true;
    }
    const targetRole = guild.roles.cache.find(role => role.name === RANK_PREFIX + next.name)
      || guild.roles.cache.find(role => role.name === next.name);
    if (!targetRole || targetRole.managed || targetRole.position >= bot.roles.highest.position) {
      await interaction.editReply('❌ Brakuje właściwego stopnia **' + next.name +
        '** albo bot nie może go nadać. Nie pomijam stopni.');
      return true;
    }
    if (!isOwner && (targetRole.position >= actor.roles.highest.position ||
        current.role.position >= actor.roles.highest.position)) {
      await interaction.editReply('❌ Nie możesz zmienić stopnia równego lub wyższego od własnego.');
      return true;
    }
    const category = guild.channels.cache.find(channel =>
      channel.type === ChannelType.GuildCategory && channel.name === CATEGORY);
    const channel = guild.channels.cache.find(channel => channel.parentId === category?.id &&
      channel.name === CHANNEL && channel.isTextBased());
    if (!channel) {
      await interaction.editReply('❌ Nie znaleziono kanału ogłoszeń awansów.');
      return true;
    }
    const channelPermissions = channel.permissionsFor(bot);
    if (!channelPermissions?.has(PermissionFlagsBits.SendMessages) ||
        !channelPermissions?.has(PermissionFlagsBits.EmbedLinks)) {
      await interaction.editReply('❌ Bot nie ma uprawnień do publikowania awansów na kanale <#' +
        channel.id + '>.');
      return true;
    }

    const oldIds = currentRanks.map(rank => rank.role.id)
      .filter(id => id !== IGNORED_ROLE_ID);
    const newIds = member.roles.cache
      .filter(role => role.id !== guild.id && !oldIds.includes(role.id))
      .map(role => role.id);
    if (!newIds.includes(targetRole.id)) newIds.push(targetRole.id);
    if (member.roles.cache.has(IGNORED_ROLE_ID) && !newIds.includes(IGNORED_ROLE_ID)) {
      await interaction.editReply('❌ Nie mogę wykonać operacji bez zachowania roli kategorii pracowników.');
      return true;
    }
    let updatedMember;
    try {
      updatedMember = await member.roles.set(newIds, 'Benny’s: ' +
        (isDegrad ? 'degradacja' : 'awans') + ' o jeden stopień na ' +
        targetRole.name + ' | wykonał ' + interaction.user.username);
    } catch (error) {
      console.error('BENNY AWANS ROLE ERROR: ' + error.message);
      await interaction.editReply('❌ Nie udało się zmienić roli: ' + error.message.slice(0, 250));
      return true;
    }
    try {
      await workSystem.roleChanged(member, updatedMember);
    } catch (error) {
      console.error('BENNY AWANS GODZINY: ' + error.message);
    }

    const number = isDegrad
      ? 'DEGRAD-' + String(data.nextDegradId++).padStart(4, '0')
      : 'AWANS-' + String(data.nextId++).padStart(4, '0');
    try { save(data); } catch (error) {
      console.error('BENNY AWANS ZAPIS: ' + error.message);
    }
    const logo = guild.iconURL({ size: 128 }) || client.user.displayAvatarURL({ size: 128 });
    const embed = new EmbedBuilder()
      .setColor(isDegrad ? DEGRAD_COLOR : COLOR)
      .setAuthor({ name: 'BENNY’S ORIGINAL MOTOR WORKS  •  KADRY', iconURL: logo })
      .setTitle(isDegrad ? '📉  DEGRADACJA PRACOWNIKA' : '🏆  AWANS W BENNY’S')
      .setDescription(
        '**' + clean(member.displayName) + '** ' +
        (isDegrad ? 'zostaje przeniesiony na niższy stopień służbowy.' :
          'awansuje na kolejny stopień!') + '\n' +
        (isDegrad ? 'Decyzja kierownictwa Benny’s Original Motor Works.' :
          'Doceniamy zaangażowanie i pracę na rzecz warsztatu.\n\n' +
          '**Gratulujemy i życzymy dalszych sukcesów!**')
      )
      .addFields(
        { name: '🔧 POPRZEDNI STOPIEŃ', value: clean(current.role.name), inline: true },
        { name: isDegrad ? '📉 NOWY STOPIEŃ' : '🚀 NOWY STOPIEŃ',
          value: '**' + clean(targetRole.name) + '**', inline: true },
        { name: isDegrad ? '🛡️ DEGRADACJĘ WYKONAŁ' : '🛡️ AWANS PRZYZNAŁ',
          value: '<@' + actor.id + '>', inline: false }
      )
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: 'BENNY’S • KADRY   |   ' + number })
      .setTimestamp();

    try {
      const report = await channel.send({
        content: '<@' + user.id + '>',
        embeds: [embed],
        allowedMentions: { parse: [], users: [user.id], roles: [] }
      });
      console.log('BENNY ' + (isDegrad ? 'DEGRAD' : 'AWANS') + ' GOTOWE: ' +
        number + ' użytkownik=' + user.id +
        ' ze=' + current.role.name + ' na=' + targetRole.name + ' przez=' + actor.id);
      await interaction.editReply('✅ ' + (isDegrad ? 'Wykonano degradację' : 'Przyznano awans') +
        ': **' + member.displayName + '** → **' + targetRole.name +
        '**. Ogłoszenie: ' + report.url);
    } catch (error) {
      console.error('BENNY ' + (isDegrad ? 'DEGRAD' : 'AWANS') +
        ' PUBLIKACJA ERROR: ' + error.message);
      await interaction.editReply('✅ Rola została zmieniona na **' + targetRole.name +
        '**, ale publikacja ogłoszenia się nie udała: ' + error.message.slice(0, 250));
    }
    return true;
  }

  async function handle(interaction) {
    if (!interaction.isChatInputCommand() ||
        !['awans', 'degrad'].includes(interaction.commandName) ||
        interaction.guildId !== guildId) return false;
    const task = jobs.then(() => run(interaction));
    jobs = task.catch(() => {});
    return task;
  }

  return { handle };
}
