'use strict';
// Chronological Bible
// Scripture text is not shipped in this repo: the app downloads the shared RcV
// plain-text file (see AGENTS.md) and caches it in IndexedDB for offline use,
// with a localStorage timestamp/backup and a 15-day refresh window, matching
// the other RcV consumers. The chronological order ships in order.js.
const {verses:ORDER,eras,books}=window.ORDER||{};
const $=s=>document.querySelector(s);
const RCV_URL='https://cdn.rapidfile.cc/VbLdPuh9Yxb4/RcV';
const DB_NAME='rcv-chronological-database',STORE='scripture',CACHE_KEY='rcv-chronological-scripture-v1';
const FETCH_DATE_KEY='rcv-chronological-scripture-last-fetch';
const FIFTEEN_DAYS=15*24*60*60*1000;
const SHORT=['Gen.','Exo.','Lev.','Num.','Deut.','Josh.','Judg.','Ruth','1 Sam.','2 Sam.','1 Kings','2 Kings','1 Chron.','2 Chron.','Ezra','Neh.','Esth.','Job','Psa.','Prov.','Eccl.','S.S.','Isa.','Jer.','Lam.','Ezek.','Dan.','Hosea','Joel','Amos','Oba.','Jonah','Micah','Nahum','Hab.','Zeph.','Hag.','Zech.','Mal.','Matt.','Mark','Luke','John','Acts','Rom.','1 Cor.','2 Cor.','Gal.','Eph.','Phil.','Col.','1 Thes.','2 Thes.','1 Tim.','2 Tim.','Titus','Philem.','Heb.','James','1 Pet.','2 Pet.','1 John','2 John','3 John','Jude','Rev.'];
const LONG='Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalm|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation'.split('|');
const names={};SHORT.forEach((s,i)=>{names[s]=LONG[i]});

// Normalize references independently so phrase searches keep their original words.
function normalizeBook(value){return value.toLowerCase().replace(/[.\s]/g,'')}
function parseSearchReference(value){
  const match=value.match(/^((?:[1-3]\s*)?[a-z][a-z. ]*?)(?:\s*(\d+)(?:\s*:\s*(\d+))?)?$/i);
  if(!match)return null;
  const name=normalizeBook(match[1]);
  const book=LONG.find((full,i)=>normalizeBook(full)===name||normalizeBook(SHORT[i])===name||
    (full==='Psalm'&&name==='psalms')||(full==='Song of Solomon'&&['songofsongs','song'].includes(name)));
  return book?{book,chapter:match[2]?Number(match[2]):null,verse:match[3]?Number(match[3]):null}:null;
}

let verses=[],parts=[];
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let state={index:0,saved:[],size:20,theme:'light'},savedView=false,focusVerse=-1,cursorVerse=-1;

