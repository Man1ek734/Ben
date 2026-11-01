import { ChannelType, AttachmentBuilder } from 'discord.js';

export function channelKey(name) {
  return String(name || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function matchingManagedChannels(guild, categoryId, type, expectedName, expectedNames, excludedIds = new Set()) {
  const channels = guild.channels.cache.filter(c => c.parentId === categoryId && c.type === type && !excludedIds.has(c.id));
  const exact = channels.filter(c => c.name === expectedName);
  const key = channelKey(expectedName);
  const intendedCount = expectedNames.filter(name => channelKey(name) === key).length;
  if (intendedCount > 1) return [...exact.values()];
  return [...channels.filter(c => channelKey(c.name) === key).values()];
}

export function findManagedChannel(guild, categoryId, type, expectedName, expectedNames, excludedIds = new Set()) {
  const matches = matchingManagedChannels(guild, categoryId, type, expectedName, expectedNames, excludedIds);
  return matches.sort((a, b) => a.createdTimestamp - b.createdTimestamp)[0] || null;
}

async function getMessages(channel) {
  const messages = [];
  let before;
  for (let page = 0; page < 40; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) return messages;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) return messages;
  }
  throw new Error('Kanał ma ponad 4000 wiadomości; wymaga osobnej archiwizacji.');
}

async function saveArchive(duplicate, survivor, messages) {
  if (!messages.length) return;
  const lines = [
    'Benny’s Original Motor Works – archiwum duplikatu kanału',
    'Nazwa: ' + duplicate.name,
    'ID: ' + duplicate.id,
    'Data: ' + new Date().toISOString(),
    ''
  ];
  for (const message of messages.reverse()) {
    lines.push('[' + new Date(message.createdTimestamp).toISOString() + '] ' + (message.author?.tag || message.author?.id || 'Nieznany'));
    lines.push(message.content || '[brak treści tekstowej]');
    for (const attachment of message.attachments.values()) lines.push('Załącznik: ' + attachment.url);
    for (const embed of message.embeds) {
      if (embed.title) lines.push('Embed: ' + embed.title);
      if (embed.description) lines.push(embed.description);
    }
    lines.push('');
  }
  const text = lines.join('\n');
  if (Buffer.byteLength(text, 'utf8') > 7_000_000) throw new Error('Archiwum jest zbyt duże; nie usunięto kanału.');
  await survivor.send({
    content: '📁 Zachowano archiwum wiadomości z dawnego duplikatu kanału.',
    files: [new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'archiwum-' + duplicate.id + '.txt' })],
    allowedMentions: { parse: [] }
  });
}

export async function cleanupManagedDuplicates(guild, category, section) {
  const specs = section.channels.filter(spec => spec[0] === 'text');
  const expectedNames = specs.map(spec => spec[1]);
  const already = new Set();
  let removed = 0;
  let kept = 0;

  for (const [, name] of specs) {
    const key = channelKey(name);
    if (already.has(key)) continue;
    already.add(key);
    if (expectedNames.filter(value => channelKey(value) === key).length !== 1) continue;
    const matches = matchingManagedChannels(guild, category.id, ChannelType.GuildText, name, expectedNames);
    if (matches.length < 2) continue;

    const info = [];
    for (const channel of matches) {
      const preview = await channel.messages.fetch({ limit: 100 });
      const userCount = preview.filter(m => !m.author?.bot).size;
      const panels = preview.filter(m => m.author?.id === guild.client.user.id && m.components.some(row => row.components.length > 0)).size;
      info.push({ channel, userCount, panels });
    }
    info.sort((a, b) => b.userCount - a.userCount || b.panels - a.panels || a.channel.createdTimestamp - b.channel.createdTimestamp);
    const survivor = info[0].channel;
    kept++;
    console.log('BENNY DUPLIKATY: zachowuję ' + survivor.name + ' (' + survivor.id + '), wykryto ' + matches.length + ' kopii.');

    for (const { channel } of info.slice(1)) {
      try {
        const messages = await getMessages(channel);
        await saveArchive(channel, survivor, messages);
        await channel.delete('Usunięcie duplikatu kanału Benny’s; wiadomości zabezpieczono w kanale docelowym');
        removed++;
        console.log('BENNY DUPLIKATY: usunięto ' + channel.name + ' (' + channel.id + ') po zachowaniu ' + messages.length + ' wiadomości.');
      } catch (error) {
        console.error('BENNY DUPLIKATY: NIE USUNIĘTO ' + channel.name + ' (' + channel.id + '): ' + error.message);
      }
    }
  }
  return { removed, kept };
}
