import { useRouter, usePathname } from 'expo-router';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { View } from 'react-native';

const TABS = ['/', '/stats', '/calendar', '/settings'];

export function SwipeableScreen({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const currentIndex = TABS.indexOf(pathname);

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-25, 25])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (currentIndex < 0) return;
      if (e.translationX < -40 || e.velocityX < -600) {
        const next = Math.min(currentIndex + 1, TABS.length - 1);
        if (next !== currentIndex) router.navigate(TABS[next] as any);
      } else if (e.translationX > 40 || e.velocityX > 600) {
        const prev = Math.max(currentIndex - 1, 0);
        if (prev !== currentIndex) router.navigate(TABS[prev] as any);
      }
    });

  return (
    <GestureDetector gesture={swipe}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}
