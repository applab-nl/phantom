import { ok, type Result } from "@aku11i/phantom-shared";
import { executeGitCommand } from "../executor.ts";

export async function branchExists(
  gitRoot: string,
  branchName: string,
): Promise<Result<boolean, Error>> {
  try {
    await executeGitCommand(
      ["show-ref", "--verify", `refs/heads/${branchName}`],
      { cwd: gitRoot },
    );
    return ok(true);
  } catch {
    // show-ref --verify exits non-zero when ref doesn't exist
    return ok(false);
  }
}
