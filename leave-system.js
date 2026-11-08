import fs from 'node:fs';
import path from 'node:path';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits
} from 'discord.js';

const STORE = process.env.LEAVE_DATA_FILE || '/data/benny-leaves.json';
const CATEGORY = '● Strefa Pracownika';
const CHANNEL = '🗓️〢urlopy';
const ID = 'benny_leave_';
const TIME_ZONE = 'Europe/Warsaw';
const rankNames = [
  'Nowy', 'Uczeń', 'Praktykant', 'Mechanik I Stopnia', 'Mechanik II Stopnia',
  'Mechanik III Stopnia', 'Mechanik IV Stopnia', 'Specjalista',
  'Ekspert Mechaniki', 'Mistrz Mechaniki', 'Lider Zespołu', 'Brygadzista',
  'Kierownik', 'Dyrektor LSC', 'Współwłaściciel', 'Właściciel'
];
const kinds = {
  vacation: { title: '🌴 Urlop pracownika', color: 0x4ec5a0, emoji: '🌴', display: 'Urlop' },
  absence: { title: '⚠️ Zgłoszenie nieobecności', color: 0xf3b952, emoji: '⚠️', display: 'Nieobecność' },
  reduced: { title: '📉 Zmniejszona aktywność', color: 0x5b9fe5, emoji: '📉', display: 'Zmniejszona aktywność' }
};
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
const today = () => {
  const parts = Object.fromEntries(dateFmt.formatToParts(new Date())
    .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
};
function parseDate(text) {
  const value = String(text || '').trim();
  let y, m, d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) [y, m, d] = value.split('-').map(Number);
  else if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) [d, m, y] = value.split('.').map(Number);
  else return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(check.getTime()) || check.getUTCFullYear() !== y ||
      check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d || y < 2025 || y > 2100) return null;
  return [y, String(m).padStart(2, '0'), String(d).padStart(2, '0')].join('-');
}
const displayDate = iso => iso ? iso.slice(8,10) + '.' + iso.slice(5,7) + '.' + iso.slice(0,4) : '—';
function daySpan(start, end) {
  return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
}
function hasRank(member) {
  return member.roles.cache.some(role => rankNames.includes(role.name.replace(/^・/, '')));
}
function load() {
  try {
    if (fs.existsSync(STORE)) {
      const data = JSON.parse(fs.readFileSync(STORE, 'utf8'));
      if (Array.isArray(data.records)) return data;
    }
  } catch (error) {
    console.error('BENNY URLOPY: błąd odczytu zapisów ' + error.message);
    throw error;
  }
  return { version: 1, records: [], panelId: null, panelChannelId: null };
}
function save(data) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  const tmp = STORE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, STORE);
}
function buttons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(ID + 'start').setStyle(ButtonStyle.Success)
        .setEmoji('🌴').setLabel('Rozpocznij urlop'),
      new ButtonBuilder().setCustomId(ID + 'end').setStyle(ButtonStyle.Danger)
        .setEmoji('✅').setLabel('Zakończ urlop')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(ID + 'absence').setStyle(ButtonStyle.Primary)
        .setEmoji('⚠️').setLabel('Zgłoś nieobecność'),
      new ButtonBuilder().setCustomId(ID + 'reduced').setStyle(ButtonStyle.Secondary)
        .setEmoji('📉').setLabel('Mniejsza aktywność')
    )
  ];
}
function panel(client, data = null) {
  const date = today();
  const active = (data?.records || []).filter(r =>
    r.kind === 'vacation' && r.status !== 'ended' && r.start <= date && r.end >= date).length;
  const upcoming = (data?.records || []).filter(r =>
    r.kind === 'vacation' && r.status === 'planned' && r.start > date).length;
  const logo = client.user.displayAvatarURL({ size: 256 });
  const embed = new EmbedBuilder()
    .setColor(0xa61524)
    .setAuthor({ name: 'BENNY’S ORIGINAL MOTOR WORKS  ·  STAFF PORTAL', iconURL: logo })
    .setTitle('🌴  CENTRUM URLOPÓW')
    .setDescription(
      '**Twój panel dyspozycyjności w warsztacie**\n' +
      'Zgłoś wolne, nieobecność albo ograniczoną aktywność — wszystko w jednym miejscu.\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━'
    )
    .addFields(
      { name: '🌴  ROZPOCZNIJ URLOP', value: 'Wpisz daty i powód. W czasie urlopu otrzymasz oznaczenie **[U]** przed nickiem.', inline: false },
      { name: '✅  ZAKOŃCZ URLOP', value: 'Wróciłeś wcześniej? Zamknij zgłoszenie, a bot przywróci Twój nick.', inline: false },
      { name: '⚠️  ZGŁOŚ NIEOBECNOŚĆ', value: 'Poinformuj ekipę, kiedy i dlaczego Cię nie będzie.', inline: false },
      { name: '📉  MNIEJSZA AKTYWNOŚĆ', value: 'Zgłoś okres, w którym możesz pracować rzadziej.', inline: false },
      { name: '🟢 NA URLOPIE', value: '**' + active + '** osób', inline: true },
      { name: '📅 ZAPLANOWANE', value: '**' + upcoming + '** zgłoszeń', inline: true }
    )
    .setThumbnail(logo)
    .setFooter({ text: 'BENNY’S  •  KADRY  |  Daty według czasu polskiego' });
  return { embeds: [embed], components: buttons(), allowedMentions: { parse: [] } };
}
function form(kind) {
  const specs = {
    vacation: { title: '🌴 Rozpocznij urlop', reason: 'Powód urlopu' },
    absence: { title: '⚠️ Zgłoś nieobecność', reason: 'Powód nieobecności' },
    reduced: { title: '📉 Zmniejszona aktywność', reason: 'Dlaczego będziesz mniej aktywny?' }
  };
  const spec = specs[kind];
  const modal = new ModalBuilder().setCustomId(ID + 'form_' + kind).setTitle(spec.title);
  const dateInput = (id, label) => new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label)
      .setStyle(TextInputStyle.Short).setPlaceholder('DD.MM.RRRR')
      .setMinLength(10).setMaxLength(10).setRequired(true)
  );
  modal.addComponents(
    dateInput('date_start', 'Data od'),
    dateInput('date_end', 'Data do'),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel(spec.reason)
        .setStyle(TextInputStyle.Paragraph).setMaxLength(700)
        .setMinLength(4).setRequired(true).setPlaceholder('Opisz krótko swoją sytuację…')
    )
  );
  return modal;
}
function reportEmbed(user, record, change) {
  const spec = kinds[record.kind];
  const state = record.status === 'planned' ? 'Zaplanowany' :
    record.status === 'active' ? 'Aktywny' : record.status === 'ended' ? 'Zakończony' : 'Zgłoszono';
  return new EmbedBuilder()
    .setColor(change === 'closed' ? 0x85919b : spec.color)
    .setAuthor({ name: 'BENNY’S / EWIDENCJA PRACOWNIKÓW' })
    .setTitle(change === 'closed' ? '✅ Zakończono urlop' : spec.title)
    .addFields(
      { name: '👤 Pracownik', value: '<@' + record.userId + '> (' + record.userId + ')' },
      { name: '📅 Od', value: displayDate(record.start), inline: true },
      { name: '📅 Do', value: displayDate(record.end), inline: true },
      { name: '📌 Status', value: state, inline: true },
      { name: '📝 Powód', value: record.reason.slice(0, 950) }
    )
    .setFooter({ text: 'BENNY’S ORIGINAL MOTOR WORKS • ID ' + record.id })
    .setTimestamp(new Date(record.updatedAt || record.createdAt));
}
async function findChannel(guild) {
  await guild.channels.fetch();
  const cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === CATEGORY);
  return guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.parentId === cat?.id &&
    c.name.replace(/[^\p{L}\p{N}]/gu, '').includes('urlopy')) || null;
}
function reply(content) { return { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }; }

