// The lab's command set (LLD §13.1). To add a command, write it as a
// CommandSpec in its own module here and list it below; the runner picks it
// up from DEFAULT_COMMANDS (see ../command.ts for the contract).

import type { CommandSpec } from "../command";
import { BUILTINS } from "./builtins";
import { sha256sum } from "./sha256sum";
import { awkCommand } from "./awk";
import { cutCommand } from "./cut";
import { grepCommand } from "./grep";
import { sedCommand } from "./sed";
import { sortCommand } from "./sort";
import { uniqCommand } from "./uniq";
import { wcCommand } from "./wc";

export const DEFAULT_COMMANDS: readonly CommandSpec[] = [
  ...BUILTINS,
  sha256sum,
  // T-703: ls, cat, head, tail, stat, chmod
  // T-704: grep, awk, cut, sort, uniq, wc, sed
  grepCommand,
  awkCommand,
  cutCommand,
  sortCommand,
  uniqCommand,
  wcCommand,
  sedCommand,
];
