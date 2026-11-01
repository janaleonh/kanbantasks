import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, lineLimit, opacity, privacySensitive, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetProps } from './snapshot';

const TodayTasks = (props: WidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const compact = environment.widgetFamily === 'systemSmall';
  const accessory = environment.widgetFamily?.startsWith('accessory');
  const accent = environment.colorScheme === 'dark' ? '#94DFFF' : '#006C9C';
  const subtle = { type: 'hierarchical', style: 'secondary' } as const;
  if (environment.widgetFamily === 'accessoryInline') {
    return <Text>{props.hasData ? `Heute: ${props.count} Aufgaben` : 'Kanban Tasks öffnen'}</Text>;
  }
  if (accessory) {
    return (
      <VStack alignment="leading" spacing={3} modifiers={[widgetURL('kanban-tasks:///?widget=today')]}>
        <Text modifiers={[font({ size: 15, weight: 'bold' })]}>Heute · {props.count}</Text>
        <Text modifiers={[font({ size: 12 }), lineLimit(2)]}>{props.hasData ? props.tasks[0]?.title || 'Alles geschafft.' : 'App zum Laden öffnen'}</Text>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={compact ? 5 : 8} modifiers={[
      frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
      containerBackground({ type: 'material', material: 'ultraThin' }, 'widget'),
      widgetURL('kanban-tasks:///?widget=today'),
      privacySensitive(),
      opacity(environment.isLuminanceReduced ? 0.75 : 1),
    ]}>
      <HStack>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(subtle)]}>HEUTE</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13 }), foregroundStyle(subtle)]}>◷</Text>
      </HStack>
      <HStack alignment="firstTextBaseline" spacing={8}>
        <Text modifiers={[font({ size: compact ? 38 : 32, weight: 'bold', design: 'rounded' })]}>{props.count}</Text>
        {!compact && <Text modifiers={[font({ size: 12 }), foregroundStyle(subtle)]}>Aufgaben im Fokus</Text>}
      </HStack>
      {props.tasks.slice(0, compact ? 1 : environment.widgetFamily === 'systemLarge' ? 6 : 2).map((task) => (
        <VStack key={task.id} alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 13, weight: 'medium' }), lineLimit(1)]}>{task.title}</Text>
          {!compact && <Text modifiers={[font({ size: 10 }), foregroundStyle(subtle), lineLimit(1)]}>{task.listTitle}</Text>}
        </VStack>
      ))}
      {!props.hasData && <Text modifiers={[font({ size: 12 }), foregroundStyle(subtle)]}>App zum Laden öffnen</Text>}
      {props.hasData && props.count === 0 && <Text modifiers={[font({ size: 13 }), foregroundStyle(subtle)]}>Alles geschafft. Zeit für dich.</Text>}
      <Spacer minLength={0} />
      {props.overdue > 0 && <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(environment.widgetRenderingMode === 'fullColor' ? accent : subtle)]}>{props.overdue} überfällig</Text>}
    </VStack>
  );
};

export default createWidget<WidgetProps>('TodayTasks', TodayTasks, { count: 0, overdue: 0, tasks: [], lists: [], hasData: false });
