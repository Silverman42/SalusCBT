// The command cheat sheet from Part 5 of the exam file (LB-8), shown beside the
// terminal. `inBrowser: false` rows (nmap, ss) are for Lab D on your own machine.

export interface CheatSheetRow {
  command: string;
  description: string;
  inBrowser: boolean;
}

export const CHEAT_SHEET: readonly CheatSheetRow[] = [
  {
    command: "grep -i -c -v -n -o",
    description: "search; ignore case, count, invert, line numbers, only the match",
    inBrowser: true,
  },
  {
    command: "awk '{print $N}'",
    description: "print field N; $NF is the last field, $(NF-3) the fourth from last",
    inBrowser: true,
  },
  {
    command: "cut -d ' ' -f N",
    description: "split on a delimiter and keep field N",
    inBrowser: true,
  },
  {
    command: "sort | uniq -c | sort -nr",
    description: "count repeats and list the most frequent first",
    inBrowser: true,
  },
  { command: "wc -l", description: "count lines", inBrowser: true },
  { command: "head / tail -n 20", description: "first or last 20 lines", inBrowser: true },
  {
    command: "sha256sum -c file",
    description: "check files against a list of published hashes",
    inBrowser: true,
  },
  {
    command: "ls -l / stat -c '%a %n'",
    description: "show permissions as letters / as octal",
    inBrowser: true,
  },
  {
    command: "chmod 640 file",
    description: "owner rw, group r, others none (r=4 w=2 x=1)",
    inBrowser: true,
  },
  {
    command: "nmap -sn / -sV / -p",
    description: "host discovery / service versions / specific ports",
    inBrowser: false,
  },
  { command: "ss -tlnp", description: "listening TCP ports and their processes", inBrowser: false },
];
