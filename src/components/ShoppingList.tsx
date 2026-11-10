import React, { useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';

const products = [
  { name: 'Äpfel', image: require('../../assets/shopping/apple.jpg') },
  { name: 'Bananen', image: require('../../assets/shopping/bananas.jpg') },
  { name: 'Tomaten', image: require('../../assets/shopping/tomatoes.jpg') },
  { name: 'Brot', image: require('../../assets/shopping/bread.jpg') },
  { name: 'Milch', image: require('../../assets/shopping/milk.jpg') },
  { name: 'Eier', image: require('../../assets/shopping/eggs.jpg') },
  { name: 'Käse', image: require('../../assets/shopping/cheese.jpg') },
  { name: 'Nudeln', image: require('../../assets/shopping/pasta.jpg') },
  { name: 'Karotten', image: require('../../assets/shopping/carrots.jpg') },
];

const checklist = /^- \[([ xX])\] (.*)$/;
type Props = { body: string; change: (edit: (body: string) => string) => void };

export function ShoppingList({ body, change }: Props) {
  const theme = useTheme();
  const [custom, setCustom] = useState('');
  const lines = body.split('\n');
  const items = lines.flatMap((line, index) => {
    const match = checklist.exec(line);
    return match ? [{ index, name: match[2], checked: match[1] !== ' ' }] : [];
  });
  const add = (value: string) => {
    const name = value.trim();
    if (!name) return;
    change(current => {
      const rows = current.split('\n');
      const same = (line: string) => checklist.exec(line)?.[2].trim().toLocaleLowerCase('de') === name.toLocaleLowerCase('de');
      if (rows.some(line => same(line) && line.startsWith('- [ ]'))) return current;
      const existing = rows.findIndex(same);
      if (existing >= 0) {
        rows[existing] = '- [ ] ' + rows[existing].slice(6);
        return rows.join('\n');
      }
      return current + (current && !current.endsWith('\n') ? '\n' : '') + '- [ ] ' + name;
    });
  };
  return <View style={{ gap: 12 }}>
    {lines.some(line => line.trim() && !checklist.test(line)) &&
      <Text style={{color:theme.text}}>{lines.filter(line => !checklist.test(line)).join('\n').trim()}</Text>}
    {items.map(({index, name, checked}) =>
      <Pressable key={index} accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={name}
        onPress={() => change(current => {
          const rows = current.split('\n');
          if (!checklist.test(rows[index] ?? '')) return current;
          rows[index] = (rows[index].startsWith('- [ ]') ? '- [x] ' : '- [ ] ') + rows[index].slice(6);
          return rows.join('\n');
        })} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:12,backgroundColor:theme.cardBg,borderRadius:12}}>
        <Text style={{fontSize:23,color:theme.accent}}>{checked ? '☑' : '☐'}</Text>
        <Text style={{flex:1,color:checked ? theme.subtext : theme.text,textDecorationLine:checked ? 'line-through' : 'none'}}>{name}</Text>
      </Pressable>)}
    <Text accessibilityRole="header" style={{fontSize:19,fontWeight:'700',color:theme.text}}>Artikel hinzufügen</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:10}}>
      {products.map(({name,image}) => {
        const selected = items.some(item => !item.checked && item.name.trim().toLocaleLowerCase('de') === name.toLocaleLowerCase('de'));
        return <Pressable key={name} disabled={selected} accessibilityRole="button" accessibilityState={{disabled:selected}}
          accessibilityLabel={name + (selected ? ' auf der Liste' : ' hinzufügen')} onPress={() => add(name)}
          style={{width:'31.5%',backgroundColor:theme.cardBg,borderRadius:12,overflow:'hidden'}}>
          <Image accessible={false} source={image} style={{width:'100%',aspectRatio:1}}/>
          <Text style={{padding:7,fontWeight:'600',color:theme.text}}>{selected ? '✓ ' : '＋ '}{name}</Text>
        </Pressable>;
      })}
    </View>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
      <TextInput value={custom} onChangeText={setCustom} maxLength={200} placeholder="Eigener Artikel" accessibilityLabel="Eigener Artikel"
        placeholderTextColor={theme.subtext} returnKeyType="done" onSubmitEditing={() => {add(custom);setCustom('');}}
        style={{flex:1,color:theme.text,backgroundColor:theme.inputBg,borderRadius:12,padding:12}}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Eigenen Artikel hinzufügen" disabled={!custom.trim()}
        onPress={() => {add(custom);setCustom('');}} style={{padding:12}}>
        <Text style={{fontSize:22,color:custom.trim() ? theme.accent : theme.subtext}}>＋</Text>
      </Pressable>
    </View>
  </View>;
}
