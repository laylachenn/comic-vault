import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Layla's Comic Vault",
    short_name: "Comic Vault",
    start_url: "/",
    display: "standalone",
    background_color: "#F2F3F8",
    theme_color: "#FFD21F",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
