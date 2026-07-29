import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

type MaterialCommunityIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

type RaceDisciplineIconProps = {
  code: string | null | undefined;
  size?: number;
};

const ICON_BY_RACE_CODE: Record<string, MaterialCommunityIconName> = {
  greyhound: "dog-side",
  harness: "cart-variant",
  horse: "horse",
  ufc: "boxing-glove",
};

/**
 * Renders a compact sport/discipline icon for racing and UFC prediction rows.
 */
export function RaceDisciplineIcon({ code, size = 18 }: RaceDisciplineIconProps) {
  const normalizedCode = String(code ?? "").toLowerCase();
  const iconName = ICON_BY_RACE_CODE[normalizedCode] ?? "horseshoe";

  return (
    <View style={[styles.iconFrame, { height: size + 8, width: size + 8 }]}>
      <MaterialCommunityIcons
        color="#18202f"
        name={iconName}
        size={size}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconFrame: {
    alignItems: "center",
    backgroundColor: "#f2f4f7",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
  },
});
