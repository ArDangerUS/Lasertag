import fs from "fs";
import path from "path";

// Server-side check for a bundled photo in /public. Returns the public URL
// ("/addons/pinata.jpg") or "" when no file exists. Used so the catalog can
// group tiles by photo presence without the client probing files.
export function publicFilePhoto(dir: "activities" | "addons", key: string): string {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const rel = `/${dir}/${key}.${ext}`;
    try {
      if (fs.existsSync(path.join(process.cwd(), "public", rel))) return rel;
    } catch {
      // fs unavailable — treat as missing
    }
  }
  return "";
}
