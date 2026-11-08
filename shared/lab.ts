// Lab instructions for the build-lab.sh download (LB-9), written by hand from Part 5
// of content/source/secplus-701-mock-exam.md. Answers (Part 6, and the Lab C pass
// values) are deliberately left out: this file is shipped to the browser.

export interface LabStep {
  id: string;
  title: string;
  /** Plain-text paragraphs. Inline `code` is written with backticks. */
  intro: string[];
  /** Numbered questions the student answers. */
  questions?: string[];
  /** Shell commands, shown in a mono block. */
  commands?: string;
  outro?: string[];
}

export const LAB_SCRIPT_URL = "/downloads/build-lab.sh";
export const LAB_INSTRUCTIONS_URL = "/downloads/lab-instructions.md";

export const LAB_SCAN_WARNING =
  "Scan only machines you own or have written permission to test. Scanning other people's systems without permission is illegal.";

export const LAB_WHERE_TO_RUN =
  "Run it on Ubuntu or Kali Linux, a Linux VM, or WSL on Windows (`wsl --install` in PowerShell, then open Ubuntu). macOS works for most tasks, but use `stat -f '%Lp %N'` instead of `stat -c` and replace `shuf -n1` with `ls | sort -R | head -n1`.";

export const LAB_STEPS: LabStep[] = [
  {
    id: "build",
    title: "Step 1. Build the lab",
    intro: [
      "Download `build-lab.sh`, then run it. It creates practice files in a `secplus-lab` folder in your home directory and does not touch your system files.",
    ],
    commands: "bash build-lab.sh",
    outro: [
      "Run it again any time to reset the lab: it deletes and rebuilds `~/secplus-lab`. Lab B picks a new tampered file on every build.",
    ],
  },
  {
    id: "lab-a",
    title: "Step 2. Lab A: find the brute force",
    intro: ["Work in `~/secplus-lab/log` and answer:"],
    questions: [
      "Which IP made the brute-force attempts?",
      "Which account did it log in to?",
      "How many `Failed password` entries came from that IP?",
    ],
    commands: [
      "cd ~/secplus-lab/log",
      "head auth.log",
      "grep -c 'Failed password' auth.log",
      "grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr",
      "grep 'Accepted' auth.log",
      "grep 'Invalid user' auth.log | awk '{print $8}' | sort | uniq -c | sort -nr",
    ].join("\n"),
    outro: [
      "Ask yourself why `grep '<attacker IP>' auth.log | wc -l` gives a bigger number than your answer to question 3.",
    ],
  },
  {
    id: "lab-b",
    title: "Step 3. Lab B: verify the installers",
    intro: [
      "Compare the installers in `~/secplus-lab/downloads` with the vendor's published hashes.",
    ],
    commands: [
      "cd ~/secplus-lab/downloads",
      "cat vendor_hashes.txt",
      "sha256sum *.exe *.msi *.deb",
      "sha256sum -c vendor_hashes.txt",
      "cat ~/secplus-lab/.answer-lab-b    # check your answer",
    ].join("\n"),
    outro: [
      "Then answer: what would you do with the failed file, and what would prove who created the file, not just that it is unchanged?",
    ],
  },
  {
    id: "lab-c",
    title: "Step 4. Lab C: find and fix permissions",
    intro: ["This time you actually fix things. Work in `~/secplus-lab`."],
    commands: [
      "cd ~/secplus-lab",
      "ls -l etc",
      "ls -la home/deploy/.ssh",
      "grep -n 'PermitRootLogin\\|PasswordAuthentication' etc/ssh/sshd_config",
      "",
      "# Your fixes (work out the right values yourself):",
      "chmod ??? etc/shadow",
      "chmod ??? home/deploy/.ssh/id_rsa",
      "sed -i 's/^PermitRootLogin yes/PermitRootLogin ??/' etc/ssh/sshd_config",
      "",
      "# Verify",
      "stat -c '%a %n' etc/shadow home/deploy/.ssh/id_rsa",
      "grep '^PermitRootLogin' etc/ssh/sshd_config",
    ].join("\n"),
  },
  {
    id: "lab-d",
    title: "Step 5. Lab D: scan your own machine",
    intro: [
      "Install nmap (`sudo apt install nmap`) and scan only machines you own. Scanning other people's systems without permission is illegal.",
    ],
    commands: [
      "nmap localhost",
      "nmap -sV localhost",
      "ss -tlnp        # which processes are listening, compare with nmap",
    ].join("\n"),
    outro: [
      "For each open port, write the service name, whether it is cleartext or encrypted, and its secure replacement if one exists.",
    ],
  },
];

/** The same instructions as a Markdown file for the download route. */
export function labInstructionsMarkdown(): string {
  const out: string[] = [
    "# Salus practice lab: build-lab.sh instructions",
    "",
    `> **Warning:** ${LAB_SCAN_WARNING}`,
    "",
    LAB_WHERE_TO_RUN,
    "",
  ];
  for (const step of LAB_STEPS) {
    out.push(`## ${step.title}`, "", ...step.intro.flatMap((p) => [p, ""]));
    if (step.questions) {
      out.push(...step.questions.map((q, i) => `${i + 1}. ${q}`), "");
    }
    if (step.commands) out.push("```bash", step.commands, "```", "");
    if (step.outro) out.push(...step.outro.flatMap((p) => [p, ""]));
  }
  return out.join("\n");
}
