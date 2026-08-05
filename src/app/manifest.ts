import type { MetadataRoute } from "next";

// Minimal web manifest — houses the 512 install icon (the approved brand asset). The
// favicon (icon.svg + favicon.ico), the apple touch icon (apple-icon.png) and the OG
// cover are handled by the app-directory file conventions; this only carries the PWA icon
// and the brand colours. No new dependency.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "forma",
    short_name: "forma",
    description: "Wedding atelier software",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F2EB",
    theme_color: "#111111",
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
