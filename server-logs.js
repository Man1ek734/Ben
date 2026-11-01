import { Events, EmbedBuilder, AuditLogEvent, PermissionFlagsBits } from 'discord.js';

const GUILD = '1566469722365493340';
const DEST = '1566480686351650837';
const red = 0xed4245, green = 0x57f287, yellow = 0xfee75c, blue = 0x3498db, gray = 0x2b2d31;
const short = (x, n = 900) => String(x ?? 'Brak danych').slice(0, n) || 'Brak danych';
const usr = u => u ? '<@' + u.id + '> (' + u.id + ')' : 'Nieznany';
const chan = id => id ? '<#' + id + '>' : 'Nieznany';

export function registerServerLogs(client) {
  let pending = Promise.resolve();
  const send = (guild, title, values, color = gray) => {
    if (guild?.id !== GUILD) return Promise.resolve(false);
    pending = pending.catch(() => {}).then(async () => {
      try {
        const channel = await guild.channels.fetch(DEST).catch(() => null);
        if (!channel?.isTextBased()) return false;
        const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp().setFooter({ text: 'Benny’s Original Motor Works • Logi' });
        for (const [name, value] of values.slice(0, 18)) embed.addFields({ name: short(name, 200), value: short(value) });
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        return true;
      } catch (e) { console.error('BENNY LOGI: ' + e.message); return false; }
    });
    return pending;
  };
  const event = (name, fn) => client.on(name, (...args) => Promise.resolve().then(() => fn(...args)).catch(e => console.error('BENNY LOGI EVENT: ' + e.message)));
  const actor = async (g, action, id) => {
    try {
      const data = await g.fetchAuditLogs({ type: action, limit: 5 });
      const entry = data.entries.find(e => (!id || e.target?.id === id) && Date.now() - e.createdTimestamp < 7000);
      return entry?.executor ? usr(entry.executor) : 'Nie ustalono';
    } catch { return 'Brak dostępu do dziennika audytu'; }
  };
  event(Events.ClientReady, async () => {
    const guild = await client.guilds.fetch(GUILD);
    await guild.roles.fetch();
    const target = await guild.channels.fetch(DEST).catch(() => null);
    if (!target?.isTextBased()) return console.error('BENNY LOGI: kanał ' + DEST + ' nie istnieje lub brak dostępu');
    if (target.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
      await target.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
      for (const name of ['Dyrektor LSC', 'Współwłaściciel', 'Właściciel']) {
        const role = guild.roles.cache.find(x => x.name === name);
        if (role) await target.permissionOverwrites.edit(role, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true });
      }
      await target.permissionOverwrites.edit(client.user.id, { ViewChannel: true, SendMessages: true, EmbedLinks: true, ReadMessageHistory: true });
    }
    const ok = await send(guild, '🟢 System logów uruchomiony', [['Kanał', chan(DEST)], ['Status', 'Monitorowanie zdarzeń Benny’s aktywne']], green);
    console.log(ok ? 'BENNY LOGI GOTOWE: ' + DEST : 'BENNY LOGI: nie można publikować');
  });
  event(Events.MessageDelete, m => !m.author?.bot && m.channelId !== DEST && send(m.guild, '🗑️ Usunięto wiadomość', [['Autor', usr(m.author)], ['Kanał', chan(m.channelId)], ['Treść', m.content || 'Niedostępna bez Message Content Intent']], red));
  event(Events.MessageUpdate, (a, b) => !b.author?.bot && b.channelId !== DEST && a.content !== b.content && send(b.guild, '✏️ Edytowano wiadomość', [['Autor', usr(b.author)], ['Kanał', chan(b.channelId)], ['Przed', a.content || 'Niedostępna'], ['Po', b.content || 'Niedostępna']], yellow));
  event(Events.MessageDeleteBulk, ms => { const m = ms.first(); return m?.channelId !== DEST && send(m?.guild, '🧹 Usunięto wiadomości', [['Kanał', chan(m?.channelId)], ['Liczba', ms.size]], red); });
  event(Events.GuildMemberAdd, m => send(m.guild, '👋 Dołączono do serwera', [['Osoba', usr(m.user)]], green));
  event(Events.GuildMemberRemove, async m => { const by = await actor(m.guild, AuditLogEvent.MemberKick, m.id); return send(m.guild, by.startsWith('<@') ? '👢 Wyrzucono użytkownika' : '🚪 Użytkownik opuścił serwer', [['Osoba', usr(m.user)], ['Moderator', by]], red); });
  event(Events.GuildMemberUpdate, async (a,b) => {
    const added = b.roles.cache.filter(x => !a.roles.cache.has(x.id));
    const removed = a.roles.cache.filter(x => !b.roles.cache.has(x.id));
    for (const role of added.values()) await send(b.guild,'➕ Nadano rolę',[['Osoba',usr(b.user)],['Rola',role.name],['Nadał',await actor(b.guild,AuditLogEvent.MemberRoleUpdate,b.id)]],green);
    for (const role of removed.values()) await send(b.guild,'➖ Odebrano rolę',[['Osoba',usr(b.user)],['Rola',role.name],['Odebrał',await actor(b.guild,AuditLogEvent.MemberRoleUpdate,b.id)]],red);
    if(a.nickname !== b.nickname) await send(b.guild,'📝 Zmieniono nick',[['Osoba',usr(b.user)],['Przed',a.nickname || a.user.username],['Po',b.nickname || b.user.username]],yellow);
    if(a.communicationDisabledUntilTimestamp !== b.communicationDisabledUntilTimestamp) await send(b.guild,'🔇 Zmieniono timeout',[['Osoba',usr(b.user)],['Do',b.communicationDisabledUntilTimestamp || 'Zdjęto']],yellow);
  });
  event(Events.GuildBanAdd, async b => send(b.guild,'🔨 Nałożono bana',[['Osoba',usr(b.user)],['Moderator',await actor(b.guild,AuditLogEvent.MemberBanAdd,b.user.id)]],red));
  event(Events.GuildBanRemove, async b => send(b.guild,'✅ Zdjęto bana',[['Osoba',usr(b.user)],['Moderator',await actor(b.guild,AuditLogEvent.MemberBanRemove,b.user.id)]],green));
  event(Events.GuildRoleCreate, async r => send(r.guild,'🎭 Utworzono rolę',[['Rola',r.name],['Autor',await actor(r.guild,AuditLogEvent.RoleCreate,r.id)]],green));
  event(Events.GuildRoleDelete, async r => send(r.guild,'🗑️ Usunięto rolę',[['Rola',r.name],['Autor',await actor(r.guild,AuditLogEvent.RoleDelete,r.id)]],red));
  event(Events.GuildRoleUpdate, (a,b) => (a.name !== b.name || a.permissions.bitfield !== b.permissions.bitfield || a.color !== b.color || a.position !== b.position) && send(b.guild,'⚙️ Zmieniono rolę',[['Rola',b.name],['Zmiana',short(a.name + ' → ' + b.name + ', pozycja ' + a.position + ' → ' + b.position)]],yellow));
  event(Events.ChannelCreate, async c => c.id !== DEST && send(c.guild,'📁 Utworzono kanał',[['Nazwa',c.name],['Autor',await actor(c.guild,AuditLogEvent.ChannelCreate,c.id)]],green));
  event(Events.ChannelDelete, async c => c.id !== DEST && send(c.guild,'🗑️ Usunięto kanał',[['Nazwa',c.name],['Autor',await actor(c.guild,AuditLogEvent.ChannelDelete,c.id)]],red));
  event(Events.ChannelUpdate, (a,b) => b.id !== DEST && (a.name !== b.name || a.parentId !== b.parentId || a.topic !== b.topic) && send(b.guild,'⚙️ Zmieniono kanał',[['Kanał',chan(b.id)],['Przed',a.name],['Po',b.name]],yellow));
  event(Events.VoiceStateUpdate, async (a,b) => {
    if(a.channelId !== b.channelId) await send(b.guild,'🔊 Ruch na głosowym',[['Osoba',usr(b.member?.user)],['Z',chan(a.channelId)],['Do',chan(b.channelId)]],blue);
    if(a.serverMute !== b.serverMute || a.serverDeaf !== b.serverDeaf) await send(b.guild,'🔇 Zmieniono wyciszenie',[['Osoba',usr(b.member?.user)],['Wyciszony',String(b.serverMute)],['Ogłuszony',String(b.serverDeaf)]],yellow);
  });
  event(Events.GuildUpdate, (a,b) => a.name !== b.name && send(b,'🏠 Zmieniono nazwę serwera',[['Przed',a.name],['Po',b.name]],yellow));
  event(Events.InviteCreate, i => send(i.guild,'🔗 Utworzono zaproszenie',[['Kod',i.code],['Utworzył',usr(i.inviter)]],green));
  event(Events.InviteDelete, i => send(i.guild,'🗑️ Usunięto zaproszenie',[['Kod',i.code]],red));
  event(Events.GuildAuditLogEntryCreate, (entry,g) => send(g,'🛡️ Dziennik audytu',[['Akcja',AuditLogEvent[entry.action] || entry.action],['Wykonał',usr(entry.executor)],['Cel',entry.target?.id || 'Nieznany'],['Powód',entry.reason || 'Nie podano']],gray));
  event(Events.InteractionCreate, i => i.isChatInputCommand() && send(i.guild,'⌨️ Komenda bota',[['Osoba',usr(i.user)],['Komenda','/' + i.commandName],['Kanał',chan(i.channelId)]],gray));
  return send;
}
