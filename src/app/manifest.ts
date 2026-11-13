import type { MetadataRoute } from "next";
import { basePath } from "@/lib/base-path";
export const dynamic = "force-static";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Everyday English — Personal Tutor",
    short_name: "Everyday English",
    lang: "fr",
    description: "Apprendre à communiquer en anglais, à votre rythme.",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    background_color: "#f7f7f2",
    theme_color: "#143f43",
    icons: [192, 512].map((size) => ({
      src: `${basePath}/assets/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
