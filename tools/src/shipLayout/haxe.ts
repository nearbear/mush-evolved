// Minimal reader for Haxe's serialization format (haxe.Serializer), enough
// for the ship plan cached as a string in Mush/src/common/data/Map.hx.
// Supports the tags that string uses; anything else fails loudly.
//
// Values come back as plain JS: anonymous objects and class instances as
// objects (class instances get `__class`), arrays, IntHash as a
// number-keyed object, enum values as `{ __enum, index, args }`, and
// custom-serialized classes as `{ __custom, parts }`.

export interface HaxeEnum {
  __enum: string;
  index: number;
  args: unknown[];
}

export interface HaxeCustom {
  __custom: string;
  parts: unknown[];
}

export function unserialize(s: string): unknown {
  let p = 0;
  /** Strings seen so far, for `R<n>` references. */
  const strings: string[] = [];
  /** Objects, arrays, maps and enums seen so far, for `r<n>` references. */
  const objects: unknown[] = [];

  const fail = (message: string): never => {
    throw new Error(`haxe: ${message} at ${p}: ${JSON.stringify(s.slice(Math.max(0, p - 10), p + 20))}`);
  };
  const int = () => {
    const start = p;
    if (s[p] === "-") p++;
    while (s[p]! >= "0" && s[p]! <= "9") p++;
    if (p === start) fail("expected an integer");
    return Number(s.slice(start, p));
  };
  const expect = (c: string) => {
    if (s[p++] !== c) fail(`expected ${JSON.stringify(c)}`);
  };
  const string = (): string => {
    const tag = s[p++];
    if (tag === "R") return strings[int()] ?? fail("bad string reference");
    if (tag !== "y") fail("expected a string");
    const length = int();
    expect(":");
    const value = decodeURIComponent(s.slice(p, p + length));
    p += length;
    strings.push(value);
    return value;
  };
  /** Fields until `g`, as in anonymous objects and class instances. */
  const fields = (o: Record<string, unknown>) => {
    while (s[p] !== "g") {
      if (p >= s.length) fail("unterminated object");
      o[string()] = value();
    }
    p++;
  };

  const value = (): unknown => {
    const tag = s[p++];
    switch (tag) {
      case "n":
        return null;
      case "t":
        return true;
      case "f":
        return false;
      case "z":
        return 0;
      case "i":
        return int();
      case "y":
      case "R":
        p--;
        return string();
      case "r":
        return objects[int()] ?? fail("bad object reference");
      case "o": {
        const o: Record<string, unknown> = {};
        objects.push(o);
        fields(o);
        return o;
      }
      case "c": {
        const o: Record<string, unknown> = { __class: string() };
        objects.push(o);
        fields(o);
        return o;
      }
      case "a": {
        const a: unknown[] = [];
        objects.push(a);
        while (s[p] !== "h") {
          if (p >= s.length) fail("unterminated array");
          if (s[p] === "u") {
            p++;
            a.push(...Array<null>(int()).fill(null));
          } else a.push(value());
        }
        p++;
        return a;
      }
      case "q": {
        const o: Record<number, unknown> = {};
        objects.push(o);
        while (s[p] !== "h") {
          expect(":");
          o[int()] = value();
        }
        p++;
        return o;
      }
      case "j": {
        const e: HaxeEnum = { __enum: string(), index: 0, args: [] };
        expect(":");
        e.index = int();
        expect(":");
        const n = int();
        for (let i = 0; i < n; i++) e.args.push(value());
        objects.push(e);
        return e;
      }
      case "C": {
        const c: HaxeCustom = { __custom: string(), parts: [] };
        objects.push(c);
        while (s[p] !== "g") {
          if (p >= s.length) fail("unterminated custom value");
          c.parts.push(value());
        }
        p++;
        return c;
      }
      default:
        return fail(`unsupported tag ${JSON.stringify(tag)}`);
    }
  };

  const result = value();
  if (p !== s.length) fail("trailing data");
  return result;
}
