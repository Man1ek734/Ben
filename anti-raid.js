import fs from 'node:fs';
import { Events, PermissionFlagsBits, MessageFlags,
  AutoModerationRuleEventType, AutoModerationRuleTriggerType,
  AutoModerationActionType } from 'discord.js';
import { createRaidLock } from './raid-lockdown.js';
import { isBlockedScreenshot } from './image-guard.js';

const CONF='/data/benny-antiraid.json';
const LOG_ID='1566480686351650837';
const RULES=[
  { name:'BENNY | Ochrona przed spamem', triggerType:AutoModerationRuleTriggerType.Spam },
  { name:'BENNY | Ochrona przed ping-raidem', triggerType:AutoModerationRuleTriggerType.MentionSpam,
    triggerMetadata:{mentionTotalLimit:6,mentionRaidProtectionEnabled:true} },
  { name:'BENNY | Blokada linkow',triggerType:AutoModerationRuleTriggerType.Keyword,
    triggerMetadata:{regexPatterns:[
      '(?i)(?:https?://|www\\.)[^\\s<>()]+',
      '(?i)\\b[a-z0-9-]{2,}\\.(?:com|net|org|pl|gg|io|co|xyz|cc|app|dev|me|site|online|live|store|shop|link|top|ru|uk|eu|tv|info|biz|to|pro|cloud)\\b'
    ]}}
];
const staff=new Set(['Dyrektor LSC','Współwłaściciel','Właściciel','Kierownik']);
const exempt=new Set(['Właściciel','Współwłaściciel','Zastępca Właściciela','.']);
const load=()=>fs.existsSync(CONF)?JSON.parse(fs.readFileSync(CONF,'utf8')):{enabled:true};
const save=v=>{fs.mkdirSync('/data',{recursive:true});fs.writeFileSync(CONF,JSON.stringify(v));};
export function createAntiRaid(client,{guildId,log,membersIntent=false,contentIntent=false}) {
  const config=load(), lockdown=createRaidLock(log);
  let guild,timer;
  const joins=[],flood=new Map(),cooldown=new Map();
  async function configure(server) {
    const rules=await server.autoModerationRules.fetch();
    for(const item of RULES) {
      let existing=rules.find(r=>r.name===item.name);
      if(!existing && rules.some(r=>r.triggerType===item.triggerType)) {
        console.log('BENNY ANTYRAID: Discord ma już regułę dla '+item.name);
        continue;
      }
      const links=item.triggerType===AutoModerationRuleTriggerType.Keyword;
      const exemptRoles=server.roles.cache.filter(r=>(links?exempt:staff).has(r.name.replace(/^・/, ''))).map(r=>r.id);
      const actions=[
        {type:AutoModerationActionType.BlockMessage,
          metadata:{customMessage:links?'Benny’s: linki są zabronione. Wyciszenie 5 minut.':
            'Benny’s Anti-Raid: wiadomość zablokowana.'}},
        {type:AutoModerationActionType.SendAlertMessage,metadata:{channel:LOG_ID}},
        ...(links?[{type:AutoModerationActionType.Timeout,metadata:{durationSeconds:300}}]:[])
      ];
      try {
        if(existing) {
          if(links) {
            await existing.edit({actions,triggerMetadata:item.triggerMetadata,
              exemptRoles,enabled:config.enabled,reason:'Benny’s: aktualizacja reguły linków'});
          } else if(existing.enabled!==config.enabled) await existing.setEnabled(config.enabled);
        } else {
          existing=await server.autoModerationRules.create({
            name:item.name,eventType:AutoModerationRuleEventType.MessageSend,
            triggerType:item.triggerType,triggerMetadata:item.triggerMetadata,
            actions,enabled:config.enabled,
            exemptRoles,
            reason:'Benny’s: automatyczna ochrona Anti-Raid'
          });
          console.log('BENNY ANTYRAID: dodano regułę '+existing.name);
        }
      } catch(error) { console.error('BENNY ANTYRAID RULE '+item.name+': '+error.message+' '+JSON.stringify(error.rawError || {})); }
    }
  }
  async function setup(server) {
    guild=server;
    const me=await server.members.fetchMe();
    if(me.permissions.has(PermissionFlagsBits.ManageGuild)) await configure(server);
    else console.error('BENNY ANTYRAID: brak uprawnienia ManageGuild dla AutoMod');
    if(lockdown.get()?.until<Date.now()) await lockdown.release(server,'Przywrócenie po restarcie');
    if(!timer) {
      timer=setInterval(()=>{
        if(lockdown.get() && lockdown.get().until<=Date.now())
          lockdown.release(guild).catch(e=>console.error('BENNY ANTYRAID: '+e.message));
      },15000);
      timer.unref();
    }
    console.log('BENNY ANTYRAID GOTOWE: enabled='+config.enabled+
      ', membersIntent='+membersIntent+', contentIntent='+contentIntent+', moderateMembers='+me.permissions.has(PermissionFlagsBits.ModerateMembers));
    await log(server,'🛡️ ANTI-RAID • OCHRONA SERWERA',[
      ['Stan',config.enabled?'Włączona':'Wyłączona'],
      ['AutoMod','Spam oraz masowe oznaczanie'],
      ['Spam ilościowy','9 wiadomości / 8 sekund → timeout 10 minut'],
      ['Linki','Blokada i 5 minut mute (wyjątki: Właściciel, Współwłaściciel, .)'],
      ['Zabronione grafiki',contentIntent?'4 zdjęcia → usunięcie i mute 60 minut':'Wymaga Message Content Intent'],
      ['Fala wejść',membersIntent?'8 osób / 30 s → blokada 5 minut':'Wymaga Server Members Intent'],
      ['Zarządzanie','/antyraid status • blokada • odblokuj']
    ],0x57f287);
  }
  async function checkBannedImages(message,member) {
    if(!contentIntent || !message.attachments?.size)return false;
    if(member.id===member.guild.ownerId ||
      member.roles.cache.some(r=>exempt.has(r.name.replace(/^・/, ''))))return false;
    let match=false;
    for(const file of message.attachments.values()) {
      try {
        if(await isBlockedScreenshot(file)) {match=true;break;}
      }catch(error) {console.error('BENNY IMAGE SCAN ERROR: '+error.message);}
    }
    if(!match)return false;
    let deleted=false;
    try {if(message.deletable){await message.delete();deleted=true;}}
    catch(error){console.error('BENNY IMAGE DELETE ERROR: '+error.message);}
    let timeout='Nie udało się (uprawnienia / hierarchia)';
    if(member.moderatable) {
      try {
        const existingUntil=member.communicationDisabledUntilTimestamp || 0;
        const until=Math.max(Date.now()+3600000,existingUntil);
        await member.timeout(until-Date.now(),'Benny’s: zabroniona grafika');
        timeout='60 minut';
      }catch(error){timeout='Błąd: '+error.message;}
    }
    await log(message.guild,'🚫 AUTOMOD • BLOKADA ZDJĘCIA',[
      ['Użytkownik','<@'+member.id+'>'],
      ['Kanał','<#'+message.channelId+'>'],
      ['Wiadomość usunięta',deleted?'TAK':'NIE'],
      ['Wyciszenie',timeout],
      ['Powód','Dopasowanie do jednego z 4 zabronionych obrazów']
    ],0xed4245);
    console.log('BENNY IMAGE MATCH: member='+member.id+', deleted='+deleted+', timeout='+timeout);
    return true;
  }
  client.on(Events.GuildMemberAdd,member=>{
    if(!config.enabled || !membersIntent || member.guild.id!==guildId || member.user.bot)return;
    const now=Date.now();joins.push(now);
    while(joins[0]<now-30000)joins.shift();
    if(joins.length>=8 && !lockdown.get())
      lockdown.activate(member.guild,'Fala '+joins.length+' wejść w 30 s')
        .catch(e=>console.error('BENNY ANTYRAID JOIN: '+e.message));
  });
  client.on(Events.MessageCreate,async message=>{
    if(!config.enabled || message.guildId!==guildId || message.author.bot ||
      cooldown.get(message.author.id)>Date.now())return;
    try {
      const m=message.member || await message.guild.members.fetch(message.author.id);
      if(!m)return;
      if(await checkBannedImages(message,m))return;
      if(m.id===m.guild.ownerId || m.permissions.has(PermissionFlagsBits.ManageMessages) ||
        m.roles.cache.some(r=>staff.has(r.name.replace(/^・/, ''))))return;
      const now=Date.now(), id=message.author.id, timestamps=flood.get(id)||[];
      timestamps.push(now);
      while(timestamps[0]<now-8000) timestamps.shift();
      flood.set(id,timestamps);
      if(flood.size>1000)flood.delete(flood.keys().next().value);
      if(timestamps.length<9)return;
      flood.delete(id);cooldown.set(id,now+45000);
      let result='Brak uprawnień do wyciszenia.';
      if(m.moderatable) {
        try{await m.timeout(600000,'Benny’s Anti-Raid: nagły zalew wiadomości');
          result='10 minut';}catch(e){result=e.message;}
      }
      await log(message.guild,'🚨 ANTI-RAID • FLOOD',[
        ['Użytkownik','<@'+id+'>'],['Kanał','<#'+message.channelId+'>'],
        ['Wiadomości','9 / 8 sekund'],['Timeout',result]
      ],0xed4245);
    }catch(e){console.error('BENNY ANTYRAID MSG: '+e.message);}
  });
  async function handle(i) {
    if(!i.isChatInputCommand() || i.commandName!=='antyraid')return false;
    if(i.guildId!==guildId)return true;
    if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await i.reply({content:'⛔ Wymagane zarządzanie serwerem.',flags:MessageFlags.Ephemeral});return true;
    }
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const action=i.options.getSubcommand();
    if(action==='status') {
      const me=await i.guild.members.fetchMe();
      await i.editReply('🛡️ **Benny’s Anti-Raid**\nOchrona: **'+
        (config.enabled?'WŁĄCZONA':'WYŁĄCZONA')+'**\nBlokada: **'+
        (lockdown.get()?'<t:'+Math.floor(lockdown.get().until/1000)+':R>':'brak')+
        '**\nAutoMod: spam i ping-raid\nFale wejść: '+
        (membersIntent?'aktywne':'wymaga Server Members Intent')+
        '\nTimeout: '+(me.permissions.has(PermissionFlagsBits.ModerateMembers)?'możliwy':'brak Moderate Members')+'\nSkan zdjęć: '+(contentIntent?'AKTYWNY':'wymaga Message Content Intent'));
    } else if(action==='wlacz' || action==='wylacz') {
      config.enabled=action==='wlacz';save(config);
      await configure(i.guild);
      await i.editReply(config.enabled?'✅ Anti-Raid włączony.':'⚠️ Anti-Raid wyłączony.');
    } else {
      await i.editReply(action==='blokada'?
        await lockdown.activate(i.guild,'Komenda <@'+i.user.id+'>'):
        await lockdown.release(i.guild,'<@'+i.user.id+'>'));
    }
    return true;
  }
  return {setup,handle};
}
