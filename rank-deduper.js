import { PermissionFlagsBits } from 'discord.js';

const SEARCH_PREFIXES = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('')
  .concat(['ą','ć','ę','ł','ń','ó','ś','ź','ż','_','.','[','-','!','・','@','💎','👑']);

async function getEveryMember(guild) {
  const found = new Map();
  const botMember = await guild.members.fetchMe();
  found.set(botMember.id, {
    user: { id: botMember.id },
    roles: [...botMember.roles.cache.keys()]
  });
  let errors = 0;
  for (const prefix of SEARCH_PREFIXES) {
    try {
      const records = await guild.client.rest.get('/guilds/' + guild.id + '/members/search', {
        query: new URLSearchParams({ query: prefix, limit: '100' })
      });
      for (const record of Array.isArray(records) ? records : []) {
        if (record.user?.id) found.set(record.user.id, record);
      }
    } catch (error) {
      errors++;
      console.error('BENNY ROLE CLEANUP: wyszukiwanie członków ' + prefix +
        ' status=' + error.status + ' ' + error.message);
    }
    if (found.size >= guild.memberCount) break;
  }
  if (errors || found.size !== guild.memberCount) {
    throw new Error('Niepełna lista członków: ' + found.size +
      ' / ' + guild.memberCount + ', błędów=' + errors +
      '. Role pozostają bez zmian.');
  }
  return [...found.values()];
}

function overwriteSettings(overwrite) {
  const settings = {};
  for (const [flag, bit] of Object.entries(PermissionFlagsBits)) {
    if (overwrite.allow.has(bit)) settings[flag] = true;
    else if (overwrite.deny.has(bit)) settings[flag] = false;
  }
  return settings;
}

export async function cleanDuplicatedRanks(guild, rankNames) {
  await guild.roles.fetch();
  await guild.channels.fetch();

  const candidates = [];
  for (const name of rankNames) {
    const original = guild.roles.cache.find(role => role.name === '・' + name);
    const duplicate = guild.roles.cache.find(role => role.name === name);
    if (!original || !duplicate || original.id === duplicate.id) continue;
    if (original.managed || duplicate.managed || !duplicate.editable) {
      console.error('BENNY ROLE CLEANUP: pominięto ' + name + ', rola zarządzana lub brak możliwości edycji.');
      continue;
    }
    candidates.push({ name, original, duplicate });
  }

  if (!candidates.length) {
    console.log('BENNY ROLE CLEANUP: brak powtórzonych stopni.');
    return { removed: 0, retained: 0 };
  }

  let members;
  try {
    members = await getEveryMember(guild);
  } catch (error) {
    console.error('BENNY ROLE CLEANUP: ' + error.message);
    return { removed: 0, retained: candidates.length };
  }

  let removed = 0;
  const failures = [];
  for (const { name, original, duplicate } of candidates) {
    let blocked = false;
    let transferred = 0;
    const users = members.filter(member => (member.roles || []).includes(duplicate.id));
    for (const info of users) {
      try {
        const member = await guild.members.fetch({ user: info.user.id, force: true });
        if (member.roles.cache.has(duplicate.id) && !member.roles.cache.has(original.id)) {
          await member.roles.add(original.id, 'Benny’s: przeniesienie przypisanego stopnia przed usunięciem kopii');
          transferred++;
        }
      } catch (error) {
        blocked = true;
        console.error('BENNY ROLE CLEANUP: nie przeniesiono użytkownika z roli ' + name +
          ': ' + error.message);
      }
    }

    for (const channel of guild.channels.cache.values()) {
      const overwrites = channel.permissionOverwrites?.cache;
      if (!overwrites?.has(duplicate.id) || overwrites.has(original.id)) continue;
      try {
        await channel.permissionOverwrites.edit(original.id,
          overwriteSettings(overwrites.get(duplicate.id)),
          { reason: 'Benny’s: zachowanie uprawnień oryginalnej roli ' + name });
      } catch (error) {
        blocked = true;
        console.error('BENNY ROLE CLEANUP: nie przeniesiono uprawnień kanału ' +
          channel.id + ' dla ' + name + ': ' + error.message);
      }
    }

    if (blocked) {
      failures.push(name);
      console.error('BENNY ROLE CLEANUP: zachowano duplikat ' + name + ', migracja niekompletna.');
      continue;
    }

    try {
      await duplicate.delete('Benny’s: usunięcie zdublowanej roli bez przedrostka ・');
      removed++;
      console.log('BENNY ROLE CLEANUP: usunięto kopię ' + name +
        ' (' + duplicate.id + '), zachowano ・' + name +
        ' (' + original.id + '), przeniesiono użytkowników=' + transferred);
    } catch (error) {
      failures.push(name);
      console.error('BENNY ROLE CLEANUP: nie udało się usunąć kopii ' + name +
        ': ' + error.message);
    }
  }

  console.log('BENNY ROLE CLEANUP GOTOWE: usunięto=' + removed +
    ', nieusunięte=' + failures.length +
    (failures.length ? ', lista=' + failures.join(', ') : ''));
  return { removed, retained: failures.length };
}