function readLastFetch(){try{return Number(localStorage.getItem(FETCH_DATE_KEY))||0}catch{return 0}}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function readCachedText(){
  try{
    const db=await openDb();
    const text=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get(CACHE_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(tx.error)}});
    if(text)return text;
  }catch(e){console.warn('IndexedDB read failed',e)}
  try{return localStorage.getItem(CACHE_KEY)}catch{return null}
}
async function writeCachedText(text){
  try{
    const db=await openDb();
    await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(text,CACHE_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
    db.close();
  }catch(e){console.warn('IndexedDB save failed',e)}
  try{localStorage.setItem(CACHE_KEY,text)}catch{/* quota: IndexedDB is primary */}
  try{localStorage.setItem(FETCH_DATE_KEY,String(Date.now()))}catch{}
}
function parseRcv(text){
  const lines=String(text).split(/\r?\n/).filter(l=>l.trim());
  if(lines.length!==31103)throw new Error('Scripture text validation failed: expected 31,103 verses, received '+lines.length);
  const lookup={};
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/^(.+?) (\d+):(\d+)\s+(.*)$/);
    if(!m)throw new Error('Unparsable line: '+lines[i].slice(0,80));
    const book=names[m[1]];
    if(!book)throw new Error('Unknown book abbreviation: '+m[1]);
    lookup[book+' '+parseInt(m[2],10)+':'+parseInt(m[3],10)]=m[4];
  }
  return lookup;
}
async function downloadAndCache(){
  const resp=await fetch(RCV_URL);
  if(!resp.ok)throw new Error('Could not download the Recovery Version text (HTTP '+resp.status+')');
  const text=await resp.text();
  parseRcv(text); // validate before caching
  await writeCachedText(text);
  return text;
}
async function loadVerses(){
  const lastFetch=readLastFetch();
  const cacheExpired=!lastFetch||Date.now()-lastFetch>FIFTEEN_DAYS;
  let text=null;
  if(!cacheExpired)text=await readCachedText();
  if(!text){
    try{text=await downloadAndCache()}
    catch(e){
      const stale=await readCachedText();
      if(stale){console.warn('Download failed; using stale cache',e);text=stale}
      else throw new Error('Could not download the Recovery Version text. Connect to the internet once and try again.');
    }
  }
  const lookup=parseRcv(text);
  return ORDER.map(pair=>{
    const ref=pair[0],era=pair[1],t=lookup[ref];
    if(t==null)throw new Error('Missing verse in downloaded text: '+ref);
    return [ref,t,era];
  });
}
function setStatus(msg){$('#loadmessage').textContent=msg;$('#loadretry').hidden=true;$('#loadstatus').hidden=false}
function setError(err){$('#loadmessage').textContent=err&&err.message?err.message:String(err);$('#loadretry').hidden=false;$('#loadstatus').hidden=false}

