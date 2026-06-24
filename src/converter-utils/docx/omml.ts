/**
 * Office Math Markup Language (OMML)
 * Adapted from https://github.com/xiilei/dwml/blob/master/dwml/omml.py
 */

import {
  ALN,
  ARR,
  BACKSLASH,
  BLANK,
  BRK,
  CHARS,
  CHR,
  CHR_BO,
  CHR_DEFAULT,
  D,
  D_DEFAULT,
  F,
  F_DEFAULT,
  FUNC,
  FUNC_PLACE,
  LIM_FUNC,
  LIM_TO,
  LIM_UPP,
  M,
  POS,
  POS_DEFAULT,
  RAD,
  RAD_DEFAULT,
  SUB,
  SUP,
  T,
} from "./latex-dict.js";

export const OMML_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/math";

const W_NS =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const DIRECT_TAGS = new Set([
  "box",
  "sSub",
  "sSup",
  "sSubSup",
  "num",
  "den",
  "deg",
  "e",
]);

function pyFormat(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.split(`{${key}}`).join(value);
  }
  return result.replaceAll("{{", "{").replaceAll("}}", "}");
}

function formatTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return pyFormat(template, values);
}

export function escapeLatex(strs: string): string {
  let last: string | null = null;
  const newChr: string[] = [];
  const normalized = strs.replace(/\\\\/g, "\\");
  for (const c of normalized) {
    if (CHARS.includes(c as (typeof CHARS)[number]) && last !== BACKSLASH) {
      newChr.push(BACKSLASH + c);
    } else {
      newChr.push(c);
    }
    last = c;
  }
  return newChr.join(BLANK);
}

function getVal(
  key: string | null | undefined,
  defaultValue?: string,
  store: Record<string, string> = CHR,
): string {
  if (key != null) {
    return store[key] ?? key;
  }
  return defaultValue ?? "";
}

function localTagName(elm: Element): string {
  const name = elm.localName ?? elm.tagName;
  const colon = name.indexOf(":");
  return colon >= 0 ? name.slice(colon + 1) : name;
}

function isOmmlElement(elm: Element): boolean {
  if (elm.namespaceURI === OMML_NS) return true;
  if (elm.namespaceURI === W_NS) return false;
  return localTagName(elm).length > 0;
}

function findOmmlText(elm: Element): string | null {
  for (const child of Array.from(elm.children)) {
    if (localTagName(child) === "t") {
      return child.textContent ?? "";
    }
  }
  return null;
}

type ChildResult = [string, unknown, Element];

abstract class Tag2Method {
  protected abstract tag2meth: Record<string, (elm: Element) => unknown>;

  callMethod(elm: Element, stag?: string): unknown {
    const tag = stag ?? localTagName(elm);
    const method = this.tag2meth[tag];
    if (method) {
      return method.call(this, elm);
    }
    return null;
  }

  *processChildrenList(
    elm: Element,
    include?: Set<string>,
  ): Generator<ChildResult> {
    for (const child of Array.from(elm.children)) {
      if (!isOmmlElement(child)) continue;
      const stag = localTagName(child);
      if (include && !include.has(stag)) continue;
      let result = this.callMethod(child, stag);
      if (result == null) {
        result = this.processUnknown(child, stag);
        if (result == null) continue;
      }
      yield [stag, result, child];
    }
  }

  processChildrenDict(
    elm: Element,
    include?: Set<string>,
  ): Record<string, unknown> {
    const latexChars: Record<string, unknown> = {};
    for (const [stag, t] of this.processChildrenList(elm, include)) {
      latexChars[stag] = t;
    }
    return latexChars;
  }

  processChildren(elm: Element, include?: Set<string>): string {
    return Array.from(this.processChildrenList(elm, include))
      .map(([, t]) => (t instanceof Tag2Method ? String(t) : String(t)))
      .join(BLANK);
  }

  processUnknown(_elm: Element, _stag: string): unknown {
    return null;
  }
}

class Pr extends Tag2Method {
  readonly text: string;
  private readonly inner: Record<string, string | undefined> = {};