export function createLeaveSystem(client, guildId) {
  let data;
  let channel;
  let guildRef;
  let timer;
  let task = Promise.resolve();
  const serialize = fn => {
    const job = task.catch(() => {}).then(fn);
    task = job;
    return job;
  };
  async function ensurePanel(guild) {
    channel = await findChannel(guild);
    if (!channel) throw new Error('Nie znaleziono kanału 🗓️〢urlopy w Strefie Pracownika.');
    let existing = null;
    if (data.panelId && data.panelChannelId === channel.id) {
      existing = await channel.messages.fetch(data.panelId).catch(() => null);
    }
    if (!existing) {
      let before;
      for (let page = 0; page < 10 && !existing; page++) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        existing = batch.find(m => m.author.id === client.user.id &&
          m.components.some(row => row.components.some(item => item.customId === ID + 'start')));
        before = batch.last()?.id;
        if (batch.size < 100) break;
      }
    }
    if (!existing) {
      existing = await channel.send(panel(client, data));
      console.log('BENNY URLOPY: panel opublikowany ' + existing.id);
      await existing.pin().catch(() => null);
    }
    await existing.edit(panel(client, data));
    data.panelId = existing.id;
    data.panelChannelId = channel.id;
    save(data);
    return existing;
  }
  async function sendReport(record, change = '') {
    if (!channel) return;
    try {
      await channel.send({
        embeds: [reportEmbed(null, record, change)],
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      console.error('BENNY URLOPY: nie udało się wysłać raportu: ' + error.message);
    }
  }
  async function syncVacationNickname(record) {
    if (record.kind !== 'vacation' || (!record.nickApplied && record.status !== 'active')) return false;
    if (!guildRef) return false;
    let member;
    try {
      member = await guildRef.members.fetch({ user: record.userId, force: true });
    } catch (error) {
      if (error.code === 10007 || error.code === 10013) {
        if (record.nickApplied) {
          record.nickApplied = false;
          record.nicknameSet = null;
          record.originalNickname = null;
          return true;
        }
        return false;
      }
      console.error('BENNY URLOPY NICK: nie udało się pobrać pracownika ' + record.userId + ': ' + error.message);
      return false;
    }
    const during = record.status === 'active' && record.start <= today() && record.end >= today();
    const currentNick = member.nickname;
    const hasTag = /^\[U\]\s*/i.test(currentNick || '');
    const changeError = message => {
      if (record.nicknameError !== message) {
        record.nicknameError = message;
        console.error('BENNY URLOPY NICK: ' + member.id + ' ' + message);
        return true;
      }
      return false;
    };
    if (during && hasTag) return false;
    if (!during && !record.nickApplied) return false;
    if (!member.manageable) {
      const botMember = await guildRef.members.fetchMe();
      const isOwner = member.id === guildRef.ownerId;
      const hasPermission = botMember.permissions.has(PermissionFlagsBits.ManageNicknames);
      const block = isOwner
        ? 'Discord zabrania botom zmieniać nick właściciela serwera. Ustaw [U] ręcznie w swoim profilu serwera.'
        : !hasPermission
          ? 'Botowi brakuje uprawnienia Zarządzanie pseudonimami (Manage Nicknames).'
          : 'Rola bota musi znajdować się powyżej najwyższej roli pracownika w Ustawienia serwera → Role.';
      console.log('BENNY URLOPY NICK DIAG: owner=' + isOwner + ', botManageNicknames=' + hasPermission +
        ', botTopPosition=' + botMember.roles.highest.position +
        ', memberTopPosition=' + member.roles.highest.position);
      return changeError(block);
    }
    try {
      if (during) {
        const original = currentNick ?? null;
        const display = (currentNick || member.user.globalName || member.user.username)
          .replace(/^\[U\]\s*/i, '');
        const newNick = '[U] ' + Array.from(display).slice(0, 28).join('');
        await member.setNickname(newNick, 'Benny’s: rozpoczęcie urlopu');
        record.originalNickname = original;
        record.nicknameSet = newNick;
        record.nickApplied = true;
        delete record.nicknameError;
        console.log('BENNY URLOPY NICK: dodano [U] do nicku ' + member.id);
        return true;
      }
      const restore = hasTag ?
        (currentNick === record.nicknameSet ? (record.originalNickname ?? null)
          : currentNick.replace(/^\[U\]\s*/i, '') || null) : currentNick;
      if (hasTag) await member.setNickname(restore, 'Benny’s: zakończenie urlopu');
      record.nickApplied = false;
      record.originalNickname = null;
      record.nicknameSet = null;
      delete record.nicknameError;
      console.log('BENNY URLOPY NICK: usunięto [U] dla ' + member.id);
      return true;
    } catch (error) {
      return changeError('Discord odmówił zmiany nicku: ' + error.message);
    }
  }

  async function sweep() {
    if (!data) return;
    const current = today();
    let changed = false;
    const alerts = [];
    for (const record of data.records) {
      if (record.kind !== 'vacation') continue;
      if (record.status === 'planned' && record.start <= current) {
        record.status = current > record.end ? 'ended' : 'active';
        record.updatedAt = new Date().toISOString();
        changed = true;
        alerts.push(record);
      }
      if (record.status === 'active' && record.end < current) {
        record.status = 'ended';
        record.updatedAt = new Date().toISOString();
        changed = true;
        alerts.push(record);
      }
      if (await syncVacationNickname(record)) {
        changed = true;
        save(data);
      }
    }
    if (changed) {
      save(data);
      if (data.panelId && channel) {
        const message = await channel.messages.fetch(data.panelId).catch(() => null);
        if (message) await message.edit(panel(client, data)).catch(error =>
          console.error('BENNY URLOPY: aktualizacja panelu: ' + error.message));
      }
    }
    for (const record of alerts) await sendReport(record, record.status === 'ended' ? 'closed' : 'active');
  }
  async function setup(guild) {
    guildRef = guild;
    const me = await guild.members.fetchMe();
    console.log('BENNY URLOPY NICK: ManageNicknames=' + me.permissions.has(PermissionFlagsBits.ManageNicknames) +
      ', najwyższa rola bota=' + me.roles.highest.name + ', pozycja=' + me.roles.highest.position);
    await serialize(async () => {
      data ||= load();
      await ensurePanel(guild);
      await sweep();
    });
    if (!timer) {
      timer = setInterval(() => serialize(() => sweep()).catch(error =>
        console.error('BENNY URLOPY: harmonogram ' + error.stack)), 60000);
      timer.unref();
    }
    console.log('BENNY URLOPY GOTOWE: panel=' + data.panelId + ', kanał=' + channel.id +
      ', zapis=' + STORE);
  }
  async function handle(interaction) {
    if (interaction.guildId !== guildId) return false;
    const isCommand = interaction.isChatInputCommand() && interaction.commandName === 'urlop';
    const isButton = interaction.isButton() && interaction.customId.startsWith(ID);
    const isModal = interaction.isModalSubmit() && interaction.customId.startsWith(ID + 'form_');
    if (!isCommand && !isButton && !isModal) return false;

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!hasRank(member)) {
      await interaction.reply(reply('⛔ Panel urlopowy jest dostępny tylko dla pracowników Benny’s z przypisanym stopniem.'));
      return true;
    }

    if (isCommand) {
      if (!data || !channel) {
        await interaction.reply(reply('System urlopów jeszcze się uruchamia. Spróbuj ponownie.'));
        return true;
      }
      await interaction.reply({ ...panel(client, data), flags: MessageFlags.Ephemeral });
      return true;
    }
    if (isButton) {
      if (interaction.customId === ID + 'start') await interaction.showModal(form('vacation'));
      else if (interaction.customId === ID + 'absence') await interaction.showModal(form('absence'));
      else if (interaction.customId === ID + 'reduced') await interaction.showModal(form('reduced'));
      else if (interaction.customId === ID + 'end') {
        const active = data?.records.find(r => r.kind === 'vacation' && r.userId === interaction.user.id &&
          (r.status === 'planned' || r.status === 'active'));
        if (!active) {
          await interaction.reply(reply('Nie masz obecnie zgłoszonego urlopu do zakończenia.'));
        } else {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(ID + 'confirm_' + active.id)
              .setStyle(ButtonStyle.Danger).setLabel('Tak, zakończ urlop').setEmoji('✅'),
            new ButtonBuilder().setCustomId(ID + 'cancel')
              .setStyle(ButtonStyle.Secondary).setLabel('Anuluj').setEmoji('✖️')
          );
          await interaction.reply({
            content: 'Czy chcesz zakończyć urlop od **' + displayDate(active.start) +
              '** do **' + displayDate(active.end) + '**?',
            components: [row], flags: MessageFlags.Ephemeral
          });
        }
      } else if (interaction.customId === ID + 'cancel') {
        await interaction.update({ content: 'Anulowano zakończenie urlopu.', components: [] });
      } else if (interaction.customId.startsWith(ID + 'confirm_')) {
        const recordId = interaction.customId.slice((ID + 'confirm_').length);
        await serialize(async () => {
          const record = data?.records.find(r => r.id === recordId && r.userId === interaction.user.id &&
            r.kind === 'vacation' && (r.status === 'active' || r.status === 'planned'));
          if (!record) return interaction.update({ content: 'Urlop został już zakończony lub wygasł.', components: [] });
          record.status = 'ended';
          record.updatedAt = new Date().toISOString();
          record.endedEarlyAt = record.updatedAt;
          save(data);
          await syncVacationNickname(record);
          save(data);
          await interaction.update({
            content: record.nickApplied
              ? '✅ Urlop zakończony. ⚠️ ' + (record.nicknameError || 'Bot nie może usunąć oznaczenia [U].')
              : '✅ Urlop zakończony. Jeśli na nicku było automatyczne [U], zostało usunięte. Jeśli dodałeś je sam, usuń je ręcznie.',
            components: []
          });
          await sendReport(record, 'closed');
          console.log('BENNY URLOPY: zamknięto urlop ' + record.id);
        });
      }
      return true;
    }

    const kind = interaction.customId.slice((ID + 'form_').length);
    if (!kinds[kind]) return false;
    const start = parseDate(interaction.fields.getTextInputValue('date_start'));
    const end = parseDate(interaction.fields.getTextInputValue('date_end'));
    const reason = interaction.fields.getTextInputValue('reason').trim();
    if (!start || !end) {
      await interaction.reply(reply('❌ Nieprawidłowe daty. Podaj daty jako DD.MM.RRRR, np. 05.11.2026.'));
      return true;
    }
    if (start > end) {
      await interaction.reply(reply('❌ Data rozpoczęcia nie może być późniejsza niż data zakończenia.'));
      return true;
    }
    if (end < today()) {
      await interaction.reply(reply('❌ Nie można zgłosić okresu, który już się zakończył.'));
      return true;
    }
    if (daySpan(start, end) > 180) {
      await interaction.reply(reply('❌ Jeden okres może obejmować maksymalnie 180 dni.'));
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await serialize(async () => {
      data ||= load();
      if (kind === 'vacation' && data.records.some(r => r.userId === interaction.user.id &&
        r.kind === 'vacation' && (r.status === 'planned' || r.status === 'active'))) {
        return interaction.editReply('Masz już aktywny lub zaplanowany urlop. Zakończ go przed zgłoszeniem kolejnego.');
      }
      const record = {
        id: Date.now().toString(36) + '-' + interaction.user.id.slice(-5),
        userId: interaction.user.id, name: member.displayName, kind,
        start, end, reason, status: kind === 'vacation' ? (start > today() ? 'planned' : 'active') : 'reported',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      data.records.push(record);
      save(data);
      if (record.kind === 'vacation' && record.status === 'active') {
        await syncVacationNickname(record);
        save(data);
      }
      await sendReport(record);
      if (data.panelId && channel) {
        const message = await channel.messages.fetch(data.panelId).catch(() => null);
        if (message) await message.edit(panel(client, data)).catch(() => {});
      }
      console.log('BENNY URLOPY: zapisano ' + kind + ' użytkownika ' + interaction.user.id);
      await interaction.editReply('✅ Zgłoszenie **' + kinds[kind].display + '** zapisane. Okres: **' +
        displayDate(start) + ' – ' + displayDate(end) + '**.' +
        (kind === 'vacation' && record.status === 'active'
          ? (record.nickApplied ? ' 🌴 Nick oznaczony **[U]**.' :
            ' ⚠️ Nie udało się ustawić **[U]**: ' + (record.nicknameError || 'brak odpowiednich uprawnień').slice(0, 300))
          : kind === 'vacation' ? ' 🌴 **[U]** pojawi się w dniu rozpoczęcia urlopu.' : '') +
        ' Szczegóły: <#' + channel.id + '>.');
    });
    return true;
  }

  return { setup, handle };
}
