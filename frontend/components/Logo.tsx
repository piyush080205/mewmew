import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../constants/theme';

export default function Logo({ size = 27, color = colors.primary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx="20" cy="8" r="5" fill={color} />
      <Path
        d="M8 18 C8 30 32 30 32 18"
        stroke={color}
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}