  constructor(elm: Element) {
    super();
    this.text = this.processChildren(elm);
  }

  get chr(): string | undefined {
    return this.inner.chr;
  }
  get pos(): string | undefined {
    return this.inner.pos;
  }
  get begChr(): string | undefined {
    return this.inner.begChr;
  }
  get endChr(): string | undefined {
    return this.inner.endChr;
  }
  get type(): string | undefined {
    return this.inner.type;
  }

  toString(): string {
    return this.text;
  }

  private doBrk(): string {
    this.inner.brk = BRK;
    return BRK;
  }

  private doCommon(elm: Element): null {
    const stag = localTagName(elm);
    const valTags = ["chr", "pos", "begChr", "endChr", "type"];
    if (valTags.includes(stag)) {
      this.inner[stag] =
        elm.getAttributeNS(OMML_NS, "val") ??
        elm.getAttribute("m:val") ??
        elm.getAttribute("val") ??
        undefined;
    }
    return null;
  }

  protected tag2meth = {
    brk: this.doBrk.bind(this),
    chr: this.doCommon.bind(this),
    pos: this.doCommon.bind(this),
    begChr: this.doCommon.bind(this),
    endChr: this.doCommon.bind(this),
    type: this.doCommon.bind(this),
  };
}

export class OMath2Latex extends Tag2Method {
  private readonly _latex: string;
  private readonly _tDict = T;

  constructor(element: Element) {
    super();
    this._latex = this.processChildren(element);
  }

  get latex(): string {
    return this._latex;
  }

  toString(): string {
    return this.latex;
  }

  processUnknown(elm: Element, stag: string): unknown {
    if (DIRECT_TAGS.has(stag)) {
      return this.processChildren(elm);
    }
    if (stag.endsWith("Pr")) {
      return new Pr(elm);
    }
    return null;
  }

  private doAcc(elm: Element): string {
    const cDict = this.processChildrenDict(elm);
    const accPr = cDict.accPr as Pr;
    const latexS = getVal(accPr.chr, CHR_DEFAULT.ACC_VAL, CHR);
    return formatTemplate(latexS, { "0": String(cDict.e) });
  }

  private doBar(elm: Element): string {
    const cDict = this.processChildrenDict(elm);
    const pr = cDict.barPr as Pr;
    const latexS = getVal(pr.pos, POS_DEFAULT.BAR_VAL, POS);
    return pr.text + formatTemplate(latexS, { "0": String(cDict.e) });
  }

  private doD(elm: Element): string {
    const cDict = this.processChildrenDict(elm);
    const pr = cDict.dPr as Pr;
    const nullVal = D_DEFAULT.null;
    const sVal = getVal(pr.begChr, D_DEFAULT.left, T);
    const eVal = getVal(pr.endChr, D_DEFAULT.right, T);
    return (
      pr.text +
      formatTemplate(D, {
        left: !sVal ? nullVal : escapeLatex(sVal),
        text: String(cDict.e),
        right: !eVal ? nullVal : escapeLatex(eVal),
      })
    );
  }

  private doSub(elm: Element): string {
    return formatTemplate(SUB, { "0": this.processChildren(elm) });
  }

  private doSup(elm: Element): string {
    return formatTemplate(SUP, { "0": this.processChildren(elm) });
  }

  private doF(elm: Element): string {
    const cDict = this.processChildrenDict(elm);
    const pr = cDict.fPr as Pr | undefined;
    const prText = pr?.text ?? "";
    const latexS = getVal(pr?.type, F_DEFAULT, F);
    return (
      prText +
      formatTemplate(latexS, {
        num: String(cDict.num ?? ""),
        den: String(cDict.den ?? ""),
      })
    );
  }

  private doFunc(elm: Element): string {
    const cDict = this.processChildrenDict(elm);
    const funcName = String(cDict.fName ?? "");
    return funcName.replace(FUNC_PLACE, String(cDict.e ?? ""));
  }

