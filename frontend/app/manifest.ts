import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "School OS",
    short_name: "School OS",
    description: "Uganda Secondary School Management System",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#990000",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
