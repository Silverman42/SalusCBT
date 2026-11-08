// T-704: the lab's POSIX regex engine (BRE/ERE → NFA, Pike VM).

import { describe, expect, it } from "vitest";
import {
  compileRegex,
  newBudget,
  RegexLimitError,
  RegexSyntaxError,
  RegexUnsupportedError,
  type ParseOptions,
} from "../../app/lib/terminal/commands/regex";

const BRE: ParseOptions = { extended: false };
const ERE: ParseOptions = { extended: true };

function re(pattern: string, opts: ParseOptions = BRE, icase = false) {
  return compileRegex(pattern, { ...opts, icase, budget: newBudget() });
}

/** The leftmost-longest match text, or null. */
function first(pattern: string, text: string, opts: ParseOptions = BRE, icase = false) {
  const m = re(pattern, opts, icase).exec(text);
  return m ? text.slice(m.start, m.end) : null;
}

describe("basic regular expressions (GNU BRE)", () => {
  it("matches literals, ., *, anchors and brackets", () => {
    expect(first("Failed password", "x Failed password for")).toBe("Failed password");
    expect(first("a.c", "xabcx")).toBe("abc");
    expect(first("ab*", "abbbc")).toBe("abbb");
    expect(first("^Nov", "Nov  3")).toBe("Nov");
    expect(first("^Nov", " Nov")).toBeNull();
    expect(first("3$", "Nov  3")).toBe("3");
    expect(first("[0-9][0-9]*", "port 61210 ssh2")).toBe("61210");
    expect(first("[[:digit:]]\\{2,3\\}", "a1b234567")).toBe("234");
  });

  it("treats + ? ( ) { } | as literals, and \\+ \\? \\( \\) \\{ \\} \\| as operators", () => {
    expect(first("a+b", "aab a+b")).toBe("a+b");
    expect(first("a\\+b", "aab")).toBe("aab");
    expect(first("colou\\?r", "color")).toBe("color");
    expect(first("\\(ab\\)*c", "xababc")).toBe("ababc");
    expect(first("PermitRootLogin\\|PasswordAuthentication", "PasswordAuthentication yes")).toBe(
      "PasswordAuthentication",
    );
    expect(first("a|b", "a|b")).toBe("a|b");
    expect(first("a\\{2\\}", "aaaa")).toBe("aa");
    expect(first("(x)", "f(x)")).toBe("(x)");
  });

  it("makes * literal at the start and ^/$ literal in the middle", () => {
    expect(first("*a", "b*a")).toBe("*a");
    expect(first("^*a", "*a")).toBe("*a");
    expect(first("a^b", "a^b")).toBe("a^b");
    expect(first("a$b", "a$b")).toBe("a$b");
    expect(first("\\(^a\\)", "ab")).toBe("a");
  });

  it("supports GNU escapes \\< \\> \\b \\w \\s", () => {
    expect(first("\\<user\\>", "users user")).toBe("user");
    expect(re("\\<user\\>").exec("users user")!.start).toBe(6);
    expect(first("\\w\\+", "  ssh2: x")).toBe("ssh2");
    expect(first("\\s\\+", "a \t b")).toBe(" \t ");
    expect(first("\\bport\\b", "sport port")).toBe("port");
  });
});

describe("extended regular expressions (ERE)", () => {
  it("has | + ? () {} as operators", () => {
    expect(first("Failed|Accepted", "Accepted password", ERE)).toBe("Accepted");
    expect(first("(ab)+", "xababab", ERE)).toBe("ababab");
    expect(first("[0-9]{1,3}(\\.[0-9]{1,3}){3}", "from 185.220.101.47 port", ERE)).toBe(
      "185.220.101.47",
    );
    expect(first("a{,2}", "aaa", ERE)).toBe("aa");
    expect(first("a{", "a{", ERE)).toBe("a{");
  });

  it("finds the POSIX leftmost-longest match, not the first alternative", () => {
    expect(first("a|ab", "abc", ERE)).toBe("ab");
    expect(first("(a|ab)(c|bcd)", "abcd", ERE)).toBe("abcd");
    expect(first("x*", "aaa", ERE)).toBe("");
    // The earliest start wins first, then the longest match from there.
    expect(first("bc|abcd", "abcd", ERE)).toBe("abcd");
  });

  it("reports sub-match positions", () => {
    const m = re("(\\w+) (\\w+)", ERE).exec("hello world")!;
    expect(m.caps.slice(2, 6)).toEqual([0, 5, 6, 11]);
  });
});

