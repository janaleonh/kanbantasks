// Only this static page runs scripts. Note content enters through text nodes.
export const editorPage = String.raw`<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">
<style>
*{box-sizing:border-box}body{margin:0;font:17px -apple-system,BlinkMacSystemFont,sans-serif;color:var(--ink);background:var(--bg)}
header{display:flex;flex-wrap:wrap;gap:4px;padding:6px;border-bottom:1px solid var(--muted)}button{font:inherit;font-size:14px;border:0;border-radius:7px;padding:8px;color:var(--ink);background:transparent}button[aria-pressed=true]{background:var(--ink);color:var(--bg)}
main{outline:none;height:calc(100dvh - var(--bar,48px));overflow-y:auto;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45;caret-color:var(--ink)}
main:empty:before{content:'Schreib etwas …';color:var(--muted);pointer-events:none}
main h1,main h2,main h3{margin:0;font-size:1.35em}main h3{font-size:1.17em}main h1{font-size:1.55em}
main p,main h4,main h5,main h6{margin:0;font:inherit}
main h4,main h5,main h6{position:relative;padding-left:1.6em}
main h4:before,main h5:before,main h6:before{position:absolute;left:0;width:1.5em;text-align:center}
main h4:before{content:'•'}main h5:before{content:'☐'}main h6:before{content:'☑'}main h6{color:var(--muted)}
</style></head><body>
<header aria-label="Formatierung"><button data-kind="h2">Überschrift</button><button data-kind="bold"><b>Fett</b></button><button data-kind="h4">Liste</button><button data-kind="h5">Checkbox</button><button data-kind="task" disabled>Als Aufgabe</button></header>
<main contenteditable="true" role="textbox" aria-label="Notiztext" aria-multiline="true"></main>
<script>
const editor=document.querySelector('main'), bar=document.querySelector('header');
const prefixes={H1:'# ',H2:'## ',H3:'### ',H4:'- ',H5:'- [ ] ',H6:'- [x] '};
const send=(type,value)=>window.ReactNativeWebView.postMessage(JSON.stringify({type,value}));
function render(value){
  editor.replaceChildren();
  if(!value)return;
  for(const line of value.split('\n')){
    const prefix=Object.entries(prefixes).find(([,p])=>line.startsWith(p) || (p==='- [x] ' && line.startsWith('- [X] ')));
    const check=/^- \[([ xX])\] /.exec(line);
    const block=document.createElement(check?(check[1]===' '?'h5':'h6'):prefix?prefix[0]:'div');
    const body=line.slice(check?6:prefix?prefix[1].length:0);
    for(const part of body.split(/(\*\*[^\n]+?\*\*)/g)){
      if(!part)continue;
      if(part.length>4 && part.startsWith('**') && part.endsWith('**')){
        const b=document.createElement('b'); b.textContent=part.slice(2,-2); block.append(b);
      } else block.append(document.createTextNode(part));
    }
    if(!block.hasChildNodes())block.append(document.createElement('br'));
    editor.append(block);
  }
}
function serialize(root){
  let result='', previousBlock=false, seen=false;
  for(const node of root.childNodes){
    const tag=node.nodeName;
    const block=['DIV','P','H1','H2','H3','H4','H5','H6'].includes(tag);
    if(seen && (block || previousBlock))result+='\n';
    if(node.nodeType===3)result+=node.textContent;
    else if(tag==='BR'){if(root.childNodes.length>1 && node.nextSibling)result+='\n';}
    else{
      const inside=serialize(node);
      const bold=tag==='B'||tag==='STRONG'||node.style?.fontWeight==='bold'||Number(node.style?.fontWeight)>=600;
      result+=(prefixes[tag]||'')+(bold&&inside?'**'+inside+'**':inside);
    }
    seen=true;previousBlock=block;
  }
  return result;
}
let saved, last='';
window.initialize=(text,ink,bg,muted)=>{
  for(const [k,v] of Object.entries({ink,bg,muted}))document.body.style.setProperty('--'+k,v);
  render(text);last=text;
};
function publish(){
  const value=serialize(editor);
  if(value===last)return;
  if(value.length>100000){render(last);send('limit',true);return;}
  last=value;send('change',value);
}
function currentBlock(){
  let node=getSelection().anchorNode;
  if(node?.nodeType===3)node=node.parentElement;
  return node?.closest('div,p,h1,h2,h3,h4,h5,h6');
}
document.addEventListener('selectionchange',()=>{
  const s=getSelection();if(!s.rangeCount||!editor.contains(s.anchorNode))return;
  saved=s.getRangeAt(0).cloneRange();
  const current=currentBlock()?.tagName;
  for(const b of bar.children){
    const kind=b.dataset.kind;
    if(kind==='task'){ b.disabled=!s.toString().trim() || !editor.contains(saved.commonAncestorContainer); continue; }
    b.setAttribute('aria-pressed',String(kind==='bold'?document.queryCommandState('bold'):kind.toUpperCase()===current||(kind==='h5'&&current==='H6')));
  }
});
bar.addEventListener('mousedown',e=>e.preventDefault());
bar.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  editor.focus();
  if(saved && editor.contains(saved.commonAncestorContainer)){
    const s=getSelection();s.removeAllRanges();s.addRange(saved);
  }
  const kind=button.dataset.kind, tag=currentBlock()?.tagName;
  if(kind==='task'){
    const selection=getSelection();
    if(selection.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer) && selection.toString().trim()) send('task',selection.toString().trim());
    return;
  }
  if(kind==='bold')document.execCommand('bold');
  else document.execCommand('formatBlock',false,tag===kind.toUpperCase()||(kind==='h5'&&tag==='H6')?'div':kind);
  publish();
});
editor.addEventListener('click',e=>{
  const line=e.target.closest('h5,h6');
  if(!line || e.clientX-line.getBoundingClientRect().left>25)return;
  const r=document.createRange();r.selectNodeContents(line);r.collapse(true);
  const s=getSelection();s.removeAllRanges();s.addRange(r);
  document.execCommand('formatBlock',false,line.tagName==='H5'?'h6':'h5');publish();
});
editor.addEventListener('beforeinput',e=>{
  const block=currentBlock(),tag=block?.tagName;
  if(e.inputType!=='insertParagraph'||!['H4','H5','H6'].includes(tag))return;
  e.preventDefault();
  if(block.textContent){document.execCommand('insertParagraph');document.execCommand('formatBlock',false,tag==='H6'?'h5':tag);}
  else document.execCommand('formatBlock',false,'div');
  publish();
});
editor.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));});
editor.addEventListener('drop',e=>e.preventDefault());
editor.addEventListener('input',e=>{if(!e.isComposing)publish();});
editor.addEventListener('compositionend',publish);
new ResizeObserver(()=>document.body.style.setProperty('--bar',bar.offsetHeight+'px')).observe(bar);
document.execCommand('defaultParagraphSeparator',false,'div');
send('ready',true);
</script></body></html>`;
