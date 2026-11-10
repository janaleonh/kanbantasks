import { Redirect } from 'expo-router';

export default function DocumentsLink() {
  return <Redirect href={{ pathname: '/', params: { tab: 'documents' } }} />;
}