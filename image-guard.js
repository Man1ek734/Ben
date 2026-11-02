import sharp from 'sharp';

const blocked = [
  { ratio:1201/1280, d:'d89c1e9b0d4f999d', a:'f1bb103e1e1e1e38' },
  { ratio:1269/1280, d:'3bde5bd8dad8cae3', a:'2010d0d791979587' },
  { ratio:800/704, d:'37579186a383a7d0', a:'fc0000080f0f0f00' },
  { ratio:969/1212, d:'030865111125a5e1', a:'00000f3f2f0f0f0f' }
];
const bitDiff=(a,b)=>{
  let value=BigInt('0x'+a)^BigInt('0x'+b),count=0;
  while(value){value&=value-1n;count++;}
  return count;
};
function hex(bits) {return BigInt('0b'+bits).toString(16).padStart(16,'0');}
async function fingerprints(buffer) {
  const image=sharp(buffer,{limitInputPixels:20_000_000,failOn:'error'}).rotate().grayscale();
  const meta=await image.metadata();
  if(!meta.width || !meta.height)return null;
  const rawD=await image.clone().resize(9,8,{fit:'fill',kernel:'lanczos3'}).raw().toBuffer({resolveWithObject:true});
  const rawA=await image.clone().resize(8,8,{fit:'fill',kernel:'lanczos3'}).raw().toBuffer({resolveWithObject:true});
  const p=rawD.data,ch=rawD.info.channels;
  let dh='';
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    dh+=p[(y*9+x)*ch]>p[(y*9+x+1)*ch]?'1':'0';
  }
  const pixels=Array.from({length:64},(_,i)=>rawA.data[i*rawA.info.channels]);
  const avg=pixels.reduce((a,b)=>a+b,0)/64;
  return { ratio:meta.width/meta.height,d:hex(dh),a:hex(pixels.map(v=>v>=avg?'1':'0').join('')) };
}
export async function isBlockedScreenshot(attachment) {
  const extension=String(attachment.name||'').split('.').at(-1)?.toLowerCase();
  const mime=String(attachment.contentType||'').toLowerCase();
  if(!mime.startsWith('image/') && !['png','jpeg','jpg','webp'].includes(extension))return false;
  if(attachment.size>12_000_000)return false;
  let url;
  try{url=new URL(attachment.url);}catch{return false;}
  if(url.protocol!=='https:' || !['cdn.discordapp.com','media.discordapp.net','cdn.discordapp.net'].includes(url.hostname))return false;
  const response=await fetch(url,{signal:AbortSignal.timeout(8000)});
  if(!response.ok)return false;
  const len=Number(response.headers.get('content-length')||0);
  if(len>12_000_000)return false;
  const buffer=Buffer.from(await response.arrayBuffer());
  if(buffer.length>12_000_000)return false;
  const hash=await fingerprints(buffer);
  if(!hash)return false;
  return blocked.some(item=>Math.abs(hash.ratio-item.ratio)<0.07 &&
    bitDiff(item.d,hash.d)<=10 && bitDiff(item.a,hash.a)<=13);
}
