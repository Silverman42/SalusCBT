import { describe, expect, it } from "vitest";
import type { PartKind } from "../../../shared/content";
import { norm, type PartAnswer } from "../../../convex/marking/normalise";

// Keys come from the Part 6 / retake solutions in content/source/secplus-701-mock-exam.md.
type Row = [got: PartAnswer, want: PartAnswer];
const cases: Record<PartKind, { accept: Row[]; reject: Row[] }> = {
  ip: {
    accept: [
      ["193.32.162.71", "193.32.162.71"],
      ["  193.32.162.71\n", "193.32.162.71"],
      ["91.240.118.29", "91.240.118.29"],
      ["193.032.162.071", "193.32.162.71"],
      ["0.0.0.0", "0.0.0.0"],
      ["255.255.255.255", "255.255.255.255"],
    ],
    reject: [
      ["193.32.162.7", "193.32.162.71"],
      ["193.32.162.71.", "193.32.162.71"],
      ["193.32.162", "193.32.162.71"],
      ["193.32.162.71.1", "193.32.162.71"],
      ["193.32.162.256", "193.32.162.256"],
      ["193. 32.162.71", "193.32.162.71"],
      ["193.32.162.71/32", "193.32.162.71"],
      ["193.32.162.71:22", "193.32.162.71"],
      ["193.32.162.0071", "193.32.162.71"],
      ["193,32,162,71", "193.32.162.71"],
      ["", "193.32.162.71"],
      [undefined, "193.32.162.71"],
      [["193.32.162.71"], "193.32.162.71"],
    ],
  },
  text: {
    accept: [
      ["backup", "backup"],
      ["  Backup ", "backup"],
      ["BACKUP", "backup"],
      ["svc_web", "svc_web"],
      ["SVC_Web", "svc_web"],
      ["quarantine   the\tfile", "Quarantine the file"],
    ],
    reject: [
      ["back up", "backup"],
      ["svc-web", "svc_web"],
      ["svcweb", "svc_web"],
      ["backup.", "backup"],
      ["root", "backup"],
      ["   ", "backup"],
      [null, "backup"],
    ],
  },
  directive: {
    accept: [
      ["PermitRootLogin", "PermitRootLogin"],
      ["permitrootlogin", "PermitRootLogin"],
      [" PERMITROOTLOGIN ", "PermitRootLogin"],
    ],
    reject: [
      ["PermitRootLogin no", "PermitRootLogin"],
      ["Permit Root Login", "PermitRootLogin"],
      ["PasswordAuthentication", "PermitRootLogin"],
      ["", "PermitRootLogin"],
    ],
  },
  path: {
    accept: [
      ["/etc/shadow", "/etc/shadow"],
      ["shadow", "/etc/shadow"],
      ["  /etc/shadow  ", "/etc/shadow"],
      [" shadow\n", "/etc/shadow"],
      ["ssh/sshd_config", "/etc/ssh/sshd_config"],
      ["/home/deploy/.ssh/id_rsa", "/home/deploy/.ssh/id_rsa"],
    ],
    reject: [
      ["/etc/Shadow", "/etc/shadow"],
      ["Shadow", "/etc/shadow"],
      ["etc/shadow", "/etc/shadow"],
      ["/shadow", "/etc/shadow"],
      ["/etc/shadow/", "/etc/shadow"],
      ["/etc/passwd", "/etc/shadow"],
      ["id_rsa", "/home/deploy/.ssh/id_rsa"],
      ["/etc/ shadow", "/etc/shadow"],
      ["", "/etc/shadow"],
      [undefined, "/etc/shadow"],
    ],
  },
  integer: {
    accept: [
      ["54", "54"],
      [" 56 ", "56"],
      ["054", "54"],
      ["1,234", "1234"],
      ["1,234,567", "1234567"],
      ["0", "0"],
      ["-0", "0"],
    ],
    reject: [
      ["55", "54"],
      ["5,4", "54"],
      ["12,34", "1234"],
      ["54.0", "54"],
      ["54.", "54"],
      ["5 4", "54"],
      ["+54", "54"],
      ["54 failures", "54"],
      ["fifty-four", "54"],
      ["", "54"],
      [null, "54"],
    ],
  },
  octal: {
    accept: [
      ["640", "640"],
      ["0640", "640"],
      [" 0640 ", "640"],
      ["600", "600"],
      ["0600", "600"],
      ["640", "0640"],
    ],
    reject: [
      ["644", "640"],
      ["00640", "640"],
      ["64", "640"],
      ["6400", "640"],
      ["680", "680"],
      ["rw-r-----", "640"],
      ["chmod 640", "640"],
      ["u=rw,g=r,o=", "640"],
      ["", "640"],
    ],
  },
  port: {
    accept: [
      ["23", "23"],
      [" 22 ", "22"],
      ["3306", "3306"],
      ["443", "443"],
      ["023", "23"],
      ["any", "Any"],
      ["ANY", "Any"],
      [" Any ", "Any"],
      ["65535", "65535"],
    ],
    reject: [
      ["22", "23"],
      ["0", "0"],
      ["65536", "65536"],
      ["443/tcp", "443"],
      ["port 23", "23"],
      ["-23", "23"],
      ["23.0", "23"],
      ["*", "Any"],
      ["all", "Any"],
      ["anything", "Any"],
      ["", "23"],
      [null, "Any"],
      [["23"], "23"],
    ],
  },
  portPair: {
    accept: [
      [
        ["110", "995"],
        ["110", "995"],
      ],
      [
        [" 143", "0993 "],
        ["143", "993"],
      ],
    ],
    reject: [
      [
        ["995", "110"],
        ["110", "995"],
      ],
      [
        ["110", "993"],
        ["110", "995"],
      ],
      [["110"], ["110", "995"]],
      [
        ["110", "995", "143"],
        ["110", "995"],
      ],
      [
        ["110", ""],
        ["110", "995"],
      ],
      ["110, 995", ["110", "995"]],
      [undefined, ["110", "995"]],
    ],
  },
  pick: {
    accept: [
      ["backup-tool-1.8.deb", "backup-tool-1.8.deb"],
      ["agent-installer-v4.2.exe", "agent-installer-v4.2.exe"],
    ],
    reject: [
      ["vpn-client-3.1.msi", "backup-tool-1.8.deb"],
      ["Backup-tool-1.8.deb", "backup-tool-1.8.deb"],
      [" backup-tool-1.8.deb", "backup-tool-1.8.deb"],
      ["", "backup-tool-1.8.deb"],
      [["backup-tool-1.8.deb"], "backup-tool-1.8.deb"],
    ],
  },
  mcq: {
    accept: [["B", "B"]],
    reject: [
      ["A", "B"],
      ["b", "B"],
      ["B ", "B"],
      ["", ""],
      [undefined, "B"],
      [["B"], "B"],
    ],
  },
};

