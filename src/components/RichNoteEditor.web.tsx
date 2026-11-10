import React, { useEffect, useRef } from 'react';
import { editorPage } from '../notes/editorPage';
import { useTheme } from '../hooks/useTheme';

const webPage = editorPage.replace('<script>', `<script>
window.ReactNativeWebView = {postMessage: data => parent.postMessage(data, '*')};
window.addEventListener('message', event => {
  if(event.source===parent && event.data?.type==='initialize') window.initialize(...event.data.args);
});`);

export function RichNoteEditor({ value, onChange, onTask, height = 300 }: { onTask:(selection:string)=>void; height?:number; value: string; onChange: (body: string) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const theme = useTheme();
  const change = useRef(onChange);
  change.current = onChange;
  const task = useRef(onTask);
  task.current = onTask;
  const args = [value, theme.text, theme.inputBg, theme.subtext];
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow || typeof event.data !== 'string') return;
      const message = JSON.parse(event.data);
      if (message.type === 'change' && typeof message.value === 'string' && message.value.length <= 100000) change.current(message.value);
      if (message.type === 'task' && typeof message.value === 'string') task.current(message.value);
      if (message.type === 'limit') window.alert('Die Notiz darf bis zu 100.000 Zeichen enthalten.');
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  return <iframe ref={ref} title="Notiztext bearbeiten" sandbox="allow-scripts" srcDoc={webPage}
    onLoad={() => ref.current?.contentWindow?.postMessage({type:'initialize',args}, '*')}
    style={{ width: '100%', height, border: 0, borderRadius: 12, background: theme.inputBg }} />;
}
