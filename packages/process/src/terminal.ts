import { exec } from "node:child_process";
import { promisify } from "node:util";
import { err, ok, type Result } from "@phantompane/utils";
import { ProcessError, ProcessSpawnError } from "./errors.ts";

const execAsync = promisify(exec);

export type TerminalType =
  | "iterm"
  | "terminal"
  | "ghostty"
  | "wezterm"
  | "alacritty"
  | "gnome-terminal"
  | "konsole"
  | "wt";

export interface TerminalOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  terminalPreference?: string;
}

export interface TerminalSuccess {
  terminal: string;
}

/**
 * Detect the current terminal from environment variables
 */
export function detectTerminal(): TerminalType | undefined {
  const termProgram = process.env.TERM_PROGRAM;

  if (termProgram) {
    switch (termProgram) {
      case "iTerm.app":
        return "iterm";
      case "Apple_Terminal":
        return "terminal";
      case "ghostty":
        return "ghostty";
      case "WezTerm":
        return "wezterm";
      case "Alacritty":
        return "alacritty";
    }
  }

  // Check for Windows Terminal
  if (process.env.WT_SESSION) {
    return "wt";
  }

  // Check for GNOME Terminal
  if (process.env.GNOME_TERMINAL_SCREEN) {
    return "gnome-terminal";
  }

  // Check for Konsole
  if (process.env.KONSOLE_VERSION) {
    return "konsole";
  }

  return undefined;
}

/**
 * Parse terminal preference string into a TerminalType
 */
export function parseTerminalPreference(
  preference: string,
): TerminalType | undefined {
  const normalized = preference.toLowerCase().trim();

  const aliases: Record<string, TerminalType> = {
    iterm: "iterm",
    iterm2: "iterm",
    "iterm.app": "iterm",
    terminal: "terminal",
    "terminal.app": "terminal",
    apple_terminal: "terminal",
    ghostty: "ghostty",
    wezterm: "wezterm",
    alacritty: "alacritty",
    "gnome-terminal": "gnome-terminal",
    gnome: "gnome-terminal",
    konsole: "konsole",
    wt: "wt",
    "windows-terminal": "wt",
    windowsterminal: "wt",
  };

  return aliases[normalized];
}

/**
 * Result of terminal resolution - either a known type or a custom command
 */
export type ResolvedTerminal =
  | { type: "known"; terminal: TerminalType }
  | { type: "custom"; command: string };

/**
 * Get the terminal to use based on preference and environment
 */
export function resolveTerminal(
  preference?: string,
): Result<ResolvedTerminal, ProcessError> {
  if (preference) {
    const parsed = parseTerminalPreference(preference);
    if (parsed) {
      return ok({ type: "known", terminal: parsed });
    }
    return ok({ type: "custom", command: preference });
  }

  const detected = detectTerminal();
  if (detected) {
    return ok({ type: "known", terminal: detected });
  }

  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram) {
    return ok({ type: "custom", command: termProgram.toLowerCase() });
  }

  return err(
    new ProcessError(
      "Could not detect terminal. Set your terminal preference with: phantom preferences set terminal <name>\n" +
        "Known terminals: iterm, terminal, ghostty, wezterm, alacritty, gnome-terminal, konsole, wt\n" +
        "Or specify any terminal command directly (e.g., 'kitty', 'foot')",
    ),
  );
}

/**
 * Build environment string for shell commands
 */
function buildEnvExports(env?: Record<string, string>): string {
  if (!env || Object.keys(env).length === 0) {
    return "";
  }

  const exports = Object.entries(env)
    .map(([key, value]) => `export ${key}=${escapeShellArg(value)}`)
    .join("; ");

  return `${exports}; `;
}

/**
 * Escape a string for safe use in shell commands
 */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Build the full command string to execute
 */
function buildCommandString(options: TerminalOptions): string {
  const { command, args = [], cwd, env } = options;

  let cmd = "";
  cmd += buildEnvExports(env);

  if (cwd) {
    cmd += `cd ${escapeShellArg(cwd)} && `;
  }

  cmd += command;
  if (args.length > 0) {
    cmd += ` ${args.map(escapeShellArg).join(" ")}`;
  }

  return cmd;
}

/**
 * Spawn a new terminal window with the given command
 */
