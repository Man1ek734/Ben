import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, AttachmentBuilder } from 'discord.js';
import { payrollPeriodKey, payrollNextSaturday, periodBoundaryBetween } from './payroll-calendar.js';

const STORE = process.env.WORK_DATA_FILE || '/data/benny-work-hours.json';
const TIMEZONE = 'Europe/Warsaw';
const gradeRates = [
  ['Nowy',500], ['Uczeń',600], ['Praktykant',700],
  ['Mechanik I Stopnia',800], ['Mechanik II Stopnia',900], ['Mechanik III Stopnia',1000], ['Mechanik IV Stopnia',1100],
  ['Specjalista',1250], ['Ekspert Mechaniki',1400], ['Mistrz Mechaniki',1550], ['Lider Zespołu',1700],
  ['Brygadzista',1850], ['Kierownik',2000], ['Dyrektor LSC',2200], ['Współwłaściciel',2400], ['Właściciel',2600]
];
const idFor = { start: 'benny_work_start', pause: 'benny_work_pause', stop: 'benny_work_stop', hours: 'benny_work_hours' };
const statusName = { work: '🟢 W pracy', break: '🟡 Przerwa', off: '🔴 Po pracy' };
const currency = n => Math.round(n || 0).toLocaleString('pl-PL') + ' $';
const duration = ms => Math.floor(ms/3600000) + 'h ' + String(Math.floor((ms % 3600000)/60000)).padStart(2,'0') + 'm';
const liveDuration = ms => [Math.floor(ms/3600000), Math.floor((ms%3600000)/60000), Math.floor((ms%60000)/1000)].map(n => String(n).padStart(2,'0')).join(':');
const short = str => String(str || 'Pracownik').slice(0, 80);
function weeklyEntry(data, key, id, name) {
  data.weeks[key] ||= { users: {}, publishedAt: null };
  data.weeks[key].users[id] ||= { ms: 0, pay: 0, name: short(name) };
  data.weeks[key].users[id].name = short(name);
  return data.weeks[key].users[id];
}
function settle(data, id, end) {
  const u = data.users[id];
  if (!u) return;
  let cursor = u.since || end;
  if (cursor > end) cursor = end;
  while (cursor < end) {
    const key = payrollPeriodKey(cursor);
    const finish = payrollPeriodKey(end - 1) === key ? end : periodBoundaryBetween(cursor, end, key);
    if (u.status === 'work') {
      const row = weeklyEntry(data, key, id, u.name);
      const ms = finish - cursor;
      row.ms += ms;
      row.pay += ms * (u.rate || 0) / 3600000;
    }
    cursor = finish;
  }
  u.since = end;
}
function currentRole(member) {
  for (let i = gradeRates.length - 1; i >= 0; i--) {
    const [name, rate] = gradeRates[i];
    if (member.roles.cache.some(role => role.name === name)) return { name, rate };
  }
  return null;
}
function save(data) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  const temporary = STORE + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, STORE);
}
function read() {
  if (!fs.existsSync(STORE)) return { version: 1, users: {}, weeks: {} };
  const parsed = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  if (!parsed.users || !parsed.weeks) throw new Error('Niepoprawny plik danych godzin.');
  return parsed;
}
function panelMessage(data, now = Date.now(), serverIcon = null) {
  const key = payrollPeriodKey(now);
  const working = [];
  const breaks = [];
  let totalHoursMs = 0;

  for (const [id, user] of Object.entries(data.users)) {
    if (user.status === 'off') continue;
    const row = data.weeks[key]?.users[id];
    const elapsed = user.status === 'work' ? Math.max(0, now - (user.since || now)) : 0;
    const ms = (row?.ms || 0) + elapsed;
    const pay = (row?.pay || 0) + elapsed * (user.rate || 0) / 3600000;
    const time = liveDuration(ms);
    const role = user.grade ? short(user.grade).replace(/[*_~\`|]/g, '') : 'Pracownik';
    const entry = '**<@' + id + '>**  ·  \`' + time + '\`\n' +
      '↳ ' + role + '  •  ' + currency(pay) + ' w tym tygodniu';
    if (user.status === 'work') {
      working.push(entry);
      totalHoursMs += ms;
    } else {
      breaks.push(entry);
    }
  }

  const listText = entries => {
    if (!entries.length) return '*Brak pracowników*';
    let text = '';
    for (const entry of entries) {
      const next = text ? text + '\n\n' + entry : entry;
      if (next.length > 970) {
        text += '\n\n*Pozostali pracownicy nie mieszczą się na liście.*';
        break;
      }
      text = next;
    }
    return text;
  };

  const embed = new EmbedBuilder()
    .setColor(0xa41920)
    .setAuthor({ name: 'BENNY’S ORIGINAL MOTOR WORKS  /  STAFF SYSTEM' })
    .setTitle('🔧  REJESTR CZASU PRACY')
    .setDescription(
      '**WARSZTAT JEST W RUCHU**\n' +
      'Zarządzaj zmianą bez wpisywania komend. Czas pracy oraz naliczane wynagrodzenie zapisują się automatycznie.\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '🟢 **ROZPOCZNIJ PRACĘ**  —  uruchom licznik lub wróć z przerwy\n' +
      '🟡 **PRZERWA W PRACY**  —  zatrzymaj naliczanie czasu\n' +
      '🔴 **ZAKOŃCZ PRACĘ**  —  zapisz zmianę i zakończ\n' +
      '📊 **MOJE GODZINY**  —  sprawdź czas i wypłatę\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━'
    )
    .addFields(
      { name: '🟢  NA STANOWISKU', value: '**' + working.length + '** pracowników', inline: true },
      { name: '🟡  NA PRZERWIE', value: '**' + breaks.length + '** pracowników', inline: true },
      { name: '⏱️  GODZINY AKTYWNYCH', value: '**' + duration(totalHoursMs) + '**', inline: true },
      { name: '🛠️  AKTYWNE ZMIANY', value: listText(working) },
      { name: '☕  PRZERWY', value: listText(breaks) }
    )
;

  if (serverIcon) embed.setThumbnail(serverIcon);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(idFor.start).setStyle(ButtonStyle.Success).setLabel('Rozpocznij pracę').setEmoji('🟢'),
    new ButtonBuilder().setCustomId(idFor.pause).setStyle(ButtonStyle.Secondary).setLabel('Przerwa w pracy').setEmoji('🟡'),
    new ButtonBuilder().setCustomId(idFor.stop).setStyle(ButtonStyle.Danger).setLabel('Zakończ pracę').setEmoji('🔴'),
    new ButtonBuilder().setCustomId(idFor.hours).setStyle(ButtonStyle.Primary).setLabel('Moje godziny').setEmoji('📊')
  );

  return { embeds: [embed], components: [buttons], allowedMentions: { parse: [] } };
}
function rateEmbed() {
  return new EmbedBuilder()
    .setColor(0xb61c25)
    .setTitle('💰 GODZINÓWKI • BENNY’S MOTOR WORKS')
    .setDescription('**Stawki za jedną przepracowaną godzinę (Hard RP)**\n\n' + gradeRates.map(([grade,rate]) => '**' + grade + '** — ' + currency(rate) + '/h').join('\n') + '\n\nPrzerwa nie jest płatna. Awans zmienia stawkę od chwili aktualizacji rangi na Discordzie. Rozliczenie następuje co poniedziałek za poprzedni tydzień.')
    .setFooter({ text: 'Zestawienie Discord • Pieniądze w grze należy wypłacić oddzielnie' });
}
function payEmbed(key, summary) {
  const lines = Object.entries(summary.users).sort((a,b)=>b[1].ms-a[1].ms);
  const description = lines.length ? lines.slice(0,35).map(([id, u], i) =>
    '**' + (i + 1) + '.** <@' + id + '> — **' + duration(u.ms) + '** — **' + currency(u.pay) + '**'
  ).join('\n') : 'W tym tygodniu nie odnotowano pracy.';
  return new EmbedBuilder()
    .setColor(0x24823b).setTitle('💵 TYGODNIOWE ROZLICZENIE • BENNY’S')
    .setDescription('Tydzień rozpoczynający się **' + key + '** (poniedziałek–niedziela, Warszawa)\n\n' + description)
    .addFields({ name: 'Łączna suma wypłat', value: currency(lines.reduce((sum,[,u])=>sum + u.pay, 0)), inline: true },
      { name: 'Liczba pracowników', value: String(lines.length), inline: true })
    .setFooter({ text: 'Raport rozliczeniowy • nie wykonuje przelewów FiveM' })
    .setTimestamp();
}
export function createWorkSystem(client, guildId) {
  let data;
  let guild;
  let panelChannel;
  let paymentChannel;
  let rateChannel;
  let inProgress = Promise.resolve();
  let tickTimer;
  let panelMessageId;
  let lastWeekCheck = 0;
  let lastIdleRefresh = 0;
  const queue = fn => {
    const job = inProgress.catch(() => {}).then(fn);
    inProgress = job;
    return job;
  };
  async function ensureChannels() {
    await guild.channels.fetch();
    const info = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === 'Informacje');
    if (!info) throw new Error('Nie znaleziono kategorii Informacje.');
    panelChannel = guild.channels.cache.find(c => c.parentId === info.id && c.name.includes('wyrobione-godziny'));
    paymentChannel = guild.channels.cache.find(c => c.parentId === info.id && c.name.includes('tygodniówki'));
    if (!panelChannel || !paymentChannel) throw new Error('Brak kanału wyrobione-godziny lub tygodniówki.');
    rateChannel = guild.channels.cache.find(c => c.parentId === info.id && c.name.includes('godzinówki'));
    if (!rateChannel) {
      rateChannel = await guild.channels.create({
        name: '💰〢godzinówki', type: ChannelType.GuildText, parent: info.id,
        topic: 'Stawki godzinowe wszystkich 16 stopni Benny’s.',
        permissionOverwrites: panelChannel.permissionOverwrites.cache.map(row => ({
          id: row.id, allow: row.allow.bitfield, deny: row.deny.bitfield
        })),
        reason: 'Godzinówki pracowników Benny’s'
      });
    }
    const messages = await rateChannel.messages.fetch({ limit: 100 });
    const old = messages.find(m=>m.author.id===client.user.id && m.embeds.some(e=>e.title==='💰 GODZINÓWKI • BENNY’S MOTOR WORKS'));
    if (!old) await rateChannel.send({ embeds:[rateEmbed()] });
  }
  async function refreshPanel(force = false) {
    if (!panelChannel) return;
    let existing = null;
    panelMessageId ||= data.panelMessageId;
    if (panelMessageId) {
      existing = await panelChannel.messages.fetch(panelMessageId).catch(() => null);
    }
    if (!existing) {
      let before = undefined;
      for (let page = 0; page < 10 && !existing; page++) {
        const recent = await panelChannel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        existing = recent.find(m =>
          m.author.id === client.user.id &&
          m.components.some(row => row.components.some(c =>
            [idFor.start, idFor.pause, idFor.stop, idFor.hours].includes(c.customId)
          ))
        );
        before = recent.last()?.id;
        if (recent.size < 100) break;
      }
    }
    const payload = panelMessage(data, Date.now(), guild?.iconURL({ size: 128 }) || null);
    if (existing) {
      if (force) await existing.edit(payload);
      panelMessageId = existing.id;
    } else {
      const created = await panelChannel.send(payload);
      panelMessageId = created.id;
      console.log('BENNY GODZINY: utworzono panel pracy ' + panelMessageId);
    }
    if (data.panelMessageId !== panelMessageId) {
      data.panelMessageId = panelMessageId;
      save(data);
    }
  }
  async function publishWeeks() {
    const now = Date.now();
    const currentKey = payrollPeriodKey(now);
    for (const id of Object.keys(data.users)) settle(data, id, now);
    save(data);
    for (const [key, week] of Object.entries(data.weeks).sort(([a],[b])=>a.localeCompare(b))) {
      if (key >= currentKey || week.publishedAt) continue;
      if (week.messageId) {
        week.publishedAt = now;
        save(data);
        continue;
      }
      const message = await paymentChannel.send({ embeds:[payEmbed(key, week)], allowedMentions:{parse:[]} });
      week.messageId = message.id;
      week.publishedAt = Date.now();
      save(data);
      console.log('BENNY GODZINY: opublikowano tydzień ' + key + ', wpisów=' + Object.keys(week.users).length);
    }
  }
  function memberSummary(id) {
    const key = payrollPeriodKey(Date.now());
    const row = data.weeks[key]?.users[id];
    const user = data.users[id];
    const elapsed = user?.status === 'work' ? Math.max(0,Date.now() - user.since) : 0;
    const ms = (row?.ms || 0)+elapsed;
    const pay = (row?.pay || 0) + elapsed * (user?.rate || 0) / 3600000;
    const prior = Object.keys(data.weeks).filter(w=>w<key).sort().at(-1);
    const previous = prior ? data.weeks[prior]?.users[id] : null;
    return new EmbedBuilder()
      .setColor(0xb61c25).setTitle('📊 Twoje godziny – Benny’s')
      .addFields(
        { name: 'Status', value: statusName[user?.status || 'off'], inline: true },
        { name: 'Stawka', value: currency(user?.rate || 0)+'/h', inline: true },
        { name: 'Aktualny tydzień', value: duration(ms) + ' • ' + currency(pay) },
        { name: 'Poprzedni tydzień', value: previous ? duration(previous.ms) + ' • ' + currency(previous.pay) : 'Brak danych' }
      ).setFooter({ text: 'Godziny liczone w strefie Europe/Warsaw' });
  }
  async function removeInvites() {
    const cats = guild.channels.cache.filter(c=>c.type === ChannelType.GuildCategory && c.name==='●');
    for (const cat of cats.values()) {
      const children = guild.channels.cache.filter(c=>c.parentId===cat.id);
      const invites = children.filter(c=>c.type===ChannelType.GuildText && c.name.includes('zaproszenia'));
      if (children.size !== invites.size) {
        console.log('BENNY GODZINY: pominięto usunięcie kategorii ●, bo zawiera inne kanały');
        continue;
      }
      for (const channel of invites.values()) {
        const messages = await channel.messages.fetch({limit:100});
        if (messages.some(m=>!m.author?.bot)) {
          console.log('BENNY GODZINY: nie usuwam ' + channel.name + ', są w nim wiadomości użytkowników');
          continue;
        }
        await channel.delete('Usunięcie zaproszeń na prośbę właściciela Benny’s');
      }
      await guild.channels.fetch();
      if (!guild.channels.cache.some(c=>c.parentId===cat.id)) await cat.delete('Usunięcie pustej kategorii ●');
    }
  }
  async function setup(server) {
    guild = server;
    if (!data) data = read();
    await guild.roles.fetch();
    await ensureChannels();
    await removeInvites();
    await publishWeeks();
    await refreshPanel(true);
    if (!tickTimer) {
      lastWeekCheck = Date.now();
      tickTimer = setInterval(() => {
        queue(async () => {
          try {
            const now = Date.now();
            if (now - lastWeekCheck >= 60000) {
              await publishWeeks();
              lastWeekCheck = now;
            }
            const hasActive = Object.values(data.users).some(u => u.status !== 'off');
            if (hasActive || now - lastIdleRefresh >= 60000) {
              await refreshPanel(true);
              lastIdleRefresh = now;
            }
          } catch (error) {
            console.error('BENNY GODZINY LIVE: ' + error.stack);
          }
        });
      }, 20000);
      tickTimer.unref();
      console.log('BENNY GODZINY LIVE: automatyczna aktualizacja co 20 sekund.');
    }
    console.log('BENNY GODZINY GOTOWE: ' + panelChannel.id + ' tygodniówki=' + paymentChannel.id + ' plik=' + STORE);
  }
  async function handle(interaction) {
    const action = Object.entries(idFor).find(([, id])=>id===interaction.customId)?.[0];
    if (!action) return false;
    if (interaction.guildId !== guildId) return false;
    await queue(async () => {
      if (!data) return interaction.reply({content:'System godzin nie jest jeszcze gotowy.',ephemeral:true});
      const now = Date.now(), userId = interaction.user.id;
      const member = await interaction.guild.members.fetch(userId);
      const rank = currentRole(member);
      if (action === 'hours') {
        return interaction.reply({ embeds:[memberSummary(userId)], ephemeral:true });
      }
      if (!rank) return interaction.reply({content:'Nie masz przypisanego stopnia Benny’s. Poproś kierownictwo o nadanie roli.',ephemeral:true});
      const user = data.users[userId] ||= { status:'off', since:now, rate:rank.rate, grade:rank.name, name:short(member.displayName) };
      settle(data,userId,now);
      user.rate = rank.rate;
      user.grade = rank.name;
      user.name = short(member.displayName);
      const prior = user.status;
      if (action === 'start') {
        if (prior === 'work') return interaction.reply({content:'🟢 Już jesteś na zmianie.',ephemeral:true});
        user.status = 'work';
        user.breakSince = null;
      } else if (action === 'pause') {
        if (prior !== 'work') return interaction.reply({content:'🟡 Aby rozpocząć przerwę, musisz być w pracy.',ephemeral:true});
        user.status = 'break';
        user.breakSince = now;
      } else if (action === 'stop') {
        if (prior === 'off') return interaction.reply({content:'🔴 Nie masz aktywnej zmiany.',ephemeral:true});
        user.status = 'off';
        user.breakSince = null;
      }
      user.since = now;
      save(data);
      await interaction.deferReply({ephemeral:true});
      await refreshPanel(true);
      return interaction.editReply(statusName[user.status]+' • '+rank.name+' • '+currency(rank.rate)+'/h');
    });
    return true;
  }
  async function roleChanged(oldMember,newMember) {
    if (newMember.guild.id !== guildId || !data?.users[newMember.id]) return;
    await queue(async()=>{
      const user = data.users[newMember.id];
      const rank = currentRole(newMember);
      const now = Date.now();
      settle(data,newMember.id,now);
      user.grade = rank?.name || null;
      user.rate = rank?.rate || 0;
      if (!rank && user.status==='work') user.status='off';
      user.since = now;
      save(data);
      await refreshPanel(true);
    });
  }
  return { setup, handle, roleChanged };
}
