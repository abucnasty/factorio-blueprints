// Notices for the outcome of the git step, shared by import and render.

import type { GitResult } from "../git/commit-and-sync.ts";
import type { Host } from "./host.ts";

/** Notice for the outcome of the git step; shared with the render command. */
export function reportGit(host: Host, done: string, git: GitResult, extra = "", warn = extra !== ""): void {
  switch (git.status) {
    case "pushed":
      host.ui.notice(`${done}, committed and pushed (${git.commit}).${extra}`, warn ? "error" : "info");
      return;
    case "nothing-to-commit":
      host.ui.notice(`${done}. Git found nothing new to commit.${extra}`, warn ? "error" : "info");
      return;
    case "failed": {
      const lfs =
        git.step === "push" && /\blfs\b|batch response/i.test(git.message)
          ? " Render images are uploaded with Git LFS: run _tools/setup/setup-machine.sh on this computer, then sync again."
          : "";
      host.ui.notice(
        (git.committed
          ? `${done} and committed ${git.commit ?? ""} locally, but ${git.message}.${lfs} The Git plugin's timed sync will try again.`
          : `${done}, but ${git.message}. The files are saved; the Git plugin's timed sync will commit them.`) + extra,
        "error",
      );
      return;
    }
  }
}
