import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, lineLimit, opacity, privacySensitive, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetProps } from './snapshot';

const TasksOverview = (props: WidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const compact = environment.widgetFamily === 'systemSmall';
  const subtle = { type: 'hierarchical', style: 'secondary' } as const;
  return (
    <VStack alignment="leading" spacing={8} modifiers={[
      frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
      containerBackground({ type: 'material', material: 'ultraThin' }, 'widget'),
      widgetURL('kanban-tasks:///?widget=overview'),
      privacySensitive(),
      opacity(environment.isLuminanceReduced ? 0.75 : 1),
    ]}>
      <HStack>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(subtle)]}>AUFGABEN</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13 }), foregroundStyle(subtle)]}>▤</Text>
      </HStack>
      <HStack alignment="firstTextBaseline" spacing={8}>
        <Text modifiers={[font({ size: 38, weight: 'bold', design: 'rounded' })]}>{props.count}</Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(subtle)]}>offen</Text>
      </HStack>
      {props.lists.slice(0, compact ? 2 : environment.widgetFamily === 'systemLarge' ? 5 : 3).map((list) => (
        <HStack key={list.id} spacing={10}>
          <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>{list.title}</Text>
          <Spacer minLength={4} />
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(subtle)]}>{list.count}</Text>
        </HStack>
      ))}
      {!props.hasData && <Text modifiers={[font({ size: 12 }), foregroundStyle(subtle)]}>App zum Laden öffnen</Text>}
      {props.hasData && props.lists.length === 0 && <Text modifiers={[font({ size: 12 }), foregroundStyle(subtle)]}>Dein Tag beginnt mit einer Idee.</Text>}
      <Spacer minLength={0} />
    </VStack>
  );
};

export default createWidget<WidgetProps>('TasksOverview', TasksOverview, { count: 0, overdue: 0, tasks: [], lists: [], hasData: false });
