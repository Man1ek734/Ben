import fs from 'node:fs';
import { Events, PermissionFlagsBits, MessageFlags,
  AutoModerationRuleEventType, AutoModerationRuleTriggerType,
  AutoModerationActionType } from 'discord.js';
import { createRaidLock } from './raid-lockdown.js';

const CONF='/data/benny-antiraid.json';
const LOG_ID='1566480686351650837';
const RULES=[
  { name:'BENNY | Ochrona przed spamem', triggerType:AutoModerationRuleTriggerType.Spam },
  { name:'BENNY | Ochrona przed ping-raidem', triggerType:AutoModerationRuleTriggerType.MentionSpam,
    triggerMetadata:{mentionTotalLimit:6,mentionRaidProtectionEnabled:true} }
];
const staff=new Set(['Dyrektor LSC','Współwłaściciel','Właściciel','Kierownik']);
const load=()=>fs.existsSync(CONF)?JSON.parse(fs.readFileSync(CONF,'utf8')):{enabled:true};
const save=v=>{fs.mkdirSync('/data',{recursive:true});fs.writeFileSync(CONF,JSON.stringify(v));};
export function createAntiRaid(client,{guildId,log,membersIntent=false}) {
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
      const actions=[
        {type:AutoModerationActionType.BlockMessage,
          metadata:{customMessage:'Benny’s Anti-Raid: wiadomość zablokowana.'}},
        {type:AutoModerationActionType.SendAlertMessage,
          metadata:{channel:LOG_ID}}
      ];
      try {
        if(existing) {
          if(existing.enabled!==config.enabled) await existing.setEnabled(config.enabled);
        } else {
          existing=await server.autoModerationRules.create({
            name:item.name,eventType:AutoModerationRuleEventType.MessageSend,
            triggerType:item.triggerType,triggerMetadata:item.triggerMetadata,
            actions,enabled:config.enabled,
            exemptRoles:server.roles.cache.filter(r=>staff.has(r.name)).map(r=>r.id),
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
      ', membersIntent='+membersIntent+', moderateMembers='+me.permissions.has(PermissionFlagsBits.ModerateMembers));
    await log(server,'🛡️ ANTI-RAID • OCHRONA SERWERA',[
      ['Stan',config.enabled?'Włączona':'Wyłączona'],
      ['AutoMod','Spam oraz masowe oznaczanie'],
      ['Spam ilościowy','9 wiadomości / 8 sekund → timeout 10 minut'],
      ['Fala wejść',membersIntent?'8 osób / 30 s → blokada 5 minut':'Wymaga Server Members Intent'],
      ['Zarządzanie','/antyraid status • blokada • odblokuj']
    ],0x57f287);
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
      if(!m || m.id===m.guild.ownerId || m.permissions.has(PermissionFlagsBits.ManageMessages) ||
        m.roles.cache.some(r=>staff.has(r.name)))return;
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
        '\nTimeout: '+(me.permissions.has(PermissionFlagsBits.ModerateMembers)?'możliwy':'brak Moderate Members'));
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
