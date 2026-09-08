import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { updateDogLocation } from "@workspace/api-client-react";

const ENABLED_KEY = "snifftown.nearby.enabled";
const RADIUS_KEY = "snifftown.nearby.radius";
export const RADIUS_OPTIONS = [2, 5, 10, 25] as const;

export async function getNearbyPreferences() {
  const [enabled, radius] = await Promise.all([
    AsyncStorage.getItem(ENABLED_KEY),
    AsyncStorage.getItem(RADIUS_KEY),
  ]);
  const parsedRadius = Number(radius);
  return {
    enabled: enabled === "true",
    radius: RADIUS_OPTIONS.includes(parsedRadius as (typeof RADIUS_OPTIONS)[number]) ? parsedRadius : 2,
  };
}

export async function setNearbyRadius(radius: number) {
  await AsyncStorage.setItem(RADIUS_KEY, String(radius));
}

export async function enableNearbyDiscovery(requestPermission = true) {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && requestPermission) {
    permission = await Location.requestForegroundPermissionsAsync();
  }
  if (!permission.granted) {
    throw new Error("Location permission is needed to find dogs near you.");
  }
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  await updateDogLocation({
    enabled: true,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  });
  await AsyncStorage.setItem(ENABLED_KEY, "true");
}

export async function disableNearbyDiscovery() {
  await updateDogLocation({ enabled: false });
  await AsyncStorage.setItem(ENABLED_KEY, "false");
}