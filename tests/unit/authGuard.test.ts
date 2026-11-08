import { describe, expect, it } from "vitest";
import { roleFromProfile, safeRedirectPath, staffGuardRedirect } from "../../app/lib/authGuard";

describe("staffGuardRedirect", () => {
  const path = "/tutor/classes/abc?tab=live";

  it("sends signed-out users to sign-in with a return path", () => {
    expect(staffGuardRedirect({ required: "tutor", signedIn: false, role: undefined, path })).toBe(
      "/sign-in?redirect=%2Ftutor%2Fclasses%2Fabc%3Ftab%3Dlive",
    );
  });

  it("sends users without an active profile to sign-in (FORBIDDEN)", () => {
    expect(staffGuardRedirect({ required: "tutor", signedIn: true, role: null, path })).toMatch(
      /^\/sign-in\?/,
    );
  });

  it("lets a signed-in user through while the role is unknown (until T-404)", () => {
    expect(
      staffGuardRedirect({ required: "admin", signedIn: true, role: undefined, path }),
    ).toBeNull();
  });

  it("applies roles: admin passes everything, a tutor is kept out of admin", () => {
    expect(
      staffGuardRedirect({ required: "tutor", signedIn: true, role: "tutor", path }),
    ).toBeNull();
    expect(
      staffGuardRedirect({ required: "tutor", signedIn: true, role: "admin", path }),
    ).toBeNull();
    expect(
      staffGuardRedirect({ required: "admin", signedIn: true, role: "admin", path }),
    ).toBeNull();
    expect(
      staffGuardRedirect({
        required: "admin",
        signedIn: true,
        role: "tutor",
        path: "/admin/audit",
      }),
    ).toBe("/tutor");
  });
});

describe("roleFromProfile", () => {
  it("grants a role only to an active profile", () => {
    expect(roleFromProfile({ role: "tutor", status: "active" })).toBe("tutor");
    expect(roleFromProfile({ role: "admin", status: "active" })).toBe("admin");
    expect(roleFromProfile({ role: "tutor", status: "removed" })).toBeNull();
    expect(roleFromProfile(null)).toBeNull();
  });
});

describe("safeRedirectPath", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirectPath("/tutor/classes/abc?tab=live")).toBe("/tutor/classes/abc?tab=live");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "tutor",
      42,
      undefined,
    ]) {
      expect(safeRedirectPath(bad)).toBe("/tutor");
    }
    expect(safeRedirectPath("//evil.example", "/admin/tutors")).toBe("/admin/tutors");
  });
});
