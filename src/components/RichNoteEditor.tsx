import React, { useRef } from 'react';
import { Alert, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { editorPage } from '../notes/editorPage';
import { useTheme } from '../hooks/useTheme';

const source = { html: editorPage, baseUrl: 'about:blank' };

export function RichNoteEditor({ value, onChange, onTask, height = 300 }: { onTask:(selection:string)=>void; height?:number; value: string; onChange: (value: string) => void }) {
  const theme = useTheme();
  const ref = useRef<WebView<object>>(null);
  return <View style={{ height, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.inputBg }}>
    <WebView<object> ref={ref} source={source} originWhitelist={['about:blank']} keyboardDisplayRequiresUserAction={false}
      allowFileAccess={false} allowUniversalAccessFromFileURLs={false} domStorageEnabled={false}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
      onMessage={({ nativeEvent }) => {
        const message = JSON.parse(nativeEvent.data);
        if (message.type === 'ready') {
          const args = [value, theme.text, theme.inputBg, theme.subtext].map(arg => JSON.stringify(arg)).join(',');
          ref.current?.injectJavaScript('window.initialize(' + args + ');true;');
        } else if (message.type === 'change' && typeof message.value === 'string' && message.value.length <= 100000) {
          onChange(message.value);
        } else if (message.type === 'task' && typeof message.value === 'string') onTask(message.value);
        else if (message.type === 'limit') Alert.alert('Die Notiz darf bis zu 100.000 Zeichen enthalten.');
      }}
    />
  </View>;
}