function initApp(){
let storedState={};try{storedState=JSON.parse(localStorage.getItem('rcv-chronological')||'{}')||{};Object.assign(state,storedState)}catch{}
state.index=Math.max(0,Math.min(parts.length-1,Number(state.index)||0));const storedVerses=Array.isArray(storedState.savedVerses)?storedState.savedVerses:Array.isArray(storedState.saved)?storedState.saved.map(i=>parts[i]?.start).filter(Number.isInteger):[];state.saved=[...new Set(storedVerses.filter(i=>Number.isInteger(i)&&i>=0&&i<verses.length))];
let fontBeforeMax=null;
function persist(){try{const {saved,...data}=state;data.savedVerses=saved;localStorage.setItem('rcv-chronological',JSON.stringify(data))}catch{}}
function appearance(){document.body.classList.toggle('dark',state.theme==='dark');document.body.classList.toggle('large-text',state.size>=24);document.body.classList.toggle('larger-text',state.size>=27);document.documentElement.style.setProperty('--font',state.size+'px');$('#sizeLabel').textContent=state.size+' px';document.querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===state.theme));persist()}
function nav(){const e=parts[state.index].era;$('#savedCount').textContent=state.saved.length;$('#timelineTab').classList.toggle('active',!savedView);$('#savedTab').classList.toggle('active',savedView);$('#navlabel').textContent=savedView?'YOUR SAVED VERSES':'THE BIBLICAL STORY';$('#eras').innerHTML=savedView?(state.saved.length?state.saved.map(i=>{const part=parts.find(p=>i>=p.start&&i<p.end);return `<button data-verse="${i}" class="${i===cursorVerse?'active':''}"><span>★</span>${esc(verses[i][0])}<br>${esc(eras[part.era].title)}</button>`}).join(''):'<p class="empty">Save a verse with ☆ to return to it here.</p>'):eras.map((x,i)=>{const count=parts.filter(p=>p.era===i).length;return `<button data-era="${i}" class="${i===e?'active':''}" ${i===e?'aria-current="true"':''}><span>${String(i+1).padStart(2,'0')}</span><span class="era-label">${esc(x.title)}<small class="section-count">${count} ${count===1?'section':'sections'}</small></span></button>`}).join('');}
function render(scroll=true){const p=parts[state.index],era=eras[p.era],a=verses[p.start],z=verses[p.end-1],saveTarget=focusVerse>=0?focusVerse:cursorVerse>=0?cursorVerse:p.start,sectionPages=parts.filter(x=>x.era===p.era),sectionPage=sectionPages.indexOf(p)+1;$('#eraCrumb').textContent=era.title;$('#eraNumber').textContent=`CHAPTER ${String(p.era+1).padStart(2,'0')} / ${String(eras.length).padStart(2,'0')} · SECTION ${sectionPage}/${sectionPages.length}`;$('#title').textContent=era.title;$('#subtitle').textContent=p.era===0?'Before the beginning, the eternal Word.':'Follow the story, one passage at a time.';$('#range').textContent=a[0]+' — '+z[0];let last='',html='';for(let i=p.start;i<p.end;i++){const [ref,text]=verses[i],chapter=ref.split(':')[0];if(chapter!==last){html+=`<h2>${esc(chapter)}</h2>`;last=chapter}html+=`<p id="v${i}" class="${i===focusVerse?'target':''}"><sup>${ref.split(':')[1]}</sup>${esc(text)}${i===focusVerse?`<button type="button" class="verse-save" aria-label="${state.saved.includes(i)?'Remove saved verse':'Save this verse'}" title="${state.saved.includes(i)?'Remove saved verse':'Save this verse'}">${state.saved.includes(i)?'★':'☆'}</button>`:''}</p>`}$('#verses').innerHTML=html;$('#bookmark').textContent=state.saved.includes(saveTarget)?'★ Verse saved':'☆ Save verse';$('#previous').disabled=state.index===0;$('#next').disabled=state.index===parts.length-1;$('#pageLabel').textContent=`${state.index+1} / ${parts.length}`;$('#progress').textContent=`${(p.start/verses.length*100).toFixed(1)}% THROUGH THE STORY`;nav();persist();if(scroll)window.scrollTo({top:0,behavior:'instant'});if(focusVerse>=0)requestAnimationFrame(()=>$('#v'+focusVerse)?.scrollIntoView({block:'center',behavior:'smooth'}));}
function go(i,target=-1,scroll=true){state.index=i;focusVerse=target;cursorVerse=target>=0?target:parts[i].start;history.replaceState(null,'','#'+encodeURIComponent(verses[target<0?parts[i].start:target][0]));document.body.classList.remove('nav-open');render(scroll)}
function jump(v){const i=parts.findIndex(p=>v>=p.start&&v<p.end);if(i>=0)go(i,v)}
$('#verses').onclick=e=>{const save=e.target.closest('.verse-save');if(save){e.stopPropagation();toggleSavedVerse(Number(save.closest('p').id.slice(1)));return}const verse=e.target.closest('p[id^="v"]');if(verse)toggleVerseHighlight(Number(verse.id.slice(1)))}
function moveVerse(delta){const current=cursorVerse>=0?cursorVerse:parts[state.index].start,target=Math.max(0,Math.min(verses.length-1,current+delta));if(target===current)return;const page=parts.findIndex(p=>target>=p.start&&target<p.end);if(page>=0)go(page,target,false)}
function toggleVerseHighlight(target=cursorVerse>=0?cursorVerse:parts[state.index].start){if(target===focusVerse){focusVerse=-1;history.replaceState(null,'',location.pathname+location.search);render(false);requestAnimationFrame(()=>$('#v'+target)?.scrollIntoView({block:'center',behavior:'smooth'}));return}const page=parts.findIndex(p=>target>=p.start&&target<p.end);if(page>=0)go(page,target,false)}
$('#eras').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.era!==undefined)go(parts.findIndex(p=>p.era===+b.dataset.era));else if(b.dataset.verse!==undefined)jump(+b.dataset.verse);else go(+b.dataset.part)};
$('#previous').onclick=()=>go(Math.max(0,state.index-1));$('#next').onclick=()=>go(Math.min(parts.length-1,state.index+1));$('#home').onclick=e=>{e.preventDefault();go(0)};function toggleSavedVerse(target=focusVerse>=0?focusVerse:cursorVerse>=0?cursorVerse:parts[state.index].start){const at=state.saved.indexOf(target);if(at<0)state.saved.push(target);else state.saved.splice(at,1);state.saved.sort((a,b)=>a-b);persist();render(false)}
$('#bookmark').onclick=()=>toggleSavedVerse();
$('#exportBookmarks').onclick=()=>{const data={format:'acs-chronological-bible-bookmarks',version:1,bookmarks:state.saved.map(i=>({reference:verses[i][0]}))},blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='chronological-bible-bookmarks.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#bookmarkStatus').textContent=`Exported ${state.saved.length} ${state.saved.length===1?'bookmark':'bookmarks'}.`};
$('#importBookmarks').onclick=()=>$('#bookmarkFile').click();
$('#bookmarkFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='acs-chronological-bible-bookmarks'||data.version!==1||!Array.isArray(data.bookmarks))throw new Error('Invalid bookmark file');let added=0,skipped=0;for(const item of data.bookmarks){const ref=typeof item==='string'?item:item?.reference;if(typeof ref!=='string'){skipped++;continue}const i=verses.findIndex(v=>v[0].toLowerCase()===ref.trim().toLowerCase());if(i<0){skipped++;continue}if(!state.saved.includes(i)){state.saved.push(i);added++}}state.saved.sort((a,b)=>a-b);persist();render(false);$('#bookmarkStatus').textContent=`Imported ${added} ${added===1?'bookmark':'bookmarks'}${skipped?`; skipped ${skipped} unrecognized entries`:''}.`}catch{$('#bookmarkStatus').textContent='Could not import bookmarks. Choose a valid Chronological Bible bookmark file.'}finally{e.target.value=''}};
$('#timelineTab').onclick=()=>{savedView=false;nav()};$('#savedTab').onclick=()=>{savedView=true;nav()};$('#menu').onclick=()=>document.body.classList.add('nav-open');$('#close').onclick=$('#shade').onclick=()=>document.body.classList.remove('nav-open');
$('#searchOpen').onclick=()=>{$('#searchDialog').showModal();if(!$('#query').value.trim()&&matchMedia('(hover: none) and (pointer: coarse)').matches)passageTable.querySelector('button[tabindex="0"]')?.focus({preventScroll:true});else $('#query').focus()};$('#settingsOpen').onclick=()=>$('#settings').showModal();$('#about').onclick=()=>$('#info').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('#smaller').onclick=()=>{fontBeforeMax=null;state.size=Math.max(16,state.size-1);appearance()};$('#larger').onclick=()=>{fontBeforeMax=null;state.size=Math.min(28,state.size+1);appearance()};document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{state.theme=b.dataset.theme;appearance()});
const passageTable=$('#passageTable');
let passageBook='',passageChapter=0,passageStage='books',passageColumns=3;
const passageIndex=new Map();
verses.forEach(([ref],i)=>{const m=ref.match(/^(.*) (\d+):(\d+)$/);if(!m)return;if(!passageIndex.has(m[1]))passageIndex.set(m[1],new Map());const chapters=passageIndex.get(m[1]);if(!chapters.has(+m[2]))chapters.set(+m[2],new Map());chapters.get(+m[2]).set(+m[3],i)});
function renderPassage(focus=false){
  const values=passageStage==='books'?books:passageStage==='chapters'?[...passageIndex.get(passageBook).keys()].sort((a,b)=>a-b):[...passageIndex.get(passageBook).get(passageChapter).keys()].sort((a,b)=>a-b);
  passageColumns=passageStage==='books'?(matchMedia('(max-width: 600px)').matches?2:3):5;
  $('#passageBook').hidden=!passageBook;$('#passageBook').textContent=passageBook;
  $('#passageChapter').hidden=!passageChapter;$('#passageChapter').textContent='Chapter '+passageChapter;
  const label=passageStage==='books'?'Choose a book':passageStage==='chapters'?passageBook+' — choose a chapter':passageBook+' '+passageChapter+' — choose a verse';
  let rows='';for(let i=0;i<values.length;i+=passageColumns){rows+='<tr>'+values.slice(i,i+passageColumns).map((v,j)=>`<td><button type="button" data-choice="${i+j}" tabindex="${i+j===0?0:-1}" aria-label="${esc(passageStage==='books'?String(v):passageStage==='chapters'?passageBook+' chapter '+v:passageBook+' '+passageChapter+':'+v)}">${esc(String(v))}</button></td>`).join('')+'</tr>'}
  passageTable.innerHTML=`<caption>${esc(label)}</caption><tbody>${rows}</tbody>`;
  passageTable.classList.toggle('book-table',passageStage==='books');
  if(focus)passageTable.querySelector('button')?.focus();
}
$('#passageBooks').onclick=()=>{passageStage='books';renderPassage(true)};
$('#passageBook').onclick=()=>{passageStage='chapters';renderPassage(true)};
$('#passageChapter').onclick=()=>{passageStage='verses';renderPassage(true)};
passageTable.onclick=e=>{
  const b=e.target.closest('button[data-choice]');if(!b)return;
  const i=+b.dataset.choice;
  if(passageStage==='books'){passageBook=books[i];passageChapter=0;passageStage='chapters';renderPassage(true)}
  else if(passageStage==='chapters'){passageChapter=[...passageIndex.get(passageBook).keys()].sort((a,b)=>a-b)[i];passageStage='verses';renderPassage(true)}
  else{const chapter=passageIndex.get(passageBook).get(passageChapter),number=[...chapter.keys()].sort((a,b)=>a-b)[i];$('#searchDialog').close();jump(chapter.get(number))}
};
passageTable.addEventListener('focusin',e=>{if(!e.target.matches('button[data-choice]'))return;passageTable.querySelectorAll('button').forEach(b=>b.tabIndex=b===e.target?0:-1)});
passageTable.onkeydown=e=>{
  const b=e.target.closest('button[data-choice]');if(!b)return;
  const buttons=[...passageTable.querySelectorAll('button')],i=buttons.indexOf(b),col=i%passageColumns;
  let next=i;
  if(e.key==='ArrowRight')next=col<passageColumns-1?Math.min(i+1,buttons.length-1):i;
  else if(e.key==='ArrowLeft')next=col>0?i-1:i;
  else if(e.key==='ArrowDown')next=i+passageColumns<buttons.length?i+passageColumns:i;
  else if(e.key==='ArrowUp')next=Math.max(col,i-passageColumns);
  else if(e.key==='Home')next=e.ctrlKey?0:i-col;
  else if(e.key==='End')next=e.ctrlKey?buttons.length-1:Math.min(i-col+passageColumns-1,buttons.length-1);
  else return;
  e.preventDefault();e.stopPropagation();buttons[next].focus();
};
matchMedia('(max-width: 600px)').addEventListener('change',()=>{
  const active=document.activeElement,inTable=passageTable.contains(active),choice=active?.dataset.choice;
  renderPassage();
  if(inTable)passageTable.querySelector(`[data-choice="${choice}"]`)?.focus({preventScroll:true});
});
renderPassage();
$('#query').oninput=search;
function search(){
  const raw=$('#query').value.trim(),q=raw.toLowerCase();
  $('#searchDialog .passage-select').hidden=!!q;
  if(!q){$('#results').innerHTML='';$('#searchHint').textContent='Search the full Recovery Version or choose a book, chapter, and verse.';return}
  const reference=parseSearchReference(raw),hits=[];
  let total=0;
  for(let i=0;i<verses.length;i++){
    const [ref,text]=verses[i];
    let matches;
    if(reference){
      const target=reference.book+(reference.chapter===null?'':' '+reference.chapter)+(reference.verse===null?'':':'+reference.verse);
      matches=reference.verse!==null?ref===target:ref.startsWith(target+(reference.chapter===null?' ':':'));
    }else matches=text.toLowerCase().includes(q)||(!/\d/.test(q)&&ref.toLowerCase().startsWith(q));
    if(matches){total++;if(hits.length<80)hits.push(i)}
  }
  $('#searchHint').textContent=total?`${total.toLocaleString()} results${total>80?' · showing the first 80':''}`:'No matches. Try a full book name or a different phrase.';
  $('#results').innerHTML=hits.map(i=>`<button data-verse="${i}"><b>${esc(verses[i][0])} · ${esc(eras[verses[i][2]].title)}</b><span>${esc(verses[i][1])}</span></button>`).join('');
}
$('#results').onclick=e=>{const b=e.target.closest('button');if(b){$('#searchDialog').close();jump(+b.dataset.verse)}};
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable)return;if(document.querySelector('dialog[open]'))return;if(e.key.toLowerCase()==='m'){e.preventDefault();$('#bookmark').click();return}if(e.key.toLowerCase()==='f'){e.preventDefault();if(e.shiftKey){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else document.documentElement.requestFullscreen?.().catch(()=>{})}else if(fontBeforeMax!==null){state.size=fontBeforeMax;fontBeforeMax=null;appearance()}else{fontBeforeMax=state.size;state.size=28;appearance()}return}if(['+','=','Add'].includes(e.key)){e.preventDefault();fontBeforeMax=null;state.size=Math.min(28,state.size+1);appearance();return}if(['-','_','Subtract'].includes(e.key)){e.preventDefault();fontBeforeMax=null;state.size=Math.max(16,state.size-1);appearance();return}if(document.querySelector('dialog[open]'))return;if(e.key==='/'){e.preventDefault();$('#searchOpen').click()}else if(e.key==='?'){e.preventDefault();$('#settingsOpen').click()}else if(e.key==='ArrowRight'||e.key.toLowerCase()==='l')$('#next').click();else if(e.key==='ArrowLeft'||e.key.toLowerCase()==='h')$('#previous').click();else if(e.key==='ArrowUp'||e.key.toLowerCase()==='k'){e.preventDefault();moveVerse(-1)}else if(e.key==='ArrowDown'||e.key.toLowerCase()==='j'){e.preventDefault();moveVerse(1)}else if((e.code==='Space'||e.key===' ')&&!e.target.closest('button,a,[role="button"]')){e.preventDefault();toggleVerseHighlight()}});
function fromHash(){let ref;try{ref=decodeURIComponent(location.hash.slice(1))}catch{return false}const i=verses.findIndex(v=>v[0].toLowerCase()===ref.toLowerCase());if(i>=0){state.index=parts.findIndex(p=>i>=p.start&&i<p.end);focusVerse=i;cursorVerse=i;return true}return false}
window.addEventListener('hashchange',()=>{if(fromHash())render()});fromHash();appearance();render(false);if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('sw.js').catch(()=>{});

}
async function boot(){
  if(!ORDER){setError(new Error('order.js is missing. Reinstall the app or contact the maintainer.'));return}
  setStatus('Loading Scripture…');
  try{
    verses=await loadVerses();
  }catch(e){setError(e);return}
  parts=[];let start=0;while(start<verses.length){let end=Math.min(start+45,verses.length);for(let j=start+1;j<end;j++)if(verses[j][2]!==verses[start][2]){end=j;break}parts.push({start,end,era:verses[start][2]});start=end}
  $('#loadstatus').hidden=true;
  initApp();
}

$('#loadretry').onclick=()=>boot();
window.addEventListener('online',()=>{if(!verses.length)boot()});
boot();
