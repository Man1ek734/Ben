import { Events, EmbedBuilder, AuditLogEvent, PermissionFlagsBits } from 'discord.js';

const GUILD_ID = '1566469722365493340';
const LOG_CHANNEL_ID = '1566480686351650837';
const THEME = {
  deleted: 0xe65058,
  joined: 0x35c99b,
  left: 0x9099ab,
  kicked: 0xffa53d,
  banned: 0xf03e56,
  muted: 0xf2b84a,
  unmuted: 0x3db9d4,
  roleAdded: 0x55c9f0,
  roleRemoved: 0xfa799d
};
const MAX_CONTENT = 950;
const LIMIT_MS = 15000;
const mention = id => id ? '<@' + id + '>' : 'Nieznany użytkownik';
const location = id => id ? '<#' + id + '>' : 'Nieznany kanał';
const trim = (text, limit = MAX_CONTENT) => {
  const value = String(text ?? '').trim();
  return value ? (value.length > limit ? value.slice(0, limit - 1) + '…' : value) : 'Brak danych';
};
const occurredAt = time => '<t:' + Math.floor(time / 1000) + ':F>';
const userImage = user => {
  try { return user?.displayAvatarURL({ size: 256 }) || null; } catch { return null; }
};

export function registerServerLogs(client) {
  let pipeline = Promise.resolve();
  const recently = new Map();

  const once = (key, period = LIMIT_MS) => {
    const now = Date.now();
    for (const [name, value] of recently) if (now - value > 60000) recently.delete(name);
    if (recently.has(key) && now - recently.get(key) < period) return false;
    recently.set(key, now);
    return true;
  };
  const note = async (guild, type, title, description, fields, user = null, eventTime = Date.now()) => {
    if (guild?.id !== GUILD_ID) return false;
    pipeline = pipeline.catch(() => {}).then(async () => {
      try {
        const channel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (!channel?.isTextBased()) return false;
        const logo = guild.iconURL({ size: 128 }) || client.user.displayAvatarURL({ size: 128 });
        const embed = new EmbedBuilder()
          .setColor(THEME[type] || THEME.left)
          .setAuthor({ name: 'BENNY’S ORIGINAL MOTOR WORKS  •  LOGI', iconURL: logo })
          .setTitle(title)
          .setDescription(trim(description, 1800))
          .addFields(
            ...fields.filter(([, value]) => value !== null && value !== undefined)
              .slice(0, 12).map(([name, value]) => ({
                name: trim(name, 220),
                value: trim(value, 980),
                inline: ['👤 Użytkownik', '🛡️ Moderator', '📍 Kanał', '⏳ Czas trwania'].includes(name)
              }))
          )
          .setFooter({ text: 'BENNY’S  •  BEZPIECZEŃSTWO I MODERACJA' })
          .setTimestamp(eventTime);
        const avatar = userImage(user);
        if (avatar) embed.setThumbnail(avatar);
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        return true;
      } catch (error) {
        console.error('BENNY LOGI: ' + error.message);
        return false;
      }
    });
    return pipeline;
  };
  const event = (name, listener) => client.on(name, (...args) => {
    Promise.resolve().then(() => listener(...args))
      .catch(error => console.error('BENNY LOGI [' + String(name) + ']: ' + error.message));
  });
  const findAudit = async (guild, action, userId) => {
    try {
      const result = await guild.fetchAuditLogs({ type: action, limit: 8 });
      return result.entries.find(entry =>
        entry.target?.id === userId &&
        Math.abs(Date.now() - entry.createdTimestamp) < 12000
      ) || null;
    } catch { return null; }
  };
  const moderatorField = entry => entry?.executor?.id ? mention(entry.executor.id) : 'Nie ustalono';
  const reasonField = entry => trim(entry?.reason || 'Nie podano');
  const subject = (entry, fallback = null) => entry?.target?.displayAvatarURL ? entry.target : fallback;
  const auditUser = entry => entry?.target?.id || entry?.targetId || null;
  const handleKick = (guild, entry, fallback = null) => {
    const id = auditUser(entry) || fallback?.id;
    if (!id || !once('kick:' + id)) return;
    return note(guild, 'kicked', '👢  UŻYTKOWNIK WYRZUCONY', 
      'Pracownik moderacji usunął użytkownika z serwera.', [
        ['👤 Użytkownik', mention(id)],
        ['🛡️ Moderator', moderatorField(entry)],
        ['📝 Powód', reasonField(entry)],
        ['🕒 Data zdarzenia', occurredAt(Date.now())]
      ], subject(entry, fallback));
  };
  const handleBan = (guild, entry, fallback = null) => {
    const id = auditUser(entry) || fallback?.id;
    if (!id || !once('ban:' + id)) return;
    return note(guild, 'banned', '🔨  NAŁOŻONO BANA',
      'Użytkownik został zablokowany na serwerze Benny’s.', [
        ['👤 Użytkownik', mention(id)],
        ['🛡️ Moderator', moderatorField(entry)],
        ['📝 Powód', reasonField(entry)],
        ['🕒 Data zdarzenia', occurredAt(Date.now())]
      ], subject(entry, fallback));
  };
  const handleTimeout = (guild, memberId, until, entry = null, user = null) => {
    if (!memberId || !once('timeout:' + memberId + ':' + (until || 'off'))) return;
    const active = !!until && new Date(until).getTime() > Date.now();
    const ms = active ? new Date(until).getTime() - Date.now() : 0;
    const interval = ms >= 3600000 ? Math.ceil(ms / 3600000) + ' godz.' :
      ms >= 60000 ? Math.ceil(ms / 60000) + ' min' :
        ms ? Math.ceil(ms / 1000) + ' s' : 'Zakończono';
    return note(guild, active ? 'muted' : 'unmuted',
      active ? '🔇  NADANO MUTE' : '🔊  ZDJĘTO MUTE',
      active ? 'Użytkownik otrzymał ograniczenie komunikacji (timeout).' :
        'Ograniczenie komunikacji użytkownika zostało zdjęte.', [
          ['👤 Użytkownik', mention(memberId)],
          ['🛡️ Moderator', moderatorField(entry)],
          ['⏳ Czas trwania', interval],
          ['📝 Powód', reasonField(entry)],
          ['🕒 Do kiedy', active ? '<t:' + Math.floor(new Date(until).getTime() / 1000) + ':F>' : 'Nie dotyczy']
        ], user);
  };

  const roleChanges = (guild, entry) => {
    const memberId = auditUser(entry);
    if (!memberId) return;
    const groups = [
      { key: '$add', type: 'roleAdded', title: '✨  NADANO ROLĘ',
        description: 'Użytkownikowi przypisano nową rolę na serwerze.' },
      { key: '$remove', type: 'roleRemoved', title: '➖  ODEBRANO ROLĘ',
        description: 'Użytkownikowi usunięto przypisaną wcześniej rolę.' }
    ];
    const results = [];
    for (const group of groups) {
      const changed = entry.changes?.filter(change => change.key === group.key) || [];
      const roles = changed.flatMap(change => Array.isArray(change.new) ? change.new : []);
      if (!roles.length || !once('role:' + entry.id + ':' + group.key, 60000)) continue;
      const list = roles.map(role => role.id ? '<@&' + role.id + '>' : trim(role.name || 'Nieznana rola', 120))
        .join('\n');
      results.push(note(guild, group.type, group.title, group.description, [
        ['👤 Użytkownik', mention(memberId)],
        ['🎭 Rola', trim(list, 950)],
        ['🛡️ Moderator', moderatorField(entry)],
        ['📝 Powód', reasonField(entry)],
        ['🕒 Data zdarzenia', occurredAt(entry.createdTimestamp || Date.now())]
      ], subject(entry), entry.createdTimestamp || Date.now()));
    }
    return Promise.all(results);
  };

  event(Events.ClientReady, async () => {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.roles.fetch();
    const channel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased()) {
      console.error('BENNY LOGI: brak dostępu do kanału ' + LOG_CHANNEL_ID);
      return;
    }
    if (channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
    }
    for (const name of ['Dyrektor LSC', 'Współwłaściciel', 'Właściciel', 'Opiekun Firm']) {
      const role = guild.roles.cache.find(item => item.name === '・' + name) ||
        guild.roles.cache.find(item => item.name === name);
      if (role) await channel.permissionOverwrites.edit(role, {
        ViewChannel: true, ReadMessageHistory: true
      }).catch(error => console.error('BENNY LOGI ROLA ' + name + ': ' + error.message));
    }
    console.log('BENNY LOGI GOTOWE: tylko wiadomości usunięte / wejścia / wyjścia / kick / ban / mute / role, kanał=' + LOG_CHANNEL_ID);
  });

  event(Events.MessageDelete, message => {
    if (!message.guild || message.guildId !== GUILD_ID || message.channelId === LOG_CHANNEL_ID ||
        message.author?.bot) return;
    const authorId = message.author?.id;
    const attachments = [...(message.attachments?.values() || [])]
      .map(file => file.name || 'Plik').slice(0, 8);
    const body = message.content ? trim(message.content, MAX_CONTENT) : 'Treść niedostępna lub wiadomość zawierała tylko załączniki.';
    return note(message.guild, 'deleted', '🗑️  USUNIĘTO WIADOMOŚĆ',
      'Wiadomość została skasowana z kanału tekstowego.', [
        ['👤 Użytkownik', authorId ? mention(authorId) : 'Nieznany (wiadomość nie była w pamięci bota)'],
        ['📍 Kanał', location(message.channelId)],
        ['💬 Usunięta treść', body],
        ...(attachments.length ? [['📎 Załączniki', trim(attachments.join('\n'), 600)]] : []),
        ['🕒 Wysłano', message.createdTimestamp ? occurredAt(message.createdTimestamp) : 'Nieznana data']
      ], message.author);
  });
  event(Events.MessageDeleteBulk, messages => {
    const first = messages.first();
    if (!first?.guild || first.guildId !== GUILD_ID || first.channelId === LOG_CHANNEL_ID) return;
    return note(first.guild, 'deleted', '🧹  USUNIĘTO WIELE WIADOMOŚCI',
      'Wykryto zbiorcze czyszczenie rozmowy.', [
        ['📍 Kanał', location(first.channelId)],
        ['🗑️ Liczba wiadomości', String(messages.size)],
        ['🕒 Data zdarzenia', occurredAt(Date.now())]
      ]);
  });

  event(Events.GuildMemberAdd, member => {
    if (member.guild.id !== GUILD_ID) return;
    return note(member.guild, 'joined', '👋  NOWA OSOBA NA SERWERZE',
      'Witaj w ekipie Benny’s Original Motor Works!', [
        ['👤 Użytkownik', mention(member.id)],
        ['📅 Konto utworzono', occurredAt(member.user.createdTimestamp)],
        ['👥 Liczba członków', String(member.guild.memberCount)],
        ['🕒 Dołączono', occurredAt(Date.now())]
      ], member.user);
  });
  event(Events.GuildMemberRemove, async member => {
    if (member.guild.id !== GUILD_ID) return;
    await new Promise(resolve => setTimeout(resolve, 1400));
    const [kick, ban] = await Promise.all([
      findAudit(member.guild, AuditLogEvent.MemberKick, member.id),
      findAudit(member.guild, AuditLogEvent.MemberBanAdd, member.id)
    ]);
    if (ban || recently.has('ban:' + member.id)) {
      if (ban) return handleBan(member.guild, ban, member.user);
      return;
    }
    if (kick || recently.has('kick:' + member.id)) {
      if (kick) return handleKick(member.guild, kick, member.user);
      return;
    }
    return note(member.guild, 'left', '🚪  UŻYTKOWNIK OPUŚCIŁ SERWER',
      'Użytkownik samodzielnie opuścił społeczność Benny’s.', [
        ['👤 Użytkownik', mention(member.id)],
        ['👥 Pozostało członków', String(member.guild.memberCount)],
        ['🕒 Data wyjścia', occurredAt(Date.now())]
      ], member.user);
  });
  event(Events.GuildBanAdd, async ban => {
    if (ban.guild.id !== GUILD_ID) return;
    const audit = await findAudit(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    return handleBan(ban.guild, audit || { target: ban.user }, ban.user);
  });

  event(Events.GuildMemberUpdate, async (before, after) => {
    if (after.guild.id !== GUILD_ID) return;
    const oldUntil = before.communicationDisabledUntilTimestamp || null;
    const newUntil = after.communicationDisabledUntilTimestamp || null;
    if (oldUntil === newUntil) return;
    const audit = await findAudit(after.guild, AuditLogEvent.MemberUpdate, after.id);
    return handleTimeout(after.guild, after.id, newUntil, audit, after.user);
  });
  event(Events.VoiceStateUpdate, async (before, after) => {
    if (after.guild.id !== GUILD_ID || before.serverMute === after.serverMute) return;
    const active = after.serverMute;
    const audit = await findAudit(after.guild, AuditLogEvent.MemberUpdate, after.id);
    if (!once('voicemute:' + after.id + ':' + active)) return;
    return note(after.guild, active ? 'muted' : 'unmuted',
      active ? '🎙️  WYCISZONO NA GŁOSOWYM' : '🎙️  ZDJĘTO WYCISZENIE',
      active ? 'Moderator wyłączył użytkownikowi możliwość mówienia.' :
        'Moderator przywrócił użytkownikowi głos.', [
          ['👤 Użytkownik', mention(after.id)],
          ['🛡️ Moderator', moderatorField(audit)],
          ['🔊 Kanał głosowy', location(after.channelId || before.channelId)],
          ['📝 Powód', reasonField(audit)]
        ], after.member?.user);
  });

  event(Events.GuildAuditLogEntryCreate, (entry, guild) => {
    if (guild?.id !== GUILD_ID) return;
    const id = auditUser(entry);
    if (entry.action === AuditLogEvent.MemberKick) return handleKick(guild, entry);
    if (entry.action === AuditLogEvent.MemberBanAdd) return handleBan(guild, entry);
    if (entry.action === AuditLogEvent.MemberRoleUpdate) return roleChanges(guild, entry);
    if (entry.action !== AuditLogEvent.MemberUpdate || !id) return;
    const change = entry.changes?.find(item =>
      item.key === 'communication_disabled_until' || item.key === 'communicationDisabledUntil');
    if (!change) return;
    const until = change.new || null;
    return handleTimeout(guild, id, until, entry, entry.target);
  });
  return async () => false;
}
