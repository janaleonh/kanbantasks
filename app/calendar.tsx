import { Redirect } from 'expo-router';

export default function CalendarLink() {
  return <Redirect href={{ pathname: '/', params: { tab: 'calendar' } }} />;
}