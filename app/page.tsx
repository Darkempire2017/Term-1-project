import WelcomeScreen from '@/components/WelcomeScreen';

// Launch screen: plays the rainy welcome, then opens the sign-in page.
export default function Home() {
  return <WelcomeScreen next="/login" />;
}
