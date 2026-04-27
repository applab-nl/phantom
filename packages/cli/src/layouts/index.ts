import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface LayoutOptions {
  worktreePath: string;
  worktreeName: string;
  agentCommand?: string;
  agentArgs?: string[];
  noAgent?: boolean;
}

export async function getDefaultLayoutPath(): Promise<string> {
  return path.join(__dirname, "default.kdl");
}

export async function createTemporaryLayout(
  options: LayoutOptions,
): Promise<string> {
  const {
    worktreePath,
    worktreeName,
    agentCommand = "claude",
    agentArgs = [],
    noAgent = false,
  } = options;

  // Build the top pane content (agent or shell)
  let topPane: string;
  if (noAgent) {
    topPane = `        pane size="50%" focus=true {
            name "shell"
        }`;
  } else {
    const argsLine =
      agentArgs.length > 0
        ? `\n            args ${agentArgs.map((a) => `"${a}"`).join(" ")}`
        : "";
    topPane = `        pane size="50%" focus=true {
            name "agent"
            command "${agentCommand}"${argsLine}
        }`;
  }

  const layout = `// Phantom generated layout for ${worktreeName}
keybinds {
    normal {
        // Pass Shift+Enter through to terminal apps (e.g., Claude Code newline)
        bind "Shift Enter" { Write 27 91 49 51 59 50 117; }
    }
}

layout {
    cwd "${worktreePath}"

    pane split_direction="vertical" {
${topPane}
        pane size="50%" split_direction="horizontal" {
            pane {
                name "shell"
            }
            pane {
                name "shell2"
            }
        }
    }
}
`;

  const tempDir = os.tmpdir();
  const sanitizedName = worktreeName.replaceAll("/", "-");
  const tempFile = path.join(
    tempDir,
    `phantom-${sanitizedName}-${Date.now()}.kdl`,
  );
  await fs.writeFile(tempFile, layout, "utf-8");

  return tempFile;
}

export async function cleanupTemporaryLayout(
  layoutPath: string,
): Promise<void> {
  try {
    if (layoutPath.includes(os.tmpdir())) {
      await fs.unlink(layoutPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
