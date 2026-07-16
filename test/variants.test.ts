import { describe, it, expect } from "vitest";
import {
  CONTROL_VARIANT,
  listVariantIds,
  pickVariant,
  resolveFollowUpSubject,
  templateForVariant,
  variantIdFromFilename,
} from "../src/mail/variants";
import { TEMPLATE_DIR } from "../src/mail/templates";

describe("variantIdFromFilename", () => {
  it("extracts the id from a variant filename for the right base", () => {
    expect(variantIdFromFilename("profs.initial.variant-b.md", "profs.initial.md")).toBe("b");
    expect(variantIdFromFilename("profs.initial.variant-short-ask.md", "profs.initial.md")).toBe("short-ask");
  });

  it("returns null for the base template, other bases, and junk", () => {
    expect(variantIdFromFilename("profs.initial.md", "profs.initial.md")).toBeNull();
    expect(variantIdFromFilename("sponsors.initial.variant-b.md", "profs.initial.md")).toBeNull();
    expect(variantIdFromFilename("profs.followup.variant-b.md", "profs.initial.md")).toBeNull();
    expect(variantIdFromFilename("profs.initial.variant-.md", "profs.initial.md")).toBeNull();
  });
});

describe("templateForVariant", () => {
  it("maps control to the base template and ids to their files", () => {
    expect(templateForVariant("profs.initial.md", CONTROL_VARIANT)).toBe("profs.initial.md");
    expect(templateForVariant("profs.initial.md", "b")).toBe("profs.initial.variant-b.md");
  });
});

describe("pickVariant", () => {
  it("always picks control when no variants exist", () => {
    expect(pickVariant([], () => 0.99)).toBe(CONTROL_VARIANT);
  });

  it("assigns uniformly across control + variants", () => {
    const ids = ["b", "c"];
    expect(pickVariant(ids, () => 0)).toBe(CONTROL_VARIANT);
    expect(pickVariant(ids, () => 0.34)).toBe("b");
    expect(pickVariant(ids, () => 0.99)).toBe("c");
  });
});

describe("resolveFollowUpSubject", () => {
  const loadOk = (_id: string) => "A different subject";
  const loadMissing = (_id: string): string => {
    throw new Error("no such template");
  };

  it("threads under the variant's initial subject when one was used", () => {
    expect(
      resolveFollowUpSubject({
        variant: "b",
        followUpSubject: "Re: control subject",
        loadInitialVariantSubject: loadOk,
      }),
    ).toBe("Re: A different subject");
  });

  it("keeps the follow-up template's subject for control/untracked sends", () => {
    for (const variant of [CONTROL_VARIANT, "", undefined]) {
      expect(
        resolveFollowUpSubject({
          variant,
          followUpSubject: "Re: control subject",
          loadInitialVariantSubject: loadOk,
        }),
      ).toBe("Re: control subject");
    }
  });

  it("falls back to the follow-up subject when the variant file is gone", () => {
    expect(
      resolveFollowUpSubject({
        variant: "b",
        followUpSubject: "Re: control subject",
        loadInitialVariantSubject: loadMissing,
      }),
    ).toBe("Re: control subject");
  });
});

describe("listVariantIds (against the real templates dir)", () => {
  it("discovers the shipped profs variant", () => {
    expect(listVariantIds(TEMPLATE_DIR, "profs.initial.md")).toContain("b");
  });

  it("finds none for categories without variant files", () => {
    expect(listVariantIds(TEMPLATE_DIR, "students.initial.md")).toEqual([]);
  });
});