  private doFname(elm: Element): string {
    const latexChars: string[] = [];
    for (const [stag, t] of this.processChildrenList(elm)) {
      if (stag === "r") {
        const text = String(t);
        if (FUNC[text]) {
          latexChars.push(FUNC[text]!);
        } else {
          throw new Error(`Not support func ${text}`);
        }
      } else {
        latexChars.push(String(t));
      }
    }
    const joined = latexChars.join(BLANK);
    return joined.includes(FUNC_PLACE) ? joined : joined + FUNC_PLACE;
  }

  private doGroupchr(elm: Element): string {
    const cDict = this.processChildrenDict(elm);
    const pr = cDict.groupChrPr as Pr;
    const latexS = getVal(pr.chr);
    return pr.text + formatTemplate(latexS, { "0": String(cDict.e) });
  }

  private doRad(elm: Element): string {
    const cDict = this.processChildrenDict(elm);
    const text = String(cDict.e ?? "");
    const degText = cDict.deg;
    if (degText) {
      return formatTemplate(RAD, {
        deg: String(degText),
        text,
      });
    }
    return formatTemplate(RAD_DEFAULT, { text });
  }

  private doEqarr(elm: Element): string {
    const parts = Array.from(
      this.processChildrenList(elm, new Set(["e"])),
    ).map(([, t]) => String(t));
    return formatTemplate(ARR, { text: BRK + parts.join(BRK) });
  }

  private doLimlow(elm: Element): string {
    const tDict = this.processChildrenDict(elm, new Set(["e", "lim"]));
    const latexS = LIM_FUNC[String(tDict.e ?? "")];
    if (!latexS) {
      throw new Error(`Not support lim ${String(tDict.e)}`);
    }
    return formatTemplate(latexS, { lim: String(tDict.lim ?? "") });
  }

  private doLimupp(elm: Element): string {
    const tDict = this.processChildrenDict(elm, new Set(["e", "lim"]));
    return formatTemplate(LIM_UPP, {
      lim: String(tDict.lim ?? ""),
      text: String(tDict.e ?? ""),
    });
  }

  private doLim(elm: Element): string {
    return this.processChildren(elm).replace(LIM_TO[0]!, LIM_TO[1]!);
  }

  private doM(elm: Element): string {
    const rows: string[] = [];
    for (const [stag, t] of this.processChildrenList(elm)) {
      if (stag === "mr") {
        rows.push(String(t));
      }
    }
    return formatTemplate(M, { text: BRK + rows.join(BRK) });
  }

  private doMr(elm: Element): string {
    return Array.from(this.processChildrenList(elm, new Set(["e"])))
      .map(([, t]) => String(t))
      .join(ALN);
  }

  private doNary(elm: Element): string {
    const res: string[] = [];
    let bo = "";
    for (const [stag, t] of this.processChildrenList(elm)) {
      if (stag === "naryPr") {
        bo = getVal((t as Pr).chr, undefined, CHR_BO);
      } else {
        res.push(String(t));
      }
    }
    return bo + BLANK + res.join(BLANK);
  }

  private doR(elm: Element): string {
    const text = findOmmlText(elm) ?? "";
    const mapped = Array.from(text)
      .map((s) => this._tDict[s] ?? s)
      .join(BLANK);
    return escapeLatex(mapped);
  }

  protected tag2meth = {
    acc: this.doAcc.bind(this),
    r: this.doR.bind(this),
    bar: this.doBar.bind(this),
    sub: this.doSub.bind(this),
    sup: this.doSup.bind(this),
    f: this.doF.bind(this),
    func: this.doFunc.bind(this),
    fName: this.doFname.bind(this),
    groupChr: this.doGroupchr.bind(this),
    d: this.doD.bind(this),
    rad: this.doRad.bind(this),
    eqArr: this.doEqarr.bind(this),
    limLow: this.doLimlow.bind(this),
    limUpp: this.doLimupp.bind(this),
    lim: this.doLim.bind(this),
    m: this.doM.bind(this),
    mr: this.doMr.bind(this),
    nary: this.doNary.bind(this),
  };
}

export function oMathElementToLatex(element: Element): string {
  return new OMath2Latex(element).latex;
}
