import * as Haptics from 'expo-haptics';
import { TouchableOpacity, GestureResponderEvent } from 'react-native';

// Replaced @react-navigation imports — incompatible with expo-router SDK 56+
interface HapticTabProps {
  onPress?: (e: GestureResponderEvent) => void;
  onPressIn?: (e: GestureResponderEvent) => void;
  children?: React.ReactNode;
  style?: any;
  accessibilityRole?: any;
  accessibilityLabel?: string;
  accessibilityState?: any;
  testID?: string;
}

export function HapticTab(props: HapticTabProps) {
  return (
    <TouchableOpacity
      {...props}
      activeOpacity={0.7}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
