import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Script } from "node:vm";

const root = process.cwd();
const sourceDirectories = ["src", "popup"];

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const javascriptFiles = sourceDirectories
  .flatMap((directory) => walk(join(root, directory)))
  .filter((file) => file.endsWith(".js"));

for (const file of javascriptFiles) {
  new Script(readFileSync(file, "utf8"), { filename: file });
  console.log(`syntax ok: ${relative(root, file)}`);
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must use Manifest V3");
}
if (!manifest.content_scripts?.some((entry) => entry.world === "MAIN")) {
  throw new Error("manifest.json must declare the main-world provider");
}
console.log("manifest ok");