export async function spawnTerminalWindow(
  options: TerminalOptions,
): Promise<Result<TerminalSuccess, ProcessError>> {
  const terminalResult = resolveTerminal(options.terminalPreference);

  if (terminalResult.ok === false) {
    return terminalResult;
  }

  const resolved = terminalResult.value;
  const commandString = buildCommandString(options);

  try {
    let terminalName: string;

    if (resolved.type === "known") {
      terminalName = resolved.terminal;
      switch (resolved.terminal) {
        case "iterm":
          await spawnITerm(commandString);
          break;
        case "terminal":
          await spawnTerminalApp(commandString);
          break;
        case "ghostty":
          await spawnGhostty(options);
          break;
        case "wezterm":
          await spawnWezTerm(options);
          break;
        case "alacritty":
          await spawnAlacritty(options);
          break;
        case "gnome-terminal":
          await spawnGnomeTerminal(options);
          break;
        case "konsole":
          await spawnKonsole(options);
          break;
        case "wt":
          await spawnWindowsTerminal(options);
          break;
      }
    } else {
      terminalName = resolved.command;
      await spawnGenericTerminal(resolved.command, options);
    }

    return ok({ terminal: terminalName });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const terminalName =
      resolved.type === "known" ? resolved.terminal : resolved.command;
    return err(new ProcessSpawnError(terminalName, message));
  }
}

async function spawnITerm(commandString: string): Promise<void> {
  const script = `
    tell application "iTerm"
      activate
      create window with default profile
      tell current session of current window
        write text ${JSON.stringify(commandString)}
      end tell
    end tell
  `;

  await execAsync(`osascript -e ${escapeShellArg(script)}`);
}

async function spawnTerminalApp(commandString: string): Promise<void> {
  const script = `
    tell application "Terminal"
      activate
      do script ${JSON.stringify(commandString)}
    end tell
  `;

  await execAsync(`osascript -e ${escapeShellArg(script)}`);
}

async function spawnGhostty(options: TerminalOptions): Promise<void> {
  const { command, args = [], cwd, env } = options;

  let shellCommand = "";
  if (cwd) {
    shellCommand += `cd ${escapeShellArg(cwd)} && `;
  }
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      shellCommand += `export ${key}=${escapeShellArg(value)} && `;
    }
  }
  shellCommand += command;
  if (args.length > 0) {
    shellCommand += ` ${args.map(escapeShellArg).join(" ")}`;
  }

  await execAsync(
    `open -na Ghostty --args -e bash -c ${escapeShellArg(shellCommand)}`,
  );
}

async function spawnWezTerm(options: TerminalOptions): Promise<void> {
  const { command, args = [], cwd, env } = options;
  const cmdArgs = ["cli", "spawn", "--new-window"];

  if (cwd) {
    cmdArgs.push("--cwd", cwd);
  }

  cmdArgs.push("--", command, ...args);

  const envString = env
    ? `${Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")} `
    : "";

  await execAsync(`${envString}wezterm ${cmdArgs.join(" ")}`);
}

async function spawnAlacritty(options: TerminalOptions): Promise<void> {
  const { command, args = [], cwd, env } = options;
  const cmdArgs: string[] = [];

  if (cwd) {
    cmdArgs.push("--working-directory", cwd);
  }

  cmdArgs.push("-e", command, ...args);

  const envString = env
    ? `${Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")} `
    : "";

  await execAsync(`${envString}alacritty ${cmdArgs.join(" ")} &`);
}

async function spawnGnomeTerminal(options: TerminalOptions): Promise<void> {
  const { command, args = [], cwd, env } = options;
  const cmdArgs: string[] = [];

  if (cwd) {
    cmdArgs.push("--working-directory", cwd);
  }

  const fullCommand = [command, ...args].join(" ");
  cmdArgs.push("--", "bash", "-c", fullCommand);

  const envString = env
    ? `${Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")} `
    : "";

  await execAsync(`${envString}gnome-terminal ${cmdArgs.join(" ")}`);
}

async function spawnKonsole(options: TerminalOptions): Promise<void> {
  const { command, args = [], cwd, env } = options;
  const cmdArgs: string[] = [];

  if (cwd) {
    cmdArgs.push("--workdir", cwd);
  }

  const fullCommand = [command, ...args].join(" ");
  cmdArgs.push("-e", fullCommand);

  const envString = env
    ? `${Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")} `
    : "";

  await execAsync(`${envString}konsole ${cmdArgs.join(" ")} &`);
}

async function spawnWindowsTerminal(options: TerminalOptions): Promise<void> {
  const { command, args = [], cwd } = options;
  const cmdArgs = ["-w", "0", "nt"];

  if (cwd) {
    cmdArgs.push("-d", cwd);
  }

  cmdArgs.push(command, ...args);

  await execAsync(`wt.exe ${cmdArgs.join(" ")}`);
}

async function spawnGenericTerminal(
  terminalCmd: string,
  options: TerminalOptions,
): Promise<void> {
  const { command, args = [], cwd, env } = options;

  const fullCommand = [command, ...args].join(" ");
  const cwdPrefix = cwd ? `cd ${escapeShellArg(cwd)} && ` : "";
  const shellCommand = `${cwdPrefix}${fullCommand}`;

  const envString = env
    ? `${Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")} `
    : "";

  await execAsync(
    `${envString}${terminalCmd} -e bash -c ${escapeShellArg(shellCommand)} &`,
  );
}