describe("bracket expressions", () => {
  it("handles ] first, negation, ranges, classes and a trailing -", () => {
    expect(first("[]a]*", "]a]b")).toBe("]a]");
    expect(first("[^]a]", "]ab")).toBe("b");
    expect(first("[a-c-]*", "ab-cd")).toBe("ab-c");
    expect(first("[[:upper:]][[:lower:]]*", "sshd Nov")).toBe("Nov");
    expect(first("[[:space:]]", "a\tb")).toBe("\t");
    expect(first("[\\]", "a\\b")).toBe("\\");
  });

  it("is case-insensitive with icase", () => {
    expect(first("failed PASSWORD", "Failed password", BRE, true)).toBe("Failed password");
    expect(first("[A-C]+", "abc", ERE, true)).toBe("abc");
  });
});

describe("errors use glibc wording", () => {
  const err = (pattern: string, opts: ParseOptions = BRE) => {
    try {
      re(pattern, opts);
    } catch (e) {
      return e;
    }
    return undefined;
  };

  it.each([
    ["[a", BRE, "Unmatched [, [^, [:, [., or [="],
    ["\\(a", BRE, "Unmatched ( or \\("],
    ["a\\)", BRE, "Unmatched ) or \\)"],
    ["(a", ERE, "Unmatched ( or \\("],
    ["a)", ERE, "Unmatched ) or \\)"],
    ["a\\{1", BRE, "Unmatched \\{"],
    ["a\\{x\\}", BRE, "Invalid content of \\{\\}"],
    ["a{2,1}", ERE, "Invalid content of \\{\\}"],
    ["\\{1\\}", BRE, "Invalid preceding regular expression"],
    ["[z-a]", BRE, "Invalid range end"],
    ["[[:nope:]]", BRE, "Invalid character class name"],
    ["a\\", BRE, "Trailing backslash"],
  ] as const)("%s", (pattern, opts, message) => {
    const e = err(pattern, opts);
    expect(e).toBeInstanceOf(RegexSyntaxError);
    expect((e as Error).message).toBe(message);
  });

  it("refuses back-references (not available in this lab)", () => {
    expect(err("\\(a\\)\\1")).toBeInstanceOf(RegexUnsupportedError);
  });

  it("refuses programs that would be huge", () => {
    expect((err("(a{1000}){1000}", ERE) as Error).message).toBe("Regular expression too big");
    expect((err("a{40000}", ERE) as Error).message).toBe("Regular expression too big");
  });
});

describe("no catastrophic backtracking", () => {
  const long = "a".repeat(20_000);

  it.each(["(a*)*b", "(a|aa)*b", "(a+)+b", "(a|a)*b", "a*a*a*a*a*a*a*a*b", "(.*)*b"])(
    "%s on 20,000 a's finishes quickly",
    (pattern) => {
      const t0 = performance.now();
      expect(re(pattern, ERE).test(long)).toBe(false);
      expect(performance.now() - t0).toBeLessThan(2_000);
    },
  );

  it("stops with RegexLimitError when the step budget runs out", () => {
    const r = compileRegex("(a|a.*b)", { extended: true, budget: newBudget(100_000) });
    expect(() => {
      for (let pos = 0; pos < long.length;) pos = r.exec(long, pos)!.end;
    }).toThrow(RegexLimitError);
  });

  it("is linear for a literal search through binary-sized input", () => {
    const big = "x".repeat(2 * 1024 * 1024) + "injected-payload";
    const t0 = performance.now();
    expect(re("injected-payload").exec(big)!.start).toBe(2 * 1024 * 1024);
    expect(performance.now() - t0).toBeLessThan(2_000);
  });
});
