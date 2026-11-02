import fs from 'node:fs';
import path from 'node:path';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const FILE='/data/benny-raid-lock.json';
const load=()=>fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE,'utf8')):null;
function save(data) {
  fs.mkdirSync(path.dirname(FILE),{recursive:true});
  fs.writeFileSync(FILE+'.tmp',JSON.stringify(data));
  fs.renameSync(FILE+'.tmp',FILE);
}
export function createRaidLock(log) {
  let state=load();
  async function activate(guild,source='Automatyczny alarm') {
    if(state) return 'Blokada już jest aktywna.';
    await guild.channels.fetch();
    const me=await guild.members.fetchMe();
    if(!me.permissions.has(PermissionFlagsBits.ManageChannels)) return 'Brakuje Zarządzanie kanałami.';
    const edits=[];
    for(const channel of guild.channels.cache.values()) {
      if(channel.type!==ChannelType.GuildText ||
        !channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel) ||
        !channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.SendMessages)) continue;
      const o=channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
      const was=o?.allow.has(PermissionFlagsBits.SendMessages)?'allow':'unset';
      try{
        await channel.permissionOverwrites.edit(guild.roles.everyone.id,{SendMessages:false},
          {reason:'Benny’s Anti-Raid: tymczasowe zabezpieczenie'});
        edits.push({id:channel.id,was});
      }catch(e){console.error('BENNY LOCK '+channel.id+' '+e.message);}
    }
    if(!edits.length)return 'Brak dostępnych kanałów do zabezpieczenia.';
    state={until:Date.now()+300000,edits};save(state);
    await log(guild,'🚨 ANTI-RAID • BLOKADA',[
      ['Powód',source],['Kanałów',String(edits.length)],
      ['Koniec','<t:'+Math.floor(state.until/1000)+':R>']],0xed4245);
    return 'Zabezpieczono '+edits.length+' kanałów na 5 minut.';
  }
  async function release(guild,who='Automatycznie') {
    if(!state)return 'Nie ma aktywnej blokady.';
    await guild.channels.fetch();
    let count=0;const errors=[];
    for(const entry of state.edits) {
      const ch=guild.channels.cache.get(entry.id);
      if(!ch)continue;
      try{
        if(ch.permissionOverwrites.cache.get(guild.roles.everyone.id)
          ?.deny.has(PermissionFlagsBits.SendMessages)) {
          await ch.permissionOverwrites.edit(guild.roles.everyone.id,{
            SendMessages:entry.was==='allow'?true:null
          },{reason:'Benny’s Anti-Raid: odblokowanie'});
          count++;
        }
      }catch(e){errors.push(entry);console.error('BENNY UNLOCK '+e.message);}
    }
    state=errors.length?{until:Date.now()+60000,edits:errors}:null;
    save(state);
    await log(guild,'🔓 ANTI-RAID • ODBLOKOWANIE',[
      ['Wykonał',who],['Przywrócono',String(count)],['Błędy',String(errors.length)]],0x57f287);
    return 'Przywrócono '+count+' kanałów; błędy: '+errors.length+'.';
  }
  const get=()=>state;
  return {activate,release,get};
}