describe("norm.equal", () => {
  for (const [kind, { accept, reject }] of Object.entries(cases) as [
    PartKind,
    (typeof cases)[PartKind],
  ][]) {
    describe(kind, () => {
      it.each(accept)("accepts %j for key %j", (got, want) => {
        expect(norm.equal(kind, got, want)).toBe(true);
      });
      it.each(reject)("rejects %j for key %j", (got, want) => {
        expect(norm.equal(kind, got, want)).toBe(false);
      });
    });
  }

  it("never matches a blank answer against a blank key", () => {
    for (const kind of Object.keys(cases) as PartKind[]) {
      const blank = kind === "portPair" ? [] : "";
      expect(norm.equal(kind, blank, blank)).toBe(false);
      expect(norm.equal(kind, undefined, undefined)).toBe(false);
    }
  });
});

describe("acceptance (T-201)", () => {
  it("0640 = 640", () => expect(norm.equal("octal", "0640", "640")).toBe(true));
  it("permitrootlogin = PermitRootLogin", () =>
    expect(norm.equal("directive", "permitrootlogin", "PermitRootLogin")).toBe(true));
  it("shadow = /etc/shadow", () => expect(norm.equal("path", "shadow", "/etc/shadow")).toBe(true));
  it("any = Any", () => expect(norm.equal("port", "any", "Any")).toBe(true));
});

describe("canonical forms", () => {
  it("ip", () => {
    expect(norm.ip(" 010.000.002.015 ")).toBe("10.0.2.15");
    expect(norm.ip("185.220.101.47.")).toBeNull();
  });
  it("text and directive", () => {
    expect(norm.text("  Accepted   Password ")).toBe("accepted password");
    expect(norm.directive("PermitRootLogin")).toBe("permitrootlogin");
    expect(norm.text(" ")).toBeNull();
  });
  it("path", () => {
    expect(norm.path(" /etc/shadow ")).toBe("/etc/shadow");
    expect(norm.path("")).toBeNull();
  });
  it("integer", () => {
    expect(norm.integer("1,234")).toBe("1234");
    expect(norm.integer("007")).toBe("7");
    expect(norm.integer("-12")).toBe("-12");
    expect(norm.integer("12345678901234567890")).toBe("12345678901234567890");
    expect(norm.integer("1.5")).toBeNull();
  });
  it("octal", () => {
    expect(norm.octal("0640")).toBe("640");
    expect(norm.octal("640")).toBe("640");
    expect(norm.octal("0000")).toBe("000");
    expect(norm.octal("800")).toBeNull();
  });
  it("port (as used by firewall marking)", () => {
    expect(norm.port("any")).toBe("Any");
    expect(norm.port("0443")).toBe("443");
    expect(norm.port(null)).toBeNull();
    expect(norm.port(undefined)).toBeNull();
    expect(norm.port("70000")).toBeNull();
  });
  it("portPair", () => {
    expect(norm.portPair(["110", "995"])).toEqual(["110", "995"]);
    expect(norm.portPair(["any", "22"])).toEqual(["Any", "22"]);
    expect(norm.portPair("110")).toBeNull();
    expect(norm.portPair(["110"])).toBeNull();
  });
  it("pick and mcq are exact ids", () => {
    expect(norm.pick("backup-tool-1.8.deb")).toBe("backup-tool-1.8.deb");
    expect(norm.mcq(" B")).toBe(" B");
    expect(norm.mcq("")).toBeNull();
  });
});
