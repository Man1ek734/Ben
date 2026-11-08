import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

const STORE = process.env.PROMOTION_DATA_FILE || '/data/benny-promotions.json';
const CATEGORY = '● Strefa Pracownika';
const CHANNEL = '📈〢awanse-degrady';
const COLOR = 0xc21f30;
const RANK_PREFIX = '・';
const MANAGEMENT = new Set(['Opiekun Firm', 'Właściciel', 'Współwłaściciel', 'Dyrektor LSC', 'Kierownik']);
const clean = text => String(text || '').replace(/@/g, '@\u200b').slice(0, 450);

function load() {
  try {
    if (fs.existsSync(STORE)) {
      const raw = JSON.parse(fs.readFileSync(STORE, 'utf8'));
      return { nextId: Math.max(1, Math.floor(Number(raw.nextId) || 1)) };
    }
  } catch (error) {
    console.error('BENNY AWANS ODCZYT: ' + error.message);
  }
  return { nextId: 1 };
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
    if (interaction.guildId !== guildId || interaction.commandName !== 'awans') return false;

    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const actor = await guild.members.fetch(interaction.user.id);
    const isOwner = guild.ownerId === actor.id;
    const isManager = actor.roles.cache.some(role => MANAGEMENT.has(role.name.replace(/^・/, '')));
    if (!isOwner && !isManager && !actor.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.editReply('⛔ Komenda **/awans** jest dostępna tylko dla kierownictwa Benny’s.');
      return true;
    }

    const selected = interaction.options.getString('stopien', true);
    const spec = ranks.find(item => item.key === selected);
    if (!spec) {
      await interaction.editReply('❌ Nieznany stopień.');
      return true;
    }
    const user = interaction.options.getUser('pracownik', true);
    const reason = interaction.options.getString('powod', true).trim();
    if (user.bot || user.id === actor.id) {
      await interaction.editReply('❌ Nie można awansować bota ani samego siebie.');
      return true;
    }
    if (!reason) {
      await interaction.editReply('❌ Podaj uzasadnienie awansu.');
      return true;
    }
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.editReply('❌ Nie znaleziono pracownika na serwerze.');
      return true;
    }
    const bot = await guild.members.fetchMe();
    if (!bot.permissions.has(PermissionFlagsBits.ManageRoles) || !member.manageable) {
      await interaction.editReply('❌ Bot nie może zmienić ról tego użytkownika. Sprawdź hierarchię ról.');
      return true;
    }
    await guild.roles.fetch();
    const targetRole = guild.roles.cache.find(role => role.name === RANK_PREFIX + spec.name)
      || guild.roles.cache.find(role => role.name === spec.name);
    if (!targetRole || targetRole.managed || targetRole.position >= bot.roles.highest.position) {
      await interaction.editReply('❌ Docelowy stopień nie istnieje albo jest powyżej roli bota.');
      return true;
    }
    if (!isOwner && targetRole.position >= actor.roles.highest.position) {
      await interaction.editReply('❌ Nie możesz przyznać stopnia równego lub wyższego od własnego.');
      return true;
    }

    const currentRanks = ranks.map((rank, index) => {
      const role = member.roles.cache.find(role => role.name === RANK_PREFIX + rank.name ||
        role.name === rank.name);
      return role ? { role, index } : null;
    }).filter(Boolean);
    if (!currentRanks.length) {
      await interaction.editReply('❌ Użytkownik nie ma obecnego stopnia pracowniczego. Najpierw nadaj mu stopień początkowy.');
      return true;
    }
    const current = currentRanks.sort((a, b) => b.index - a.index)[0];
    const nextIndex = ranks.findIndex(rank => rank.key === spec.key);
    if (nextIndex <= current.index) {
      await interaction.editReply('❌ Awans musi prowadzić na **wyższy** stopień niż obecny: **' +
        current.role.name + '**.');
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

    const oldIds = currentRanks.map(rank => rank.role.id);
    const newIds = member.roles.cache
      .filter(role => role.id !== guild.id && !oldIds.includes(role.id))
      .map(role => role.id);
    newIds.push(targetRole.id);
    let updatedMember;
    try {
      updatedMember = await member.roles.set(newIds, 'Benny’s: awans na ' + targetRole.name +
        ' | przez ' + interaction.user.username + ' | ' + reason.slice(0, 200));
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

    const number = 'AWANS-' + String(data.nextId).padStart(4, '0');
    data.nextId++;
    try { save(data); } catch (error) {
      console.error('BENNY AWANS ZAPIS: ' + error.message);
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const logo = guild.iconURL({ size: 128 }) || client.user.displayAvatarURL({ size: 128 });
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor({ name: 'BENNY’S ORIGINAL MOTOR WORKS  •  DZIAŁ KADR', iconURL: logo })
      .setTitle('🏆  AWANS PRACOWNIKA')
      .setDescription(
        '### 🔥 NOWY POZIOM W EKIPIE BENNY’S\n' +
        '**' + clean(member.displayName) + '** otrzymuje zasłużony awans!\n' +
        'Gratulujemy i życzymy kolejnych świetnych realizacji. 🏁\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━'
      )
      .addFields(
        { name: '🚀 NOWY STOPIEŃ', value: '<@&' + targetRole.id + '>', inline: true },
        { name: '🔧 POPRZEDNI STOPIEŃ', value: '<@&' + current.role.id + '>', inline: true },
        { name: '👤 PRACOWNIK', value: '<@' + user.id + '>', inline: true },
        { name: '🛡️ AWANS PRZYZNAŁ', value: '<@' + actor.id + '>', inline: true },
        { name: '📋 UZASADNIENIE', value: clean(reason), inline: false },
        { name: '🗓️ DATA AWANSU', value: '<t:' + timestamp + ':F>', inline: false }
      )
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: 'BENNY’S • AWANSE I KARIERA  |  ' + number })
      .setTimestamp();

    try {
      const report = await channel.send({
        content: '<@' + user.id + '>',
        embeds: [embed],
        allowedMentions: { parse: [], users: [user.id], roles: [] }
      });
      console.log('BENNY AWANS GOTOWE: ' + number + ' użytkownik=' + user.id +
        ' ze=' + current.role.name + ' na=' + targetRole.name + ' przez=' + actor.id);
      await interaction.editReply('✅ Awans nadany: **' + member.displayName +
        '** → **' + targetRole.name + '**. Ogłoszenie: ' + report.url);
    } catch (error) {
      console.error('BENNY AWANS PUBLIKACJA ERROR: ' + error.message);
      await interaction.editReply('✅ Rola została zmieniona na **' + targetRole.name +
        '**, ale publikacja ogłoszenia się nie udała: ' + error.message.slice(0, 250));
    }
    return true;
  }

  async function handle(interaction) {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'awans' ||
        interaction.guildId !== guildId) return false;
    const task = jobs.then(() => run(interaction));
    jobs = task.catch(() => {});
    return task;
  }

  return { handle };
}
