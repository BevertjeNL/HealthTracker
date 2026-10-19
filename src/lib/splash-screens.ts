// iOS launch images for the home-screen app. Keep DEVICES in sync with scripts/generate-splash.py.
type Device = { width: number; height: number; ratio: number };

export const SPLASH_DEVICES: Device[] = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [428, 926, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3],
  [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2],
  [820, 1180, 2], [834, 1194, 2], [834, 1112, 2], [810, 1080, 2], [1024, 1366, 2], [1032, 1376, 2], [744, 1133, 2], [768, 1024, 2],
].map(([width, height, ratio]) => ({ width, height, ratio }));

export function splashStartupImages() {
  return (["light", "dark"] as const).flatMap((scheme) =>
    SPLASH_DEVICES.map(({ width, height, ratio }) => ({
      url: `/splash/${scheme}-${width * ratio}x${height * ratio}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`,
    })),
  );
}
