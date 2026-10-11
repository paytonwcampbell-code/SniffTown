import * as WebBrowser from "expo-web-browser";

export const PRIVACY_URL = "https://snifftown.com/privacy";
export const TERMS_URL = "https://snifftown.com/terms";

export function openPrivacyPolicy() {
  return WebBrowser.openBrowserAsync(PRIVACY_URL);
}

export function openTerms() {
  return WebBrowser.openBrowserAsync(TERMS_URL);
}
