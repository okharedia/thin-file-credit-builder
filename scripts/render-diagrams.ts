import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const diagramsDirectory = "docs/diagrams";

for (const fileName of readdirSync(diagramsDirectory).filter((name) => name.endsWith(".mmd")))
{
        const inputPath = join(diagramsDirectory, fileName);
        const outputPath = join(diagramsDirectory, fileName.replace(/\.mmd$/u, ".svg"));
        const result = spawnSync("npx", ["--yes", "@mermaid-js/mermaid-cli", "-i", inputPath, "-o", outputPath, "-t", "neutral", "-b", "transparent"], { stdio: "inherit" });

        if (result.status !== 0)
        {
                process.exit(result.status ?? 1);
        }
}
