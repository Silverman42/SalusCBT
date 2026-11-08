// The lab's command set (LLD §13.1). To add a command, write it as a
// CommandSpec in its own module here and list it below; the runner picks it
// up from DEFAULT_COMMANDS (see ../command.ts for the contract).

import type { CommandSpec } from "../command";
import { BUILTINS } from "./builtins";
import { cat } from "./cat";
import { chmod } from "./chmod";
import { head, tail } from "./headTail";
import { ls } from "./ls";
import { sha256sum } from "./sha256sum";
import { stat } from "./stat";

export const DEFAULT_COMMANDS: readonly CommandSpec[] = [
  ...BUILTINS,
  sha256sum,
  // T-703: ls, cat, head, tail, stat, chmod
  ls,
  cat,
  head,
  tail,
  stat,
  chmod,
  // T-704: grep, awk, cut, sort, uniq, wc, sed
];
