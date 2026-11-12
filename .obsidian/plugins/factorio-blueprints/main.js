/* factorio-blueprints Obsidian plugin. Generated from _tools/plugin by `npm run build`; do not edit. */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FactorioBlueprintsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i2 = 0; i2 < 31; ++i2) {
    b[i2] = start += 1 << eb[i2 - 1];
  }
  var r = new i32(b[30]);
  for (var i2 = 1; i2 < 30; ++i2) {
    for (var j = b[i2]; j < b[i2 + 1]; ++j) {
      r[j] = j - b[i2] << 5 | i2;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i2 = 0;
  var l = new u16(mb);
  for (; i2 < s; ++i2) {
    if (cd[i2])
      ++l[cd[i2] - 1];
  }
  var le = new u16(mb);
  for (i2 = 1; i2 < mb; ++i2) {
    le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        var sv = i2 << 4 | cd[i2];
        var r_1 = mb - cd[i2];
        var v = le[cd[i2] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i2 = 1; i2 < a.length; ++i2) {
    if (a[i2] > m)
      m = a[i2];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i2 = 0; i2 < hcLen; ++i2) {
          clt[clim[i2]] = bits(dat, pos + i2 * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i2 = 0; i2 < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i2++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i2 - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i2++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i2 = sym - 257, b = fleb[i2];
          add = bits(dat, pos, (1 << b) - 1) + fl[i2];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i2 = 0; i2 < d.length; ++i2) {
    if (d[i2])
      t.push({ s: i2, f: d[i2] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i22 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i22].f ? i0++ : i22++];
    r = t[i0 != i1 && t[i0].f < t[i22].f ? i0++ : i22++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i2 = 1; i2 < s; ++i2) {
    if (t2[i2].s > maxSym)
      maxSym = t2[i2].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i2 = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i2 < s; ++i2) {
      var i2_1 = t2[i2].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i2].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i2;
    }
    for (; i2 >= 0 && dt; --i2) {
      var i2_3 = t2[i2].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i2 = 1; i2 <= s; ++i2) {
    if (c[i2] == cln && i2 != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i2];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i2 = 0; i2 < cl.length; ++i2)
    l += cf[i2] * cl[i2];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i2 = 0; i2 < s; ++i2)
    out[o + i2 + 4] = dat[i2];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i2 = 0; i2 < lclt.length; ++i2)
    ++lcfreq[lclt[i2] & 31];
  for (var i2 = 0; i2 < lcdt.length; ++i2)
    ++lcfreq[lcdt[i2] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i2 = 0; i2 < nlcc; ++i2)
      wbits(out, p + 3 * i2, lct[clim[i2]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i2 = 0; i2 < clct.length; ++i2) {
        var len = clct[i2] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i2] >> 5 & 127), p += clct[i2] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i2 = 0; i2 < li; ++i2) {
    var sym = syms[i2];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i3) {
      return (dat[i3] ^ dat[i3 + 1] << bs1_1 ^ dat[i3 + 2] << bs2_1) & msk_1;
    };
    var syms = new i32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i2 = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i2 + 2 < s; ++i2) {
      var hv = hsh(i2);
      var imod = i2 & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i2) {
        var rem = s - i2;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i2 - bs, pos);
          li = lc_1 = eb = 0, bs = i2;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i2 - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i2);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i2 + l] == dat[i2 + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i2 + nl] == dat[i2 + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i2 - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i2 + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i2];
          ++lf[dat[i2]];
        }
      }
    }
    for (i2 = Math.max(i2, wi); i2 < s; ++i2) {
      syms[li++] = dat[i2];
      ++lf[dat[i2]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i2 - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i2, st.w = wi;
    }
  } else {
    for (var i2 = st.w || 0; i2 < s + lst; i2 += 65535) {
      var e = i2 + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i2, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var adler = function() {
  var a = 1, b = 0;
  return {
    p: function(d) {
      var n = a, m = b;
      var l = d.length | 0;
      for (var i2 = 0; i2 != l; ) {
        var e = Math.min(i2 + 2655, l);
        for (; i2 < e; ++i2)
          m += n += d[i2];
        n = (n & 65535) + 15 * (n >> 16), m = (m & 65535) + 15 * (m >> 16);
      }
      a = n, b = m;
    },
    d: function() {
      a %= 65521, b %= 65521;
      return (a & 255) << 24 | (a & 65280) << 8 | (b & 255) << 8 | b >> 8;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var wbytes = function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
};
var zlh = function(c, o) {
  var lv = o.level, fl2 = lv == 0 ? 0 : lv < 6 ? 1 : lv == 9 ? 3 : 2;
  c[0] = 120, c[1] = fl2 << 6 | (o.dictionary && 32);
  c[1] |= 31 - (c[0] << 8 | c[1]) % 31;
  if (o.dictionary) {
    var h = adler();
    h.p(o.dictionary);
    wbytes(c, 2, h.d());
  }
};
var zls = function(d, dict) {
  if ((d[0] & 15) != 8 || d[0] >> 4 > 7 || (d[0] << 8 | d[1]) % 31)
    err(6, "invalid zlib data");
  if ((d[1] >> 5 & 1) == +!dict)
    err(6, "invalid zlib data: " + (d[1] & 32 ? "need" : "unexpected") + " dictionary");
  return (d[1] >> 3 & 4) + 2;
};
function zlibSync(data, opts) {
  if (!opts)
    opts = {};
  var a = adler();
  a.p(data);
  var d = dopt(data, opts, opts.dictionary ? 6 : 2, 4);
  return zlh(d, opts), wbytes(d, d.length - 4, a.d()), d;
}
function unzlibSync(data, opts) {
  return inflt(data.subarray(zls(data, opts && opts.dictionary), -4), { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}

// src/core/codec.ts
var SUPPORTED_VERSION_BYTE = "0";
var BlueprintStringError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "BlueprintStringError";
    this.code = code;
  }
};
var SHAPE = /^[0-9][A-Za-z0-9+/]+={0,2}$/;
function decodeBlueprintString(input) {
  const s = input.replace(/\s+/g, "");
  if (s.length === 0) {
    throw new BlueprintStringError("empty", "There is no text to decode.");
  }
  if (!SHAPE.test(s) || s.length < 8) {
    throw new BlueprintStringError(
      "not-a-blueprint-string",
      "The text is not a Factorio blueprint string."
    );
  }
  if (s[0] !== SUPPORTED_VERSION_BYTE) {
    throw new BlueprintStringError(
      "unsupported-version",
      `Unsupported blueprint string version "${s[0]}" (only "${SUPPORTED_VERSION_BYTE}" is supported).`
    );
  }
  let compressed;
  try {
    compressed = base64ToBytes(s.slice(1));
  } catch {
    throw new BlueprintStringError("corrupt", "The blueprint string is not valid base64.");
  }
  let raw;
  try {
    raw = unzlibSync(compressed);
  } catch (e) {
    throw new BlueprintStringError(
      "corrupt",
      `The blueprint string data is corrupt (zlib: ${errorText(e)}).`
    );
  }
  if (compressed.length < 6 || readUint32BE(compressed, compressed.length - 4) !== adler32(raw)) {
    throw new BlueprintStringError("corrupt", "The blueprint string data is corrupt (checksum mismatch).");
  }
  let json;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new BlueprintStringError("corrupt", "The blueprint string data is not valid UTF-8.");
  }
  let value;
  try {
    value = JSON.parse(json);
  } catch (e) {
    throw new BlueprintStringError("corrupt", `The blueprint string data is not valid JSON (${errorText(e)}).`);
  }
  return { value, json };
}
function encodeBlueprintString(value) {
  const json = JSON.stringify(value);
  if (json === void 0) throw new TypeError("Value cannot be encoded as JSON.");
  const compressed = zlibSync(new TextEncoder().encode(json), { level: 9 });
  return SUPPORTED_VERSION_BYTE + bytesToBase64(compressed);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i2 = 0; i2 < bin.length; i2++) out[i2] = bin.charCodeAt(i2);
  return out;
}
function bytesToBase64(bytes) {
  const CHUNK = 32768;
  const parts = [];
  for (let i2 = 0; i2 < bytes.length; i2 += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i2, i2 + CHUNK)));
  }
  return btoa(parts.join(""));
}
function readUint32BE(b, at) {
  return (b[at] << 24 | b[at + 1] << 16 | b[at + 2] << 8 | b[at + 3]) >>> 0;
}
function adler32(data) {
  let a = 1;
  let b = 0;
  const NMAX = 5552;
  for (let i2 = 0; i2 < data.length; ) {
    const end = Math.min(i2 + NMAX, data.length);
    for (; i2 < end; i2++) {
      a += data[i2];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return (b << 16 | a) >>> 0;
}
function errorText(e) {
  return e instanceof Error ? e.message : String(e);
}

// src/core/canonical-json.ts
var COMPACT_ROW_KEYS = /* @__PURE__ */ new Set([
  "entities",
  "tiles",
  "wires",
  "stock_connections",
  "schedules"
]);
var INDENT = "  ";
function writeCanonicalJson(value) {
  return writeValue(value, "", false) + "\n";
}
function readCanonicalJson(text) {
  return JSON.parse(text.charCodeAt(0) === 65279 ? text.slice(1) : text);
}
function writeCompactSortedJson(value) {
  if (Array.isArray(value)) {
    return "[" + value.map((v) => writeCompactSortedJson(arrayItem(v))).join(",") + "]";
  }
  if (isPlainObject(value)) {
    const parts = sortedKeys(value).filter((k) => value[k] !== void 0).map((k) => JSON.stringify(k) + ":" + writeCompactSortedJson(value[k]));
    return "{" + parts.join(",") + "}";
  }
  return scalar(value);
}
function writeValue(value, indent, compactItems) {
  const inner = indent + INDENT;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map(
      (v) => compactItems ? writeCompactSortedJson(arrayItem(v)) : writeValue(arrayItem(v), inner, false)
    );
    return "[\n" + items.map((s) => inner + s).join(",\n") + "\n" + indent + "]";
  }
  if (isPlainObject(value)) {
    const keys = sortedKeys(value).filter((k) => value[k] !== void 0);
    if (keys.length === 0) return "{}";
    const lines2 = keys.map(
      (k) => inner + JSON.stringify(k) + ": " + writeValue(value[k], inner, COMPACT_ROW_KEYS.has(k))
    );
    return "{\n" + lines2.join(",\n") + "\n" + indent + "}";
  }
  return scalar(value);
}
function arrayItem(v) {
  return v === void 0 || typeof v === "function" ? null : v;
}
function scalar(value) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(`Cannot write non-finite number ${value} as JSON.`);
  }
  const s = JSON.stringify(value);
  if (s === void 0) throw new TypeError(`Cannot write ${typeof value} as JSON.`);
  return s;
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function sortedKeys(obj) {
  return Object.keys(obj).sort(compareCodePoints);
}
function compareCodePoints(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i2 = 0; i2 < n; i2++) {
    const x2 = a.charCodeAt(i2);
    const y = b.charCodeAt(i2);
    if (x2 !== y) return codePointOrder(x2) - codePointOrder(y);
  }
  return a.length - b.length;
}
function codePointOrder(unit) {
  if (unit >= 57344) return unit - 2048;
  if (unit >= 55296) return unit + 8192;
  return unit;
}

// src/core/numbers.ts
function jsonNumberLiterals(json) {
  const out = [];
  const re = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for (let m = re.exec(json); m !== null; m = re.exec(json)) {
    if (m[0][0] !== '"') out.push(m[0]);
  }
  return out;
}
function findLossyNumbers(json) {
  return jsonNumberLiterals(json).filter((lit) => {
    const n = Number(lit);
    if (!Number.isFinite(n)) return true;
    if (n === 0) return normalizeDecimal(lit) !== "0";
    if (/^-?\d+$/.test(lit)) return BigInt(lit) !== BigInt(n);
    return false;
  });
}
function normalizeDecimal(literal) {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(literal);
  if (!m) throw new Error(`Not a number literal: ${literal}`);
  const sign = m[1];
  const intPart = m[2];
  const frac = m[3] ?? "";
  let exp = parseInt(m[4] ?? "0", 10) - frac.length;
  let digits = (intPart + frac).replace(/^0+/, "");
  if (digits === "") return "0";
  const trailing = digits.length - digits.replace(/0+$/, "").length;
  digits = digits.slice(0, digits.length - trailing);
  exp += trailing;
  return `${sign}${digits}e${exp}`;
}

// src/core/describe.ts
var KIND_KEYS = {
  blueprint: "blueprint",
  blueprint_book: "blueprint-book",
  upgrade_planner: "upgrade-planner",
  deconstruction_planner: "deconstruction-planner"
};
var KIND_NAMES = {
  blueprint: "blueprint",
  "blueprint-book": "blueprint book",
  "upgrade-planner": "upgrade planner",
  "deconstruction-planner": "deconstruction planner"
};
function describeBlueprint(value) {
  const found = unwrap(value);
  if (!found) {
    throw new BlueprintStringError(
      "not-a-blueprint",
      "The data is not a blueprint, blueprint book, upgrade planner or deconstruction planner."
    );
  }
  const { kind, body } = found;
  const counts = {
    blueprints: 0,
    books: 0,
    upgradePlanners: 0,
    deconstructionPlanners: 0,
    entities: 0,
    tiles: 0
  };
  count(kind, body, counts, true);
  const result = { kind, counts };
  const label = nonEmptyString(body["label"]);
  if (label !== void 0) result.label = label;
  const description = nonEmptyString(body["description"]);
  if (description !== void 0) result.description = description;
  const version = body["version"];
  if (typeof version === "number") result.factorioVersion = decodeFactorioVersion(version);
  return result;
}
function decodeFactorioVersion(packed) {
  if (!Number.isSafeInteger(packed) || packed < 0) {
    throw new RangeError(`Not a Factorio version number: ${packed}`);
  }
  const parts = [2 ** 48, 2 ** 32, 2 ** 16, 1].map((unit) => Math.floor(packed / unit) % 65536);
  const [major, minor, patch, build] = parts;
  return build === 0 ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch}.${build}`;
}
function summarizeBlueprint(d) {
  const name = KIND_NAMES[d.kind];
  const label = d.label !== void 0 ? ` "${d.label}"` : "";
  const bits2 = [];
  const c = d.counts;
  if (d.kind === "blueprint-book") {
    bits2.push(plural(c.blueprints, "blueprint"));
    if (c.books > 0) bits2.push(plural(c.books, "book"));
    if (c.upgradePlanners + c.deconstructionPlanners > 0) {
      bits2.push(plural(c.upgradePlanners + c.deconstructionPlanners, "planner"));
    }
  }
  if (d.kind === "blueprint" || d.kind === "blueprint-book") {
    bits2.push(plural(c.entities, "entity", "entities"));
    if (c.tiles > 0) bits2.push(plural(c.tiles, "tile"));
  }
  return `${name}${label}` + (bits2.length > 0 ? ` (${bits2.join(", ")})` : "");
}
function plural(n, one, many = one + "s") {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
function unwrap(value) {
  if (!isObject(value)) return void 0;
  for (const [key, kind] of Object.entries(KIND_KEYS)) {
    const body = value[key];
    if (isObject(body)) return { kind, body };
  }
  return void 0;
}
function count(kind, body, c, top) {
  switch (kind) {
    case "blueprint":
      c.blueprints++;
      c.entities += arrayLength(body["entities"]);
      c.tiles += arrayLength(body["tiles"]);
      return;
    case "blueprint-book": {
      if (!top) c.books++;
      const children = body["blueprints"];
      if (!Array.isArray(children)) return;
      for (const child of children) {
        const inner = unwrap(child);
        if (inner) count(inner.kind, inner.body, c, false);
      }
      return;
    }
    case "upgrade-planner":
      c.upgradePlanners++;
      return;
    case "deconstruction-planner":
      c.deconstructionPlanners++;
      return;
  }
}
function arrayLength(v) {
  return Array.isArray(v) ? v.length : 0;
}
function nonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "" ? v : void 0;
}
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// src/core/slug.ts
var DROPPED_TAGS = /* @__PURE__ */ new Set([
  "color",
  "font",
  "tooltip",
  "gps",
  "train",
  "train-stop",
  "armor",
  "special-item",
  "space-platform"
]);
var TAG = /\[([a-z-]+)=([^\]]*)\]|\[[/.][a-z-]+\]/g;
function plainLabel(label) {
  const text = label.replace(TAG, (whole, type, value) => {
    if (type === void 0 || value === void 0 || DROPPED_TAGS.has(type)) return " ";
    const name = (value.split(",")[0] ?? "").split(/[/.]/).pop() ?? "";
    return name === "" ? " " : ` ${humanize(name)} `;
  });
  return text.replace(/\s+/g, " ").replace(/ ([)\],.:;!?])/g, "$1").replace(/([(\[]) /g, "$1").trim();
}
function humanize(name) {
  return name.split(/[-_]+/).filter((w) => w !== "").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}
function slugify(title) {
  return plainLabel(title).replace(/ß/g, "ss").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/(\d)\s*\/\s*(?:s|sec|m|min|h)\b/g, "$1").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

// node_modules/yaml/browser/dist/nodes/identity.js
var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
var isAlias = (node2) => !!node2 && typeof node2 === "object" && node2[NODE_TYPE] === ALIAS;
var isDocument = (node2) => !!node2 && typeof node2 === "object" && node2[NODE_TYPE] === DOC;
var isMap = (node2) => !!node2 && typeof node2 === "object" && node2[NODE_TYPE] === MAP;
var isPair = (node2) => !!node2 && typeof node2 === "object" && node2[NODE_TYPE] === PAIR;
var isScalar = (node2) => !!node2 && typeof node2 === "object" && node2[NODE_TYPE] === SCALAR;
var isSeq = (node2) => !!node2 && typeof node2 === "object" && node2[NODE_TYPE] === SEQ;
function isCollection(node2) {
  if (node2 && typeof node2 === "object")
    switch (node2[NODE_TYPE]) {
      case MAP:
      case SEQ:
        return true;
    }
  return false;
}
function isNode(node2) {
  if (node2 && typeof node2 === "object")
    switch (node2[NODE_TYPE]) {
      case ALIAS:
      case MAP:
      case SCALAR:
      case SEQ:
        return true;
    }
  return false;
}
var hasAnchor = (node2) => (isScalar(node2) || isCollection(node2)) && !!node2.anchor;

// node_modules/yaml/browser/dist/visit.js
var BREAK = /* @__PURE__ */ Symbol("break visit");
var SKIP = /* @__PURE__ */ Symbol("skip children");
var REMOVE = /* @__PURE__ */ Symbol("remove node");
function visit(node2, visitor) {
  const visitor_ = initVisitor(visitor);
  if (isDocument(node2)) {
    const cd = visit_(null, node2.contents, visitor_, Object.freeze([node2]));
    if (cd === REMOVE)
      node2.contents = null;
  } else
    visit_(null, node2, visitor_, Object.freeze([]));
}
visit.BREAK = BREAK;
visit.SKIP = SKIP;
visit.REMOVE = REMOVE;
function visit_(key, node2, visitor, path) {
  const ctrl = callVisitor(key, node2, visitor, path);
  if (isNode(ctrl) || isPair(ctrl)) {
    replaceNode(key, path, ctrl);
    return visit_(key, ctrl, visitor, path);
  }
  if (typeof ctrl !== "symbol") {
    if (isCollection(node2)) {
      path = Object.freeze(path.concat(node2));
      for (let i2 = 0; i2 < node2.items.length; ++i2) {
        const ci = visit_(i2, node2.items[i2], visitor, path);
        if (typeof ci === "number")
          i2 = ci - 1;
        else if (ci === BREAK)
          return BREAK;
        else if (ci === REMOVE) {
          node2.items.splice(i2, 1);
          i2 -= 1;
        }
      }
    } else if (isPair(node2)) {
      path = Object.freeze(path.concat(node2));
      const ck = visit_("key", node2.key, visitor, path);
      if (ck === BREAK)
        return BREAK;
      else if (ck === REMOVE)
        node2.key = null;
      const cv = visit_("value", node2.value, visitor, path);
      if (cv === BREAK)
        return BREAK;
      else if (cv === REMOVE)
        node2.value = null;
    }
  }
  return ctrl;
}
async function visitAsync(node2, visitor) {
  const visitor_ = initVisitor(visitor);
  if (isDocument(node2)) {
    const cd = await visitAsync_(null, node2.contents, visitor_, Object.freeze([node2]));
    if (cd === REMOVE)
      node2.contents = null;
  } else
    await visitAsync_(null, node2, visitor_, Object.freeze([]));
}
visitAsync.BREAK = BREAK;
visitAsync.SKIP = SKIP;
visitAsync.REMOVE = REMOVE;
async function visitAsync_(key, node2, visitor, path) {
  const ctrl = await callVisitor(key, node2, visitor, path);
  if (isNode(ctrl) || isPair(ctrl)) {
    replaceNode(key, path, ctrl);
    return visitAsync_(key, ctrl, visitor, path);
  }
  if (typeof ctrl !== "symbol") {
    if (isCollection(node2)) {
      path = Object.freeze(path.concat(node2));
      for (let i2 = 0; i2 < node2.items.length; ++i2) {
        const ci = await visitAsync_(i2, node2.items[i2], visitor, path);
        if (typeof ci === "number")
          i2 = ci - 1;
        else if (ci === BREAK)
          return BREAK;
        else if (ci === REMOVE) {
          node2.items.splice(i2, 1);
          i2 -= 1;
        }
      }
    } else if (isPair(node2)) {
      path = Object.freeze(path.concat(node2));
      const ck = await visitAsync_("key", node2.key, visitor, path);
      if (ck === BREAK)
        return BREAK;
      else if (ck === REMOVE)
        node2.key = null;
      const cv = await visitAsync_("value", node2.value, visitor, path);
      if (cv === BREAK)
        return BREAK;
      else if (cv === REMOVE)
        node2.value = null;
    }
  }
  return ctrl;
}
function initVisitor(visitor) {
  if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
    return Object.assign({
      Alias: visitor.Node,
      Map: visitor.Node,
      Scalar: visitor.Node,
      Seq: visitor.Node
    }, visitor.Value && {
      Map: visitor.Value,
      Scalar: visitor.Value,
      Seq: visitor.Value
    }, visitor.Collection && {
      Map: visitor.Collection,
      Seq: visitor.Collection
    }, visitor);
  }
  return visitor;
}
function callVisitor(key, node2, visitor, path) {
  if (typeof visitor === "function")
    return visitor(key, node2, path);
  if (isMap(node2))
    return visitor.Map?.(key, node2, path);
  if (isSeq(node2))
    return visitor.Seq?.(key, node2, path);
  if (isPair(node2))
    return visitor.Pair?.(key, node2, path);
  if (isScalar(node2))
    return visitor.Scalar?.(key, node2, path);
  if (isAlias(node2))
    return visitor.Alias?.(key, node2, path);
  return void 0;
}
function replaceNode(key, path, node2) {
  const parent = path[path.length - 1];
  if (isCollection(parent)) {
    parent.items[key] = node2;
  } else if (isPair(parent)) {
    if (key === "key")
      parent.key = node2;
    else
      parent.value = node2;
  } else if (isDocument(parent)) {
    parent.contents = node2;
  } else {
    const pt = isAlias(parent) ? "alias" : "scalar";
    throw new Error(`Cannot replace node with ${pt} parent`);
  }
}

// node_modules/yaml/browser/dist/doc/directives.js
var escapeChars = {
  "!": "%21",
  ",": "%2C",
  "[": "%5B",
  "]": "%5D",
  "{": "%7B",
  "}": "%7D"
};
var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
var Directives = class _Directives {
  constructor(yaml, tags) {
    this.docStart = null;
    this.docEnd = false;
    this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
    this.tags = Object.assign({}, _Directives.defaultTags, tags);
  }
  clone() {
    const copy = new _Directives(this.yaml, this.tags);
    copy.docStart = this.docStart;
    return copy;
  }
  /**
   * During parsing, get a Directives instance for the current document and
   * update the stream state according to the current version's spec.
   */
  atDocument() {
    const res = new _Directives(this.yaml, this.tags);
    switch (this.yaml.version) {
      case "1.1":
        this.atNextDocument = true;
        break;
      case "1.2":
        this.atNextDocument = false;
        this.yaml = {
          explicit: _Directives.defaultYaml.explicit,
          version: "1.2"
        };
        this.tags = Object.assign({}, _Directives.defaultTags);
        break;
    }
    return res;
  }
  /**
   * @param onError - May be called even if the action was successful
   * @returns `true` on success
   */
  add(line, onError) {
    if (this.atNextDocument) {
      this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
      this.tags = Object.assign({}, _Directives.defaultTags);
      this.atNextDocument = false;
    }
    const parts = line.trim().split(/[ \t]+/);
    const name = parts.shift();
    switch (name) {
      case "%TAG": {
        if (parts.length !== 2) {
          onError(0, "%TAG directive should contain exactly two parts");
          if (parts.length < 2)
            return false;
        }
        const [handle, prefix] = parts;
        this.tags[handle] = prefix;
        return true;
      }
      case "%YAML": {
        this.yaml.explicit = true;
        if (parts.length !== 1) {
          onError(0, "%YAML directive should contain exactly one part");
          return false;
        }
        const [version] = parts;
        if (version === "1.1" || version === "1.2") {
          this.yaml.version = version;
          return true;
        } else {
          const isValid = /^\d+\.\d+$/.test(version);
          onError(6, `Unsupported YAML version ${version}`, isValid);
          return false;
        }
      }
      default:
        onError(0, `Unknown directive ${name}`, true);
        return false;
    }
  }
  /**
   * Resolves a tag, matching handles to those defined in %TAG directives.
   *
   * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
   *   `'!local'` tag, or `null` if unresolvable.
   */
  tagName(source, onError) {
    if (source === "!")
      return "!";
    if (source[0] !== "!") {
      onError(`Not a valid tag: ${source}`);
      return null;
    }
    if (source[1] === "<") {
      const verbatim = source.slice(2, -1);
      if (verbatim === "!" || verbatim === "!!") {
        onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
        return null;
      }
      if (source[source.length - 1] !== ">")
        onError("Verbatim tags must end with a >");
      return verbatim;
    }
    const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
    if (!suffix)
      onError(`The ${source} tag has no suffix`);
    const prefix = this.tags[handle];
    if (prefix) {
      try {
        return prefix + decodeURIComponent(suffix);
      } catch (error) {
        onError(String(error));
        return null;
      }
    }
    if (handle === "!")
      return source;
    onError(`Could not resolve tag: ${source}`);
    return null;
  }
  /**
   * Given a fully resolved tag, returns its printable string form,
   * taking into account current tag prefixes and defaults.
   */
  tagString(tag) {
    for (const [handle, prefix] of Object.entries(this.tags)) {
      if (tag.startsWith(prefix))
        return handle + escapeTagName(tag.substring(prefix.length));
    }
    return tag[0] === "!" ? tag : `!<${tag}>`;
  }
  toString(doc) {
    const lines2 = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
    const tagEntries = Object.entries(this.tags);
    let tagNames;
    if (doc && tagEntries.length > 0 && isNode(doc.contents)) {
      const tags = {};
      visit(doc.contents, (_key, node2) => {
        if (isNode(node2) && node2.tag)
          tags[node2.tag] = true;
      });
      tagNames = Object.keys(tags);
    } else
      tagNames = [];
    for (const [handle, prefix] of tagEntries) {
      if (handle === "!!" && prefix === "tag:yaml.org,2002:")
        continue;
      if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
        lines2.push(`%TAG ${handle} ${prefix}`);
    }
    return lines2.join("\n");
  }
};
Directives.defaultYaml = { explicit: false, version: "1.2" };
Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };

// node_modules/yaml/browser/dist/doc/anchors.js
function anchorIsValid(anchor) {
  if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
    const sa = JSON.stringify(anchor);
    const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
    throw new Error(msg);
  }
  return true;
}
function anchorNames(root) {
  const anchors = /* @__PURE__ */ new Set();
  visit(root, {
    Value(_key, node2) {
      if (node2.anchor)
        anchors.add(node2.anchor);
    }
  });
  return anchors;
}
function findNewAnchor(prefix, exclude) {
  for (let i2 = 1; true; ++i2) {
    const name = `${prefix}${i2}`;
    if (!exclude.has(name))
      return name;
  }
}
function createNodeAnchors(doc, prefix) {
  const aliasObjects = [];
  const sourceObjects = /* @__PURE__ */ new Map();
  let prevAnchors = null;
  return {
    onAnchor: (source) => {
      aliasObjects.push(source);
      prevAnchors ?? (prevAnchors = anchorNames(doc));
      const anchor = findNewAnchor(prefix, prevAnchors);
      prevAnchors.add(anchor);
      return anchor;
    },
    /**
     * With circular references, the source node is only resolved after all
     * of its child nodes are. This is why anchors are set only after all of
     * the nodes have been created.
     */
    setAnchors: () => {
      for (const source of aliasObjects) {
        const ref = sourceObjects.get(source);
        if (typeof ref === "object" && ref.anchor && (isScalar(ref.node) || isCollection(ref.node))) {
          ref.node.anchor = ref.anchor;
        } else {
          const error = new Error("Failed to resolve repeated object (this should not happen)");
          error.source = source;
          throw error;
        }
      }
    },
    sourceObjects
  };
}

// node_modules/yaml/browser/dist/doc/applyReviver.js
function applyReviver(reviver, obj, key, val) {
  if (val && typeof val === "object") {
    if (Array.isArray(val)) {
      for (let i2 = 0, len = val.length; i2 < len; ++i2) {
        const v0 = val[i2];
        const v1 = applyReviver(reviver, val, String(i2), v0);
        if (v1 === void 0)
          delete val[i2];
        else if (v1 !== v0)
          val[i2] = v1;
      }
    } else if (val instanceof Map) {
      for (const k of Array.from(val.keys())) {
        const v0 = val.get(k);
        const v1 = applyReviver(reviver, val, k, v0);
        if (v1 === void 0)
          val.delete(k);
        else if (v1 !== v0)
          val.set(k, v1);
      }
    } else if (val instanceof Set) {
      for (const v0 of Array.from(val)) {
        const v1 = applyReviver(reviver, val, v0, v0);
        if (v1 === void 0)
          val.delete(v0);
        else if (v1 !== v0) {
          val.delete(v0);
          val.add(v1);
        }
      }
    } else {
      for (const [k, v0] of Object.entries(val)) {
        const v1 = applyReviver(reviver, val, k, v0);
        if (v1 === void 0)
          delete val[k];
        else if (v1 !== v0)
          val[k] = v1;
      }
    }
  }
  return reviver.call(obj, key, val);
}

// node_modules/yaml/browser/dist/nodes/toJS.js
function toJS(value, arg, ctx) {
  if (Array.isArray(value))
    return value.map((v, i2) => toJS(v, String(i2), ctx));
  if (value && typeof value.toJSON === "function") {
    if (!ctx || !hasAnchor(value))
      return value.toJSON(arg, ctx);
    const data = { aliasCount: 0, count: 1, res: void 0 };
    ctx.anchors.set(value, data);
    ctx.onCreate = (res2) => {
      data.res = res2;
      delete ctx.onCreate;
    };
    const res = value.toJSON(arg, ctx);
    if (ctx.onCreate)
      ctx.onCreate(res);
    return res;
  }
  if (typeof value === "bigint" && !ctx?.keep)
    return Number(value);
  return value;
}

// node_modules/yaml/browser/dist/nodes/Node.js
var NodeBase = class {
  constructor(type) {
    Object.defineProperty(this, NODE_TYPE, { value: type });
  }
  /** Create a copy of this node.  */
  clone() {
    const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
    if (this.range)
      copy.range = this.range.slice();
    return copy;
  }
  /** A plain JavaScript representation of this node. */
  toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
    if (!isDocument(doc))
      throw new TypeError("A document argument is required");
    const ctx = {
      anchors: /* @__PURE__ */ new Map(),
      doc,
      keep: true,
      mapAsMap: mapAsMap === true,
      mapKeyWarned: false,
      maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
    };
    const res = toJS(this, "", ctx);
    if (typeof onAnchor === "function")
      for (const { count: count2, res: res2 } of ctx.anchors.values())
        onAnchor(res2, count2);
    return typeof reviver === "function" ? applyReviver(reviver, { "": res }, "", res) : res;
  }
};

// node_modules/yaml/browser/dist/nodes/Alias.js
var Alias = class extends NodeBase {
  constructor(source) {
    super(ALIAS);
    this.source = source;
    Object.defineProperty(this, "tag", {
      set() {
        throw new Error("Alias nodes cannot have tags");
      }
    });
  }
  /**
   * Resolve the value of this alias within `doc`, finding the last
   * instance of the `source` anchor before this node.
   */
  resolve(doc, ctx) {
    if (ctx?.maxAliasCount === 0)
      throw new ReferenceError("Alias resolution is disabled");
    let nodes;
    if (ctx?.aliasResolveCache) {
      nodes = ctx.aliasResolveCache;
    } else {
      nodes = [];
      visit(doc, {
        Node: (_key, node2) => {
          if (isAlias(node2) || hasAnchor(node2))
            nodes.push(node2);
        }
      });
      if (ctx)
        ctx.aliasResolveCache = nodes;
    }
    let found = void 0;
    for (const node2 of nodes) {
      if (node2 === this)
        break;
      if (node2.anchor === this.source)
        found = node2;
    }
    if (found && ctx) {
      const { anchors, doc: doc2, maxAliasCount } = ctx;
      let data = anchors.get(found);
      if (!data) {
        toJS(found, null, ctx);
        data = anchors.get(found);
      }
      if (data?.res === void 0) {
        const msg = "This should not happen: Alias anchor was not resolved?";
        throw new ReferenceError(msg);
      }
      if (maxAliasCount >= 0) {
        data.count += 1;
        if (data.aliasCount === 0)
          data.aliasCount = getAliasCount(doc2, found, anchors);
        if (data.count * data.aliasCount > maxAliasCount) {
          const msg = "Excessive alias count indicates a resource exhaustion attack";
          throw new ReferenceError(msg);
        }
      }
    }
    return found;
  }
  toJSON(_arg, ctx) {
    if (!ctx)
      return { source: this.source };
    const source = this.resolve(ctx.doc, ctx);
    if (!source) {
      const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
      throw new ReferenceError(msg);
    }
    return ctx.anchors.get(source).res;
  }
  toString(ctx, _onComment, _onChompKeep) {
    const src = `*${this.source}`;
    if (ctx) {
      anchorIsValid(this.source);
      if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
        const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
        throw new Error(msg);
      }
      if (ctx.implicitKey)
        return `${src} `;
    }
    return src;
  }
};
function getAliasCount(doc, node2, anchors) {
  if (isAlias(node2)) {
    const source = node2.resolve(doc);
    const anchor = anchors && source && anchors.get(source);
    return anchor ? anchor.count * anchor.aliasCount : 0;
  } else if (isCollection(node2)) {
    let count2 = 0;
    for (const item of node2.items) {
      const c = getAliasCount(doc, item, anchors);
      if (c > count2)
        count2 = c;
    }
    return count2;
  } else if (isPair(node2)) {
    const kc = getAliasCount(doc, node2.key, anchors);
    const vc = getAliasCount(doc, node2.value, anchors);
    return Math.max(kc, vc);
  }
  return 1;
}

// node_modules/yaml/browser/dist/nodes/Scalar.js
var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
var Scalar = class extends NodeBase {
  constructor(value) {
    super(SCALAR);
    this.value = value;
  }
  toJSON(arg, ctx) {
    return ctx?.keep ? this.value : toJS(this.value, arg, ctx);
  }
  toString() {
    return String(this.value);
  }
};
Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
Scalar.PLAIN = "PLAIN";
Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";

// node_modules/yaml/browser/dist/doc/createNode.js
var defaultTagPrefix = "tag:yaml.org,2002:";
function findTagObject(value, tagName, tags) {
  if (tagName) {
    const match = tags.filter((t) => t.tag === tagName);
    const tagObj = match.find((t) => !t.format) ?? match[0];
    if (!tagObj)
      throw new Error(`Tag ${tagName} not found`);
    return tagObj;
  }
  return tags.find((t) => t.identify?.(value) && !t.format);
}
function createNode(value, tagName, ctx) {
  if (isDocument(value))
    value = value.contents;
  if (isNode(value))
    return value;
  if (isPair(value)) {
    const map2 = ctx.schema[MAP].createNode?.(ctx.schema, null, ctx);
    map2.items.push(value);
    return map2;
  }
  if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
    value = value.valueOf();
  }
  const { aliasDuplicateObjects, onAnchor, onTagObj, schema: schema4, sourceObjects } = ctx;
  let ref = void 0;
  if (aliasDuplicateObjects && value && typeof value === "object") {
    ref = sourceObjects.get(value);
    if (ref) {
      ref.anchor ?? (ref.anchor = onAnchor(value));
      return new Alias(ref.anchor);
    } else {
      ref = { anchor: null, node: null };
      sourceObjects.set(value, ref);
    }
  }
  if (tagName?.startsWith("!!"))
    tagName = defaultTagPrefix + tagName.slice(2);
  let tagObj = findTagObject(value, tagName, schema4.tags);
  if (!tagObj) {
    if (value && typeof value.toJSON === "function") {
      value = value.toJSON();
    }
    if (!value || typeof value !== "object") {
      const node3 = new Scalar(value);
      if (ref)
        ref.node = node3;
      return node3;
    }
    tagObj = value instanceof Map ? schema4[MAP] : Symbol.iterator in Object(value) ? schema4[SEQ] : schema4[MAP];
  }
  if (onTagObj) {
    onTagObj(tagObj);
    delete ctx.onTagObj;
  }
  const node2 = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar(value);
  if (tagName)
    node2.tag = tagName;
  else if (!tagObj.default)
    node2.tag = tagObj.tag;
  if (ref)
    ref.node = node2;
  return node2;
}

// node_modules/yaml/browser/dist/nodes/Collection.js
function collectionFromPath(schema4, path, value) {
  let v = value;
  for (let i2 = path.length - 1; i2 >= 0; --i2) {
    const k = path[i2];
    if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
      const a = [];
      a[k] = v;
      v = a;
    } else {
      v = /* @__PURE__ */ new Map([[k, v]]);
    }
  }
  return createNode(v, void 0, {
    aliasDuplicateObjects: false,
    keepUndefined: false,
    onAnchor: () => {
      throw new Error("This should not happen, please report a bug.");
    },
    schema: schema4,
    sourceObjects: /* @__PURE__ */ new Map()
  });
}
var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
var Collection = class extends NodeBase {
  constructor(type, schema4) {
    super(type);
    Object.defineProperty(this, "schema", {
      value: schema4,
      configurable: true,
      enumerable: false,
      writable: true
    });
  }
  /**
   * Create a copy of this collection.
   *
   * @param schema - If defined, overwrites the original's schema
   */
  clone(schema4) {
    const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
    if (schema4)
      copy.schema = schema4;
    copy.items = copy.items.map((it) => isNode(it) || isPair(it) ? it.clone(schema4) : it);
    if (this.range)
      copy.range = this.range.slice();
    return copy;
  }
  /**
   * Adds a value to the collection. For `!!map` and `!!omap` the value must
   * be a Pair instance or a `{ key, value }` object, which may not have a key
   * that already exists in the map.
   */
  addIn(path, value) {
    if (isEmptyPath(path))
      this.add(value);
    else {
      const [key, ...rest] = path;
      const node2 = this.get(key, true);
      if (isCollection(node2))
        node2.addIn(rest, value);
      else if (node2 === void 0 && this.schema)
        this.set(key, collectionFromPath(this.schema, rest, value));
      else
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
  }
  /**
   * Removes a value from the collection.
   * @returns `true` if the item was found and removed.
   */
  deleteIn(path) {
    const [key, ...rest] = path;
    if (rest.length === 0)
      return this.delete(key);
    const node2 = this.get(key, true);
    if (isCollection(node2))
      return node2.deleteIn(rest);
    else
      throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
  }
  /**
   * Returns item at `key`, or `undefined` if not found. By default unwraps
   * scalar values from their surrounding node; to disable set `keepScalar` to
   * `true` (collections are always returned intact).
   */
  getIn(path, keepScalar) {
    const [key, ...rest] = path;
    const node2 = this.get(key, true);
    if (rest.length === 0)
      return !keepScalar && isScalar(node2) ? node2.value : node2;
    else
      return isCollection(node2) ? node2.getIn(rest, keepScalar) : void 0;
  }
  hasAllNullValues(allowScalar) {
    return this.items.every((node2) => {
      if (!isPair(node2))
        return false;
      const n = node2.value;
      return n == null || allowScalar && isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
    });
  }
  /**
   * Checks if the collection includes a value with the key `key`.
   */
  hasIn(path) {
    const [key, ...rest] = path;
    if (rest.length === 0)
      return this.has(key);
    const node2 = this.get(key, true);
    return isCollection(node2) ? node2.hasIn(rest) : false;
  }
  /**
   * Sets a value in this collection. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   */
  setIn(path, value) {
    const [key, ...rest] = path;
    if (rest.length === 0) {
      this.set(key, value);
    } else {
      const node2 = this.get(key, true);
      if (isCollection(node2))
        node2.setIn(rest, value);
      else if (node2 === void 0 && this.schema)
        this.set(key, collectionFromPath(this.schema, rest, value));
      else
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
  }
};

// node_modules/yaml/browser/dist/stringify/stringifyComment.js
var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
function indentComment(comment, indent) {
  if (/^\n+$/.test(comment))
    return comment.substring(1);
  return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
}
var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;

// node_modules/yaml/browser/dist/stringify/foldFlowLines.js
var FOLD_FLOW = "flow";
var FOLD_BLOCK = "block";
var FOLD_QUOTED = "quoted";
function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
  if (!lineWidth || lineWidth < 0)
    return text;
  if (lineWidth < minContentWidth)
    minContentWidth = 0;
  const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
  if (text.length <= endStep)
    return text;
  const folds = [];
  const escapedFolds = {};
  let end = lineWidth - indent.length;
  if (typeof indentAtStart === "number") {
    if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
      folds.push(0);
    else
      end = lineWidth - indentAtStart;
  }
  let split = void 0;
  let prev = void 0;
  let overflow = false;
  let i2 = -1;
  let escStart = -1;
  let escEnd = -1;
  if (mode === FOLD_BLOCK) {
    i2 = consumeMoreIndentedLines(text, i2, indent.length);
    if (i2 !== -1)
      end = i2 + endStep;
  }
  for (let ch; ch = text[i2 += 1]; ) {
    if (mode === FOLD_QUOTED && ch === "\\") {
      escStart = i2;
      switch (text[i2 + 1]) {
        case "x":
          i2 += 3;
          break;
        case "u":
          i2 += 5;
          break;
        case "U":
          i2 += 9;
          break;
        default:
          i2 += 1;
      }
      escEnd = i2;
    }
    if (ch === "\n") {
      if (mode === FOLD_BLOCK)
        i2 = consumeMoreIndentedLines(text, i2, indent.length);
      end = i2 + indent.length + endStep;
      split = void 0;
    } else {
      if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
        const next = text[i2 + 1];
        if (next && next !== " " && next !== "\n" && next !== "	")
          split = i2;
      }
      if (i2 >= end) {
        if (split) {
          folds.push(split);
          end = split + endStep;
          split = void 0;
        } else if (mode === FOLD_QUOTED) {
          while (prev === " " || prev === "	") {
            prev = ch;
            ch = text[i2 += 1];
            overflow = true;
          }
          const j = i2 > escEnd + 1 ? i2 - 2 : escStart - 1;
          if (escapedFolds[j])
            return text;
          folds.push(j);
          escapedFolds[j] = true;
          end = j + endStep;
          split = void 0;
        } else {
          overflow = true;
        }
      }
    }
    prev = ch;
  }
  if (overflow && onOverflow)
    onOverflow();
  if (folds.length === 0)
    return text;
  if (onFold)
    onFold();
  let res = text.slice(0, folds[0]);
  for (let i3 = 0; i3 < folds.length; ++i3) {
    const fold = folds[i3];
    const end2 = folds[i3 + 1] || text.length;
    if (fold === 0)
      res = `
${indent}${text.slice(0, end2)}`;
    else {
      if (mode === FOLD_QUOTED && escapedFolds[fold])
        res += `${text[fold]}\\`;
      res += `
${indent}${text.slice(fold + 1, end2)}`;
    }
  }
  return res;
}
function consumeMoreIndentedLines(text, i2, indent) {
  let end = i2;
  let start = i2 + 1;
  let ch = text[start];
  while (ch === " " || ch === "	") {
    if (i2 < start + indent) {
      ch = text[++i2];
    } else {
      do {
        ch = text[++i2];
      } while (ch && ch !== "\n");
      end = i2;
      start = i2 + 1;
      ch = text[start];
    }
  }
  return end;
}

// node_modules/yaml/browser/dist/stringify/stringifyString.js
var getFoldOptions = (ctx, isBlock2) => ({
  indentAtStart: isBlock2 ? ctx.indent.length : ctx.indentAtStart,
  lineWidth: ctx.options.lineWidth,
  minContentWidth: ctx.options.minContentWidth
});
var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
function lineLengthOverLimit(str, lineWidth, indentLength) {
  if (!lineWidth || lineWidth < 0)
    return false;
  const limit = lineWidth - indentLength;
  const strLen = str.length;
  if (strLen <= limit)
    return false;
  for (let i2 = 0, start = 0; i2 < strLen; ++i2) {
    if (str[i2] === "\n") {
      if (i2 - start > limit)
        return true;
      start = i2 + 1;
      if (strLen - start <= limit)
        return false;
    }
  }
  return true;
}
function doubleQuotedString(value, ctx) {
  const json = JSON.stringify(value);
  if (ctx.options.doubleQuotedAsJSON)
    return json;
  const { implicitKey } = ctx;
  const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
  const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
  let str = "";
  let start = 0;
  for (let i2 = 0, ch = json[i2]; ch; ch = json[++i2]) {
    if (ch === " " && json[i2 + 1] === "\\" && json[i2 + 2] === "n") {
      str += json.slice(start, i2) + "\\ ";
      i2 += 1;
      start = i2;
      ch = "\\";
    }
    if (ch === "\\")
      switch (json[i2 + 1]) {
        case "u":
          {
            str += json.slice(start, i2);
            const code = json.substr(i2 + 2, 4);
            switch (code) {
              case "0000":
                str += "\\0";
                break;
              case "0007":
                str += "\\a";
                break;
              case "000b":
                str += "\\v";
                break;
              case "001b":
                str += "\\e";
                break;
              case "0085":
                str += "\\N";
                break;
              case "00a0":
                str += "\\_";
                break;
              case "2028":
                str += "\\L";
                break;
              case "2029":
                str += "\\P";
                break;
              default:
                if (code.substr(0, 2) === "00")
                  str += "\\x" + code.substr(2);
                else
                  str += json.substr(i2, 6);
            }
            i2 += 5;
            start = i2 + 1;
          }
          break;
        case "n":
          if (implicitKey || json[i2 + 2] === '"' || json.length < minMultiLineLength) {
            i2 += 1;
          } else {
            str += json.slice(start, i2) + "\n\n";
            while (json[i2 + 2] === "\\" && json[i2 + 3] === "n" && json[i2 + 4] !== '"') {
              str += "\n";
              i2 += 2;
            }
            str += indent;
            if (json[i2 + 2] === " ")
              str += "\\";
            i2 += 1;
            start = i2 + 1;
          }
          break;
        default:
          i2 += 1;
      }
  }
  str = start ? str + json.slice(start) : json;
  return implicitKey ? str : foldFlowLines(str, indent, FOLD_QUOTED, getFoldOptions(ctx, false));
}
function singleQuotedString(value, ctx) {
  if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
    return doubleQuotedString(value, ctx);
  const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
  const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
  return ctx.implicitKey ? res : foldFlowLines(res, indent, FOLD_FLOW, getFoldOptions(ctx, false));
}
function quotedString(value, ctx) {
  const { singleQuote } = ctx.options;
  let qs;
  if (singleQuote === false)
    qs = doubleQuotedString;
  else {
    const hasDouble = value.includes('"');
    const hasSingle = value.includes("'");
    if (hasDouble && !hasSingle)
      qs = singleQuotedString;
    else if (hasSingle && !hasDouble)
      qs = doubleQuotedString;
    else
      qs = singleQuote ? singleQuotedString : doubleQuotedString;
  }
  return qs(value, ctx);
}
var blockEndNewlines;
try {
  blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
} catch {
  blockEndNewlines = /\n+(?!\n|$)/g;
}
function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
  const { blockQuote, commentString, lineWidth } = ctx.options;
  if (!blockQuote || /\n[\t ]+$/.test(value)) {
    return quotedString(value, ctx);
  }
  const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
  const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.BLOCK_FOLDED ? false : type === Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
  if (!value)
    return literal ? "|\n" : ">\n";
  let chomp;
  let endStart;
  for (endStart = value.length; endStart > 0; --endStart) {
    const ch = value[endStart - 1];
    if (ch !== "\n" && ch !== "	" && ch !== " ")
      break;
  }
  let end = value.substring(endStart);
  const endNlPos = end.indexOf("\n");
  if (endNlPos === -1) {
    chomp = "-";
  } else if (value === end || endNlPos !== end.length - 1) {
    chomp = "+";
    if (onChompKeep)
      onChompKeep();
  } else {
    chomp = "";
  }
  if (end) {
    value = value.slice(0, -end.length);
    if (end[end.length - 1] === "\n")
      end = end.slice(0, -1);
    end = end.replace(blockEndNewlines, `$&${indent}`);
  }
  let startWithSpace = false;
  let startEnd;
  let startNlPos = -1;
  for (startEnd = 0; startEnd < value.length; ++startEnd) {
    const ch = value[startEnd];
    if (ch === " ")
      startWithSpace = true;
    else if (ch === "\n")
      startNlPos = startEnd;
    else
      break;
  }
  let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
  if (start) {
    value = value.substring(start.length);
    start = start.replace(/\n+/g, `$&${indent}`);
  }
  const indentSize = indent ? "2" : "1";
  let header = (startWithSpace ? indentSize : "") + chomp;
  if (comment) {
    header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
    if (onComment)
      onComment();
  }
  if (!literal) {
    const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
    let literalFallback = false;
    const foldOptions = getFoldOptions(ctx, true);
    if (blockQuote !== "folded" && type !== Scalar.BLOCK_FOLDED) {
      foldOptions.onOverflow = () => {
        literalFallback = true;
      };
    }
    const body = foldFlowLines(`${start}${foldedValue}${end}`, indent, FOLD_BLOCK, foldOptions);
    if (!literalFallback)
      return `>${header}
${indent}${body}`;
  }
  value = value.replace(/\n+/g, `$&${indent}`);
  return `|${header}
${indent}${start}${value}${end}`;
}
function plainString(item, ctx, onComment, onChompKeep) {
  const { type, value } = item;
  const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
  if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
    return quotedString(value, ctx);
  }
  if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
    return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
  }
  if (!implicitKey && !inFlow && type !== Scalar.PLAIN && value.includes("\n")) {
    return blockString(item, ctx, onComment, onChompKeep);
  }
  if (containsDocumentMarker(value)) {
    if (indent === "") {
      ctx.forceBlockIndent = true;
      return blockString(item, ctx, onComment, onChompKeep);
    } else if (implicitKey && indent === indentStep) {
      return quotedString(value, ctx);
    }
  }
  const str = value.replace(/\n+/g, `$&
${indent}`);
  if (actualString) {
    const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
    const { compat, tags } = ctx.doc.schema;
    if (tags.some(test) || compat?.some(test))
      return quotedString(value, ctx);
  }
  return implicitKey ? str : foldFlowLines(str, indent, FOLD_FLOW, getFoldOptions(ctx, false));
}
function stringifyString(item, ctx, onComment, onChompKeep) {
  const { implicitKey, inFlow } = ctx;
  const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
  let { type } = item;
  if (type !== Scalar.QUOTE_DOUBLE) {
    if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
      type = Scalar.QUOTE_DOUBLE;
  }
  const _stringify = (_type) => {
    switch (_type) {
      case Scalar.BLOCK_FOLDED:
      case Scalar.BLOCK_LITERAL:
        return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
      case Scalar.QUOTE_DOUBLE:
        return doubleQuotedString(ss.value, ctx);
      case Scalar.QUOTE_SINGLE:
        return singleQuotedString(ss.value, ctx);
      case Scalar.PLAIN:
        return plainString(ss, ctx, onComment, onChompKeep);
      default:
        return null;
    }
  };
  let res = _stringify(type);
  if (res === null) {
    const { defaultKeyType, defaultStringType } = ctx.options;
    const t = implicitKey && defaultKeyType || defaultStringType;
    res = _stringify(t);
    if (res === null)
      throw new Error(`Unsupported default string type ${t}`);
  }
  return res;
}

// node_modules/yaml/browser/dist/stringify/stringify.js
function createStringifyContext(doc, options) {
  const opt = Object.assign({
    blockQuote: true,
    commentString: stringifyComment,
    defaultKeyType: null,
    defaultStringType: "PLAIN",
    directives: null,
    doubleQuotedAsJSON: false,
    doubleQuotedMinMultiLineLength: 40,
    falseStr: "false",
    flowCollectionPadding: true,
    indentSeq: true,
    lineWidth: 80,
    minContentWidth: 20,
    nullStr: "null",
    simpleKeys: false,
    singleQuote: null,
    trailingComma: false,
    trueStr: "true",
    verifyAliasOrder: true
  }, doc.schema.toStringOptions, options);
  let inFlow;
  switch (opt.collectionStyle) {
    case "block":
      inFlow = false;
      break;
    case "flow":
      inFlow = true;
      break;
    default:
      inFlow = null;
  }
  return {
    anchors: /* @__PURE__ */ new Set(),
    doc,
    flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
    indent: "",
    indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
    inFlow,
    options: opt
  };
}
function getTagObject(tags, item) {
  if (item.tag) {
    const match = tags.filter((t) => t.tag === item.tag);
    if (match.length > 0)
      return match.find((t) => t.format === item.format) ?? match[0];
  }
  let tagObj = void 0;
  let obj;
  if (isScalar(item)) {
    obj = item.value;
    let match = tags.filter((t) => t.identify?.(obj));
    if (match.length > 1) {
      const testMatch = match.filter((t) => t.test);
      if (testMatch.length > 0)
        match = testMatch;
    }
    tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
  } else {
    obj = item;
    tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
  }
  if (!tagObj) {
    const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
    throw new Error(`Tag not resolved for ${name} value`);
  }
  return tagObj;
}
function stringifyProps(node2, tagObj, { anchors, doc }) {
  if (!doc.directives)
    return "";
  const props = [];
  const anchor = (isScalar(node2) || isCollection(node2)) && node2.anchor;
  if (anchor && anchorIsValid(anchor)) {
    anchors.add(anchor);
    props.push(`&${anchor}`);
  }
  const tag = node2.tag ?? (tagObj.default ? null : tagObj.tag);
  if (tag)
    props.push(doc.directives.tagString(tag));
  return props.join(" ");
}
function stringify(item, ctx, onComment, onChompKeep) {
  if (isPair(item))
    return item.toString(ctx, onComment, onChompKeep);
  if (isAlias(item)) {
    if (ctx.doc.directives)
      return item.toString(ctx);
    if (ctx.resolvedAliases?.has(item)) {
      throw new TypeError(`Cannot stringify circular structure without alias nodes`);
    } else {
      if (ctx.resolvedAliases)
        ctx.resolvedAliases.add(item);
      else
        ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
      item = item.resolve(ctx.doc);
    }
  }
  let tagObj = void 0;
  const node2 = isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
  tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node2));
  const props = stringifyProps(node2, tagObj, ctx);
  if (props.length > 0)
    ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
  const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node2, ctx, onComment, onChompKeep) : isScalar(node2) ? stringifyString(node2, ctx, onComment, onChompKeep) : node2.toString(ctx, onComment, onChompKeep);
  if (!props)
    return str;
  return isScalar(node2) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
}

// node_modules/yaml/browser/dist/stringify/stringifyPair.js
function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
  const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
  let keyComment = isNode(key) && key.comment || null;
  if (simpleKeys) {
    if (keyComment) {
      throw new Error("With simple keys, key nodes cannot have comments");
    }
    if (isCollection(key) || !isNode(key) && typeof key === "object") {
      const msg = "With simple keys, collection cannot be used as a key value";
      throw new Error(msg);
    }
  }
  let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || isCollection(key) || (isScalar(key) ? key.type === Scalar.BLOCK_FOLDED || key.type === Scalar.BLOCK_LITERAL : typeof key === "object"));
  ctx = Object.assign({}, ctx, {
    allNullValues: false,
    implicitKey: !explicitKey && (simpleKeys || !allNullValues),
    indent: indent + indentStep
  });
  let keyCommentDone = false;
  let chompKeep = false;
  let str = stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
  if (!explicitKey && !ctx.inFlow && str.length > 1024) {
    if (simpleKeys)
      throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
    explicitKey = true;
  }
  if (ctx.inFlow) {
    if (allNullValues || value == null) {
      if (keyCommentDone && onComment)
        onComment();
      return str === "" ? "?" : explicitKey ? `? ${str}` : str;
    }
  } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
    str = `? ${str}`;
    if (keyComment && !keyCommentDone) {
      str += lineComment(str, ctx.indent, commentString(keyComment));
    } else if (chompKeep && onChompKeep)
      onChompKeep();
    return str;
  }
  if (keyCommentDone)
    keyComment = null;
  if (explicitKey) {
    if (keyComment)
      str += lineComment(str, ctx.indent, commentString(keyComment));
    str = `? ${str}
${indent}:`;
  } else {
    str = `${str}:`;
    if (keyComment)
      str += lineComment(str, ctx.indent, commentString(keyComment));
  }
  let vsb, vcb, valueComment;
  if (isNode(value)) {
    vsb = !!value.spaceBefore;
    vcb = value.commentBefore;
    valueComment = value.comment;
  } else {
    vsb = false;
    vcb = null;
    valueComment = null;
    if (value && typeof value === "object")
      value = doc.createNode(value);
  }
  ctx.implicitKey = false;
  if (!explicitKey && !keyComment && isScalar(value))
    ctx.indentAtStart = str.length + 1;
  chompKeep = false;
  if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && isSeq(value) && !value.flow && !value.tag && !value.anchor) {
    ctx.indent = ctx.indent.substring(2);
  }
  let valueCommentDone = false;
  const valueStr = stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
  let ws = " ";
  if (keyComment || vsb || vcb) {
    ws = vsb ? "\n" : "";
    if (vcb) {
      const cs = commentString(vcb);
      ws += `
${indentComment(cs, ctx.indent)}`;
    }
    if (valueStr === "" && !ctx.inFlow) {
      if (ws === "\n" && valueComment)
        ws = "\n\n";
    } else {
      ws += `
${ctx.indent}`;
    }
  } else if (!explicitKey && isCollection(value)) {
    const vs0 = valueStr[0];
    const nl0 = valueStr.indexOf("\n");
    const hasNewline = nl0 !== -1;
    const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
    if (hasNewline || !flow) {
      let hasPropsLine = false;
      if (hasNewline && (vs0 === "&" || vs0 === "!")) {
        let sp0 = valueStr.indexOf(" ");
        if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
          sp0 = valueStr.indexOf(" ", sp0 + 1);
        }
        if (sp0 === -1 || nl0 < sp0)
          hasPropsLine = true;
      }
      if (!hasPropsLine)
        ws = `
${ctx.indent}`;
    }
  } else if (valueStr === "" || valueStr[0] === "\n") {
    ws = "";
  }
  str += ws + valueStr;
  if (ctx.inFlow) {
    if (valueCommentDone && onComment)
      onComment();
  } else if (valueComment && !valueCommentDone) {
    str += lineComment(str, ctx.indent, commentString(valueComment));
  } else if (chompKeep && onChompKeep) {
    onChompKeep();
  }
  return str;
}

// node_modules/yaml/browser/dist/log.js
function warn(logLevel, warning) {
  if (logLevel === "debug" || logLevel === "warn") {
    console.warn(warning);
  }
}

// node_modules/yaml/browser/dist/schema/yaml-1.1/merge.js
var MERGE_KEY = "<<";
var merge = {
  identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
  default: "key",
  tag: "tag:yaml.org,2002:merge",
  test: /^<<$/,
  resolve: () => Object.assign(new Scalar(Symbol(MERGE_KEY)), {
    addToJSMap: addMergeToJSMap
  }),
  stringify: () => MERGE_KEY
};
var isMergeKey = (ctx, key) => (merge.identify(key) || isScalar(key) && (!key.type || key.type === Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
function addMergeToJSMap(ctx, map2, value) {
  const source = resolveAliasValue(ctx, value);
  if (isSeq(source))
    for (const it of source.items)
      mergeValue(ctx, map2, it);
  else if (Array.isArray(source))
    for (const it of source)
      mergeValue(ctx, map2, it);
  else
    mergeValue(ctx, map2, source);
}
function mergeValue(ctx, map2, value) {
  const source = resolveAliasValue(ctx, value);
  if (!isMap(source))
    throw new Error("Merge sources must be maps or map aliases");
  const srcMap = source.toJSON(null, ctx, Map);
  for (const [key, value2] of srcMap) {
    if (map2 instanceof Map) {
      if (!map2.has(key))
        map2.set(key, value2);
    } else if (map2 instanceof Set) {
      map2.add(key);
    } else if (!Object.prototype.hasOwnProperty.call(map2, key)) {
      Object.defineProperty(map2, key, {
        value: value2,
        writable: true,
        enumerable: true,
        configurable: true
      });
    }
  }
  return map2;
}
function resolveAliasValue(ctx, value) {
  return ctx && isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
}

// node_modules/yaml/browser/dist/nodes/addPairToJSMap.js
function addPairToJSMap(ctx, map2, { key, value }) {
  if (isNode(key) && key.addToJSMap)
    key.addToJSMap(ctx, map2, value);
  else if (isMergeKey(ctx, key))
    addMergeToJSMap(ctx, map2, value);
  else {
    const jsKey = toJS(key, "", ctx);
    if (map2 instanceof Map) {
      map2.set(jsKey, toJS(value, jsKey, ctx));
    } else if (map2 instanceof Set) {
      map2.add(jsKey);
    } else {
      const stringKey = stringifyKey(key, jsKey, ctx);
      const jsValue = toJS(value, stringKey, ctx);
      if (stringKey in map2)
        Object.defineProperty(map2, stringKey, {
          value: jsValue,
          writable: true,
          enumerable: true,
          configurable: true
        });
      else
        map2[stringKey] = jsValue;
    }
  }
  return map2;
}
function stringifyKey(key, jsKey, ctx) {
  if (jsKey === null)
    return "";
  if (typeof jsKey !== "object")
    return String(jsKey);
  if (isNode(key) && ctx?.doc) {
    const strCtx = createStringifyContext(ctx.doc, {});
    strCtx.anchors = /* @__PURE__ */ new Set();
    for (const node2 of ctx.anchors.keys())
      strCtx.anchors.add(node2.anchor);
    strCtx.inFlow = true;
    strCtx.inStringifyKey = true;
    const strKey = key.toString(strCtx);
    if (!ctx.mapKeyWarned) {
      let jsonStr = JSON.stringify(strKey);
      if (jsonStr.length > 40)
        jsonStr = jsonStr.substring(0, 36) + '..."';
      warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
      ctx.mapKeyWarned = true;
    }
    return strKey;
  }
  return JSON.stringify(jsKey);
}

// node_modules/yaml/browser/dist/nodes/Pair.js
function createPair(key, value, ctx) {
  const k = createNode(key, void 0, ctx);
  const v = createNode(value, void 0, ctx);
  return new Pair(k, v);
}
var Pair = class _Pair {
  constructor(key, value = null) {
    Object.defineProperty(this, NODE_TYPE, { value: PAIR });
    this.key = key;
    this.value = value;
  }
  clone(schema4) {
    let { key, value } = this;
    if (isNode(key))
      key = key.clone(schema4);
    if (isNode(value))
      value = value.clone(schema4);
    return new _Pair(key, value);
  }
  toJSON(_, ctx) {
    const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
    return addPairToJSMap(ctx, pair, this);
  }
  toString(ctx, onComment, onChompKeep) {
    return ctx?.doc ? stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
  }
};

// node_modules/yaml/browser/dist/stringify/stringifyCollection.js
function stringifyCollection(collection, ctx, options) {
  const flow = ctx.inFlow ?? collection.flow;
  const stringify4 = flow ? stringifyFlowCollection : stringifyBlockCollection;
  return stringify4(collection, ctx, options);
}
function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
  const { indent, options: { commentString } } = ctx;
  const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
  let chompKeep = false;
  const lines2 = [];
  for (let i2 = 0; i2 < items.length; ++i2) {
    const item = items[i2];
    let comment2 = null;
    if (isNode(item)) {
      if (!chompKeep && item.spaceBefore)
        lines2.push("");
      addCommentBefore(ctx, lines2, item.commentBefore, chompKeep);
      if (item.comment)
        comment2 = item.comment;
    } else if (isPair(item)) {
      const ik = isNode(item.key) ? item.key : null;
      if (ik) {
        if (!chompKeep && ik.spaceBefore)
          lines2.push("");
        addCommentBefore(ctx, lines2, ik.commentBefore, chompKeep);
      }
    }
    chompKeep = false;
    let str2 = stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
    if (comment2)
      str2 += lineComment(str2, itemIndent, commentString(comment2));
    if (chompKeep && comment2)
      chompKeep = false;
    lines2.push(blockItemPrefix + str2);
  }
  let str;
  if (lines2.length === 0) {
    str = flowChars.start + flowChars.end;
  } else {
    str = lines2[0];
    for (let i2 = 1; i2 < lines2.length; ++i2) {
      const line = lines2[i2];
      str += line ? `
${indent}${line}` : "\n";
    }
  }
  if (comment) {
    str += "\n" + indentComment(commentString(comment), indent);
    if (onComment)
      onComment();
  } else if (chompKeep && onChompKeep)
    onChompKeep();
  return str;
}
function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
  const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
  itemIndent += indentStep;
  const itemCtx = Object.assign({}, ctx, {
    indent: itemIndent,
    inFlow: true,
    type: null
  });
  let reqNewline = false;
  let linesAtValue = 0;
  const lines2 = [];
  for (let i2 = 0; i2 < items.length; ++i2) {
    const item = items[i2];
    let comment = null;
    if (isNode(item)) {
      if (item.spaceBefore)
        lines2.push("");
      addCommentBefore(ctx, lines2, item.commentBefore, false);
      if (item.comment)
        comment = item.comment;
    } else if (isPair(item)) {
      const ik = isNode(item.key) ? item.key : null;
      if (ik) {
        if (ik.spaceBefore)
          lines2.push("");
        addCommentBefore(ctx, lines2, ik.commentBefore, false);
        if (ik.comment)
          reqNewline = true;
      }
      const iv = isNode(item.value) ? item.value : null;
      if (iv) {
        if (iv.comment)
          comment = iv.comment;
        if (iv.commentBefore)
          reqNewline = true;
      } else if (item.value == null && ik?.comment) {
        comment = ik.comment;
      }
    }
    if (comment)
      reqNewline = true;
    let str = stringify(item, itemCtx, () => comment = null);
    reqNewline || (reqNewline = lines2.length > linesAtValue || str.includes("\n"));
    if (i2 < items.length - 1) {
      str += ",";
    } else if (ctx.options.trailingComma) {
      if (ctx.options.lineWidth > 0) {
        reqNewline || (reqNewline = lines2.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
      }
      if (reqNewline) {
        str += ",";
      }
    }
    if (comment)
      str += lineComment(str, itemIndent, commentString(comment));
    lines2.push(str);
    linesAtValue = lines2.length;
  }
  const { start, end } = flowChars;
  if (lines2.length === 0) {
    return start + end;
  } else {
    if (!reqNewline) {
      const len = lines2.reduce((sum, line) => sum + line.length + 2, 2);
      reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
    }
    if (reqNewline) {
      let str = start;
      for (const line of lines2)
        str += line ? `
${indentStep}${indent}${line}` : "\n";
      return `${str}
${indent}${end}`;
    } else {
      return `${start}${fcPadding}${lines2.join(" ")}${fcPadding}${end}`;
    }
  }
}
function addCommentBefore({ indent, options: { commentString } }, lines2, comment, chompKeep) {
  if (comment && chompKeep)
    comment = comment.replace(/^\n+/, "");
  if (comment) {
    const ic = indentComment(commentString(comment), indent);
    lines2.push(ic.trimStart());
  }
}

// node_modules/yaml/browser/dist/nodes/YAMLMap.js
function findPair(items, key) {
  const k = isScalar(key) ? key.value : key;
  for (const it of items) {
    if (isPair(it)) {
      if (it.key === key || it.key === k)
        return it;
      if (isScalar(it.key) && it.key.value === k)
        return it;
    }
  }
  return void 0;
}
var YAMLMap = class extends Collection {
  static get tagName() {
    return "tag:yaml.org,2002:map";
  }
  constructor(schema4) {
    super(MAP, schema4);
    this.items = [];
  }
  /**
   * A generic collection parsing method that can be extended
   * to other node classes that inherit from YAMLMap
   */
  static from(schema4, obj, ctx) {
    const { keepUndefined, replacer } = ctx;
    const map2 = new this(schema4);
    const add = (key, value) => {
      if (typeof replacer === "function")
        value = replacer.call(obj, key, value);
      else if (Array.isArray(replacer) && !replacer.includes(key))
        return;
      if (value !== void 0 || keepUndefined)
        map2.items.push(createPair(key, value, ctx));
    };
    if (obj instanceof Map) {
      for (const [key, value] of obj)
        add(key, value);
    } else if (obj && typeof obj === "object") {
      for (const key of Object.keys(obj))
        add(key, obj[key]);
    }
    if (typeof schema4.sortMapEntries === "function") {
      map2.items.sort(schema4.sortMapEntries);
    }
    return map2;
  }
  /**
   * Adds a value to the collection.
   *
   * @param overwrite - If not set `true`, using a key that is already in the
   *   collection will throw. Otherwise, overwrites the previous value.
   */
  add(pair, overwrite) {
    let _pair;
    if (isPair(pair))
      _pair = pair;
    else if (!pair || typeof pair !== "object" || !("key" in pair)) {
      _pair = new Pair(pair, pair?.value);
    } else
      _pair = new Pair(pair.key, pair.value);
    const prev = findPair(this.items, _pair.key);
    const sortEntries = this.schema?.sortMapEntries;
    if (prev) {
      if (!overwrite)
        throw new Error(`Key ${_pair.key} already set`);
      if (isScalar(prev.value) && isScalarValue(_pair.value))
        prev.value.value = _pair.value;
      else
        prev.value = _pair.value;
    } else if (sortEntries) {
      const i2 = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
      if (i2 === -1)
        this.items.push(_pair);
      else
        this.items.splice(i2, 0, _pair);
    } else {
      this.items.push(_pair);
    }
  }
  delete(key) {
    const it = findPair(this.items, key);
    if (!it)
      return false;
    const del = this.items.splice(this.items.indexOf(it), 1);
    return del.length > 0;
  }
  get(key, keepScalar) {
    const it = findPair(this.items, key);
    const node2 = it?.value;
    return (!keepScalar && isScalar(node2) ? node2.value : node2) ?? void 0;
  }
  has(key) {
    return !!findPair(this.items, key);
  }
  set(key, value) {
    this.add(new Pair(key, value), true);
  }
  /**
   * @param ctx - Conversion context, originally set in Document#toJS()
   * @param {Class} Type - If set, forces the returned collection type
   * @returns Instance of Type, Map, or Object
   */
  toJSON(_, ctx, Type) {
    const map2 = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
    if (ctx?.onCreate)
      ctx.onCreate(map2);
    for (const item of this.items)
      addPairToJSMap(ctx, map2, item);
    return map2;
  }
  toString(ctx, onComment, onChompKeep) {
    if (!ctx)
      return JSON.stringify(this);
    for (const item of this.items) {
      if (!isPair(item))
        throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
    }
    if (!ctx.allNullValues && this.hasAllNullValues(false))
      ctx = Object.assign({}, ctx, { allNullValues: true });
    return stringifyCollection(this, ctx, {
      blockItemPrefix: "",
      flowChars: { start: "{", end: "}" },
      itemIndent: ctx.indent || "",
      onChompKeep,
      onComment
    });
  }
};

// node_modules/yaml/browser/dist/schema/common/map.js
var map = {
  collection: "map",
  default: true,
  nodeClass: YAMLMap,
  tag: "tag:yaml.org,2002:map",
  resolve(map2, onError) {
    if (!isMap(map2))
      onError("Expected a mapping for this tag");
    return map2;
  },
  createNode: (schema4, obj, ctx) => YAMLMap.from(schema4, obj, ctx)
};

// node_modules/yaml/browser/dist/nodes/YAMLSeq.js
var YAMLSeq = class extends Collection {
  static get tagName() {
    return "tag:yaml.org,2002:seq";
  }
  constructor(schema4) {
    super(SEQ, schema4);
    this.items = [];
  }
  add(value) {
    this.items.push(value);
  }
  /**
   * Removes a value from the collection.
   *
   * `key` must contain a representation of an integer for this to succeed.
   * It may be wrapped in a `Scalar`.
   *
   * @returns `true` if the item was found and removed.
   */
  delete(key) {
    const idx = asItemIndex(key);
    if (typeof idx !== "number")
      return false;
    const del = this.items.splice(idx, 1);
    return del.length > 0;
  }
  get(key, keepScalar) {
    const idx = asItemIndex(key);
    if (typeof idx !== "number")
      return void 0;
    const it = this.items[idx];
    return !keepScalar && isScalar(it) ? it.value : it;
  }
  /**
   * Checks if the collection includes a value with the key `key`.
   *
   * `key` must contain a representation of an integer for this to succeed.
   * It may be wrapped in a `Scalar`.
   */
  has(key) {
    const idx = asItemIndex(key);
    return typeof idx === "number" && idx < this.items.length;
  }
  /**
   * Sets a value in this collection. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   *
   * If `key` does not contain a representation of an integer, this will throw.
   * It may be wrapped in a `Scalar`.
   */
  set(key, value) {
    const idx = asItemIndex(key);
    if (typeof idx !== "number")
      throw new Error(`Expected a valid index, not ${key}.`);
    const prev = this.items[idx];
    if (isScalar(prev) && isScalarValue(value))
      prev.value = value;
    else
      this.items[idx] = value;
  }
  toJSON(_, ctx) {
    const seq2 = [];
    if (ctx?.onCreate)
      ctx.onCreate(seq2);
    let i2 = 0;
    for (const item of this.items)
      seq2.push(toJS(item, String(i2++), ctx));
    return seq2;
  }
  toString(ctx, onComment, onChompKeep) {
    if (!ctx)
      return JSON.stringify(this);
    return stringifyCollection(this, ctx, {
      blockItemPrefix: "- ",
      flowChars: { start: "[", end: "]" },
      itemIndent: (ctx.indent || "") + "  ",
      onChompKeep,
      onComment
    });
  }
  static from(schema4, obj, ctx) {
    const { replacer } = ctx;
    const seq2 = new this(schema4);
    if (obj && Symbol.iterator in Object(obj)) {
      let i2 = 0;
      for (let it of obj) {
        if (typeof replacer === "function") {
          const key = obj instanceof Set ? it : String(i2++);
          it = replacer.call(obj, key, it);
        }
        seq2.items.push(createNode(it, void 0, ctx));
      }
    }
    return seq2;
  }
};
function asItemIndex(key) {
  let idx = isScalar(key) ? key.value : key;
  if (idx && typeof idx === "string")
    idx = Number(idx);
  return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
}

// node_modules/yaml/browser/dist/schema/common/seq.js
var seq = {
  collection: "seq",
  default: true,
  nodeClass: YAMLSeq,
  tag: "tag:yaml.org,2002:seq",
  resolve(seq2, onError) {
    if (!isSeq(seq2))
      onError("Expected a sequence for this tag");
    return seq2;
  },
  createNode: (schema4, obj, ctx) => YAMLSeq.from(schema4, obj, ctx)
};

// node_modules/yaml/browser/dist/schema/common/string.js
var string = {
  identify: (value) => typeof value === "string",
  default: true,
  tag: "tag:yaml.org,2002:str",
  resolve: (str) => str,
  stringify(item, ctx, onComment, onChompKeep) {
    ctx = Object.assign({ actualString: true }, ctx);
    return stringifyString(item, ctx, onComment, onChompKeep);
  }
};

// node_modules/yaml/browser/dist/schema/common/null.js
var nullTag = {
  identify: (value) => value == null,
  createNode: () => new Scalar(null),
  default: true,
  tag: "tag:yaml.org,2002:null",
  test: /^(?:~|[Nn]ull|NULL)?$/,
  resolve: () => new Scalar(null),
  stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
};

// node_modules/yaml/browser/dist/schema/core/bool.js
var boolTag = {
  identify: (value) => typeof value === "boolean",
  default: true,
  tag: "tag:yaml.org,2002:bool",
  test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
  resolve: (str) => new Scalar(str[0] === "t" || str[0] === "T"),
  stringify({ source, value }, ctx) {
    if (source && boolTag.test.test(source)) {
      const sv = source[0] === "t" || source[0] === "T";
      if (value === sv)
        return source;
    }
    return value ? ctx.options.trueStr : ctx.options.falseStr;
  }
};

// node_modules/yaml/browser/dist/stringify/stringifyNumber.js
function stringifyNumber({ format, minFractionDigits, tag, value }) {
  if (typeof value === "bigint")
    return String(value);
  const num = typeof value === "number" ? value : Number(value);
  if (!isFinite(num))
    return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
  let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
  if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
    let i2 = n.indexOf(".");
    if (i2 < 0) {
      i2 = n.length;
      n += ".";
    }
    let d = minFractionDigits - (n.length - i2 - 1);
    while (d-- > 0)
      n += "0";
  }
  return n;
}

// node_modules/yaml/browser/dist/schema/core/float.js
var floatNaN = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
  resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
  stringify: stringifyNumber
};
var floatExp = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  format: "EXP",
  test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
  resolve: (str) => parseFloat(str),
  stringify(node2) {
    const num = Number(node2.value);
    return isFinite(num) ? num.toExponential() : stringifyNumber(node2);
  }
};
var float = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
  resolve(str) {
    const node2 = new Scalar(parseFloat(str));
    const dot = str.indexOf(".");
    if (dot !== -1 && str[str.length - 1] === "0")
      node2.minFractionDigits = str.length - dot - 1;
    return node2;
  },
  stringify: stringifyNumber
};

// node_modules/yaml/browser/dist/schema/core/int.js
var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
function intStringify(node2, radix, prefix) {
  const { value } = node2;
  if (intIdentify(value) && value >= 0)
    return prefix + value.toString(radix);
  return stringifyNumber(node2);
}
var intOct = {
  identify: (value) => intIdentify(value) && value >= 0,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "OCT",
  test: /^0o[0-7]+$/,
  resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
  stringify: (node2) => intStringify(node2, 8, "0o")
};
var int = {
  identify: intIdentify,
  default: true,
  tag: "tag:yaml.org,2002:int",
  test: /^[-+]?[0-9]+$/,
  resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
  stringify: stringifyNumber
};
var intHex = {
  identify: (value) => intIdentify(value) && value >= 0,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "HEX",
  test: /^0x[0-9a-fA-F]+$/,
  resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
  stringify: (node2) => intStringify(node2, 16, "0x")
};

// node_modules/yaml/browser/dist/schema/core/schema.js
var schema = [
  map,
  seq,
  string,
  nullTag,
  boolTag,
  intOct,
  int,
  intHex,
  floatNaN,
  floatExp,
  float
];

// node_modules/yaml/browser/dist/schema/json/schema.js
function intIdentify2(value) {
  return typeof value === "bigint" || Number.isInteger(value);
}
var stringifyJSON = ({ value }) => JSON.stringify(value);
var jsonScalars = [
  {
    identify: (value) => typeof value === "string",
    default: true,
    tag: "tag:yaml.org,2002:str",
    resolve: (str) => str,
    stringify: stringifyJSON
  },
  {
    identify: (value) => value == null,
    createNode: () => new Scalar(null),
    default: true,
    tag: "tag:yaml.org,2002:null",
    test: /^null$/,
    resolve: () => null,
    stringify: stringifyJSON
  },
  {
    identify: (value) => typeof value === "boolean",
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^true$|^false$/,
    resolve: (str) => str === "true",
    stringify: stringifyJSON
  },
  {
    identify: intIdentify2,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^-?(?:0|[1-9][0-9]*)$/,
    resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
    stringify: ({ value }) => intIdentify2(value) ? value.toString() : JSON.stringify(value)
  },
  {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
    resolve: (str) => parseFloat(str),
    stringify: stringifyJSON
  }
];
var jsonError = {
  default: true,
  tag: "",
  test: /^/,
  resolve(str, onError) {
    onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
    return str;
  }
};
var schema2 = [map, seq].concat(jsonScalars, jsonError);

// node_modules/yaml/browser/dist/schema/yaml-1.1/binary.js
var binary = {
  identify: (value) => value instanceof Uint8Array,
  // Buffer inherits from Uint8Array
  default: false,
  tag: "tag:yaml.org,2002:binary",
  /**
   * Returns a Buffer in node and an Uint8Array in browsers
   *
   * To use the resulting buffer as an image, you'll want to do something like:
   *
   *   const blob = new Blob([buffer], { type: 'image/jpeg' })
   *   document.querySelector('#photo').src = URL.createObjectURL(blob)
   */
  resolve(src, onError) {
    if (typeof atob === "function") {
      const str = atob(src.replace(/[\n\r]/g, ""));
      const buffer = new Uint8Array(str.length);
      for (let i2 = 0; i2 < str.length; ++i2)
        buffer[i2] = str.charCodeAt(i2);
      return buffer;
    } else {
      onError("This environment does not support reading binary tags; either Buffer or atob is required");
      return src;
    }
  },
  stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
    if (!value)
      return "";
    const buf = value;
    let str;
    if (typeof btoa === "function") {
      let s = "";
      for (let i2 = 0; i2 < buf.length; ++i2)
        s += String.fromCharCode(buf[i2]);
      str = btoa(s);
    } else {
      throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
    }
    type ?? (type = Scalar.BLOCK_LITERAL);
    if (type !== Scalar.QUOTE_DOUBLE) {
      const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
      const n = Math.ceil(str.length / lineWidth);
      const lines2 = new Array(n);
      for (let i2 = 0, o = 0; i2 < n; ++i2, o += lineWidth) {
        lines2[i2] = str.substr(o, lineWidth);
      }
      str = lines2.join(type === Scalar.BLOCK_LITERAL ? "\n" : " ");
    }
    return stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
  }
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/pairs.js
function resolvePairs(seq2, onError) {
  if (isSeq(seq2)) {
    for (let i2 = 0; i2 < seq2.items.length; ++i2) {
      let item = seq2.items[i2];
      if (isPair(item))
        continue;
      else if (isMap(item)) {
        if (item.items.length > 1)
          onError("Each pair must have its own sequence indicator");
        const pair = item.items[0] || new Pair(new Scalar(null));
        if (item.commentBefore)
          pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
        if (item.comment) {
          const cn = pair.value ?? pair.key;
          cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
        }
        item = pair;
      }
      seq2.items[i2] = isPair(item) ? item : new Pair(item);
    }
  } else
    onError("Expected a sequence for this tag");
  return seq2;
}
function createPairs(schema4, iterable, ctx) {
  const { replacer } = ctx;
  const pairs2 = new YAMLSeq(schema4);
  pairs2.tag = "tag:yaml.org,2002:pairs";
  let i2 = 0;
  if (iterable && Symbol.iterator in Object(iterable))
    for (let it of iterable) {
      if (typeof replacer === "function")
        it = replacer.call(iterable, String(i2++), it);
      let key, value;
      if (Array.isArray(it)) {
        if (it.length === 2) {
          key = it[0];
          value = it[1];
        } else
          throw new TypeError(`Expected [key, value] tuple: ${it}`);
      } else if (it && it instanceof Object) {
        const keys = Object.keys(it);
        if (keys.length === 1) {
          key = keys[0];
          value = it[key];
        } else {
          throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
        }
      } else {
        key = it;
      }
      pairs2.items.push(createPair(key, value, ctx));
    }
  return pairs2;
}
var pairs = {
  collection: "seq",
  default: false,
  tag: "tag:yaml.org,2002:pairs",
  resolve: resolvePairs,
  createNode: createPairs
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/omap.js
var YAMLOMap = class _YAMLOMap extends YAMLSeq {
  constructor() {
    super();
    this.add = YAMLMap.prototype.add.bind(this);
    this.delete = YAMLMap.prototype.delete.bind(this);
    this.get = YAMLMap.prototype.get.bind(this);
    this.has = YAMLMap.prototype.has.bind(this);
    this.set = YAMLMap.prototype.set.bind(this);
    this.tag = _YAMLOMap.tag;
  }
  /**
   * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
   * but TypeScript won't allow widening the signature of a child method.
   */
  toJSON(_, ctx) {
    if (!ctx)
      return super.toJSON(_);
    const map2 = /* @__PURE__ */ new Map();
    if (ctx?.onCreate)
      ctx.onCreate(map2);
    for (const pair of this.items) {
      let key, value;
      if (isPair(pair)) {
        key = toJS(pair.key, "", ctx);
        value = toJS(pair.value, key, ctx);
      } else {
        key = toJS(pair, "", ctx);
      }
      if (map2.has(key))
        throw new Error("Ordered maps must not include duplicate keys");
      map2.set(key, value);
    }
    return map2;
  }
  static from(schema4, iterable, ctx) {
    const pairs2 = createPairs(schema4, iterable, ctx);
    const omap2 = new this();
    omap2.items = pairs2.items;
    return omap2;
  }
};
YAMLOMap.tag = "tag:yaml.org,2002:omap";
var omap = {
  collection: "seq",
  identify: (value) => value instanceof Map,
  nodeClass: YAMLOMap,
  default: false,
  tag: "tag:yaml.org,2002:omap",
  resolve(seq2, onError) {
    const pairs2 = resolvePairs(seq2, onError);
    const seenKeys = [];
    for (const { key } of pairs2.items) {
      if (isScalar(key)) {
        if (seenKeys.includes(key.value)) {
          onError(`Ordered maps must not include duplicate keys: ${key.value}`);
        } else {
          seenKeys.push(key.value);
        }
      }
    }
    return Object.assign(new YAMLOMap(), pairs2);
  },
  createNode: (schema4, iterable, ctx) => YAMLOMap.from(schema4, iterable, ctx)
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/bool.js
function boolStringify({ value, source }, ctx) {
  const boolObj = value ? trueTag : falseTag;
  if (source && boolObj.test.test(source))
    return source;
  return value ? ctx.options.trueStr : ctx.options.falseStr;
}
var trueTag = {
  identify: (value) => value === true,
  default: true,
  tag: "tag:yaml.org,2002:bool",
  test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
  resolve: () => new Scalar(true),
  stringify: boolStringify
};
var falseTag = {
  identify: (value) => value === false,
  default: true,
  tag: "tag:yaml.org,2002:bool",
  test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
  resolve: () => new Scalar(false),
  stringify: boolStringify
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/float.js
var floatNaN2 = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
  resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
  stringify: stringifyNumber
};
var floatExp2 = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  format: "EXP",
  test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
  resolve: (str) => parseFloat(str.replace(/_/g, "")),
  stringify(node2) {
    const num = Number(node2.value);
    return isFinite(num) ? num.toExponential() : stringifyNumber(node2);
  }
};
var float2 = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
  resolve(str) {
    const node2 = new Scalar(parseFloat(str.replace(/_/g, "")));
    const dot = str.indexOf(".");
    if (dot !== -1) {
      const f = str.substring(dot + 1).replace(/_/g, "");
      if (f[f.length - 1] === "0")
        node2.minFractionDigits = f.length;
    }
    return node2;
  },
  stringify: stringifyNumber
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/int.js
var intIdentify3 = (value) => typeof value === "bigint" || Number.isInteger(value);
function intResolve2(str, offset, radix, { intAsBigInt }) {
  const sign = str[0];
  if (sign === "-" || sign === "+")
    offset += 1;
  str = str.substring(offset).replace(/_/g, "");
  if (intAsBigInt) {
    switch (radix) {
      case 2:
        str = `0b${str}`;
        break;
      case 8:
        str = `0o${str}`;
        break;
      case 16:
        str = `0x${str}`;
        break;
    }
    const n2 = BigInt(str);
    return sign === "-" ? BigInt(-1) * n2 : n2;
  }
  const n = parseInt(str, radix);
  return sign === "-" ? -1 * n : n;
}
function intStringify2(node2, radix, prefix) {
  const { value } = node2;
  if (intIdentify3(value)) {
    const str = value.toString(radix);
    return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
  }
  return stringifyNumber(node2);
}
var intBin = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "BIN",
  test: /^[-+]?0b[0-1_]+$/,
  resolve: (str, _onError, opt) => intResolve2(str, 2, 2, opt),
  stringify: (node2) => intStringify2(node2, 2, "0b")
};
var intOct2 = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "OCT",
  test: /^[-+]?0[0-7_]+$/,
  resolve: (str, _onError, opt) => intResolve2(str, 1, 8, opt),
  stringify: (node2) => intStringify2(node2, 8, "0")
};
var int2 = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  test: /^[-+]?[0-9][0-9_]*$/,
  resolve: (str, _onError, opt) => intResolve2(str, 0, 10, opt),
  stringify: stringifyNumber
};
var intHex2 = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "HEX",
  test: /^[-+]?0x[0-9a-fA-F_]+$/,
  resolve: (str, _onError, opt) => intResolve2(str, 2, 16, opt),
  stringify: (node2) => intStringify2(node2, 16, "0x")
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/set.js
var YAMLSet = class _YAMLSet extends YAMLMap {
  constructor(schema4) {
    super(schema4);
    this.tag = _YAMLSet.tag;
  }
  add(key) {
    let pair;
    if (isPair(key))
      pair = key;
    else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
      pair = new Pair(key.key, null);
    else
      pair = new Pair(key, null);
    const prev = findPair(this.items, pair.key);
    if (!prev)
      this.items.push(pair);
  }
  /**
   * If `keepPair` is `true`, returns the Pair matching `key`.
   * Otherwise, returns the value of that Pair's key.
   */
  get(key, keepPair) {
    const pair = findPair(this.items, key);
    return !keepPair && isPair(pair) ? isScalar(pair.key) ? pair.key.value : pair.key : pair;
  }
  set(key, value) {
    if (typeof value !== "boolean")
      throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
    const prev = findPair(this.items, key);
    if (prev && !value) {
      this.items.splice(this.items.indexOf(prev), 1);
    } else if (!prev && value) {
      this.items.push(new Pair(key));
    }
  }
  toJSON(_, ctx) {
    return super.toJSON(_, ctx, Set);
  }
  toString(ctx, onComment, onChompKeep) {
    if (!ctx)
      return JSON.stringify(this);
    if (this.hasAllNullValues(true))
      return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
    else
      throw new Error("Set items must all have null values");
  }
  static from(schema4, iterable, ctx) {
    const { replacer } = ctx;
    const set2 = new this(schema4);
    if (iterable && Symbol.iterator in Object(iterable))
      for (let value of iterable) {
        if (typeof replacer === "function")
          value = replacer.call(iterable, value, value);
        set2.items.push(createPair(value, null, ctx));
      }
    return set2;
  }
};
YAMLSet.tag = "tag:yaml.org,2002:set";
var set = {
  collection: "map",
  identify: (value) => value instanceof Set,
  nodeClass: YAMLSet,
  default: false,
  tag: "tag:yaml.org,2002:set",
  createNode: (schema4, iterable, ctx) => YAMLSet.from(schema4, iterable, ctx),
  resolve(map2, onError) {
    if (isMap(map2)) {
      if (map2.hasAllNullValues(true))
        return Object.assign(new YAMLSet(), map2);
      else
        onError("Set items must all have null values");
    } else
      onError("Expected a mapping for this tag");
    return map2;
  }
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/timestamp.js
function parseSexagesimal(str, asBigInt) {
  const sign = str[0];
  const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
  const num = (n) => asBigInt ? BigInt(n) : Number(n);
  const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
  return sign === "-" ? num(-1) * res : res;
}
function stringifySexagesimal(node2) {
  let { value } = node2;
  let num = (n) => n;
  if (typeof value === "bigint")
    num = (n) => BigInt(n);
  else if (isNaN(value) || !isFinite(value))
    return stringifyNumber(node2);
  let sign = "";
  if (value < 0) {
    sign = "-";
    value *= num(-1);
  }
  const _60 = num(60);
  const parts = [value % _60];
  if (value < 60) {
    parts.unshift(0);
  } else {
    value = (value - parts[0]) / _60;
    parts.unshift(value % _60);
    if (value >= 60) {
      value = (value - parts[0]) / _60;
      parts.unshift(value);
    }
  }
  return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
}
var intTime = {
  identify: (value) => typeof value === "bigint" || Number.isInteger(value),
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "TIME",
  test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
  resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
  stringify: stringifySexagesimal
};
var floatTime = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  format: "TIME",
  test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
  resolve: (str) => parseSexagesimal(str, false),
  stringify: stringifySexagesimal
};
var timestamp = {
  identify: (value) => value instanceof Date,
  default: true,
  tag: "tag:yaml.org,2002:timestamp",
  // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
  // may be omitted altogether, resulting in a date format. In such a case, the time part is
  // assumed to be 00:00:00Z (start of day, UTC).
  test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
  resolve(str) {
    const match = str.match(timestamp.test);
    if (!match)
      throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
    const [, year, month, day, hour, minute, second] = match.map(Number);
    const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
    let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
    const tz = match[8];
    if (tz && tz !== "Z") {
      let d = parseSexagesimal(tz, false);
      if (Math.abs(d) < 30)
        d *= 60;
      date -= 6e4 * d;
    }
    return new Date(date);
  },
  stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/schema.js
var schema3 = [
  map,
  seq,
  string,
  nullTag,
  trueTag,
  falseTag,
  intBin,
  intOct2,
  int2,
  intHex2,
  floatNaN2,
  floatExp2,
  float2,
  binary,
  merge,
  omap,
  pairs,
  set,
  intTime,
  floatTime,
  timestamp
];

// node_modules/yaml/browser/dist/schema/tags.js
var schemas = /* @__PURE__ */ new Map([
  ["core", schema],
  ["failsafe", [map, seq, string]],
  ["json", schema2],
  ["yaml11", schema3],
  ["yaml-1.1", schema3]
]);
var tagsByName = {
  binary,
  bool: boolTag,
  float,
  floatExp,
  floatNaN,
  floatTime,
  int,
  intHex,
  intOct,
  intTime,
  map,
  merge,
  null: nullTag,
  omap,
  pairs,
  seq,
  set,
  timestamp
};
var coreKnownTags = {
  "tag:yaml.org,2002:binary": binary,
  "tag:yaml.org,2002:merge": merge,
  "tag:yaml.org,2002:omap": omap,
  "tag:yaml.org,2002:pairs": pairs,
  "tag:yaml.org,2002:set": set,
  "tag:yaml.org,2002:timestamp": timestamp
};
function getTags(customTags, schemaName, addMergeTag) {
  const schemaTags = schemas.get(schemaName);
  if (schemaTags && !customTags) {
    return addMergeTag && !schemaTags.includes(merge) ? schemaTags.concat(merge) : schemaTags.slice();
  }
  let tags = schemaTags;
  if (!tags) {
    if (Array.isArray(customTags))
      tags = [];
    else {
      const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
      throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
    }
  }
  if (Array.isArray(customTags)) {
    for (const tag of customTags)
      tags = tags.concat(tag);
  } else if (typeof customTags === "function") {
    tags = customTags(tags.slice());
  }
  if (addMergeTag)
    tags = tags.concat(merge);
  return tags.reduce((tags2, tag) => {
    const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
    if (!tagObj) {
      const tagName = JSON.stringify(tag);
      const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
      throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
    }
    if (!tags2.includes(tagObj))
      tags2.push(tagObj);
    return tags2;
  }, []);
}

// node_modules/yaml/browser/dist/schema/Schema.js
var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
var Schema = class _Schema {
  constructor({ compat, customTags, merge: merge2, resolveKnownTags, schema: schema4, sortMapEntries, toStringDefaults }) {
    this.compat = Array.isArray(compat) ? getTags(compat, "compat") : compat ? getTags(null, compat) : null;
    this.name = typeof schema4 === "string" && schema4 || "core";
    this.knownTags = resolveKnownTags ? coreKnownTags : {};
    this.tags = getTags(customTags, this.name, merge2);
    this.toStringOptions = toStringDefaults ?? null;
    Object.defineProperty(this, MAP, { value: map });
    Object.defineProperty(this, SCALAR, { value: string });
    Object.defineProperty(this, SEQ, { value: seq });
    this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
  }
  clone() {
    const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
    copy.tags = this.tags.slice();
    return copy;
  }
};

// node_modules/yaml/browser/dist/stringify/stringifyDocument.js
function stringifyDocument(doc, options) {
  const lines2 = [];
  let hasDirectives = options.directives === true;
  if (options.directives !== false && doc.directives) {
    const dir = doc.directives.toString(doc);
    if (dir) {
      lines2.push(dir);
      hasDirectives = true;
    } else if (doc.directives.docStart)
      hasDirectives = true;
  }
  if (hasDirectives)
    lines2.push("---");
  const ctx = createStringifyContext(doc, options);
  const { commentString } = ctx.options;
  if (doc.commentBefore) {
    if (lines2.length !== 1)
      lines2.unshift("");
    const cs = commentString(doc.commentBefore);
    lines2.unshift(indentComment(cs, ""));
  }
  let chompKeep = false;
  let contentComment = null;
  if (doc.contents) {
    if (isNode(doc.contents)) {
      if (doc.contents.spaceBefore && hasDirectives)
        lines2.push("");
      if (doc.contents.commentBefore) {
        const cs = commentString(doc.contents.commentBefore);
        lines2.push(indentComment(cs, ""));
      }
      ctx.forceBlockIndent = !!doc.comment;
      contentComment = doc.contents.comment;
    }
    const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
    let body = stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
    if (contentComment)
      body += lineComment(body, "", commentString(contentComment));
    if ((body[0] === "|" || body[0] === ">") && lines2[lines2.length - 1] === "---") {
      lines2[lines2.length - 1] = `--- ${body}`;
    } else
      lines2.push(body);
  } else {
    lines2.push(stringify(doc.contents, ctx));
  }
  if (doc.directives?.docEnd) {
    if (doc.comment) {
      const cs = commentString(doc.comment);
      if (cs.includes("\n")) {
        lines2.push("...");
        lines2.push(indentComment(cs, ""));
      } else {
        lines2.push(`... ${cs}`);
      }
    } else {
      lines2.push("...");
    }
  } else {
    let dc = doc.comment;
    if (dc && chompKeep)
      dc = dc.replace(/^\n+/, "");
    if (dc) {
      if ((!chompKeep || contentComment) && lines2[lines2.length - 1] !== "")
        lines2.push("");
      lines2.push(indentComment(commentString(dc), ""));
    }
  }
  return lines2.join("\n") + "\n";
}

// node_modules/yaml/browser/dist/doc/Document.js
var Document = class _Document {
  constructor(value, replacer, options) {
    this.commentBefore = null;
    this.comment = null;
    this.errors = [];
    this.warnings = [];
    Object.defineProperty(this, NODE_TYPE, { value: DOC });
    let _replacer = null;
    if (typeof replacer === "function" || Array.isArray(replacer)) {
      _replacer = replacer;
    } else if (options === void 0 && replacer) {
      options = replacer;
      replacer = void 0;
    }
    const opt = Object.assign({
      intAsBigInt: false,
      keepSourceTokens: false,
      logLevel: "warn",
      prettyErrors: true,
      strict: true,
      stringKeys: false,
      uniqueKeys: true,
      version: "1.2"
    }, options);
    this.options = opt;
    let { version } = opt;
    if (options?._directives) {
      this.directives = options._directives.atDocument();
      if (this.directives.yaml.explicit)
        version = this.directives.yaml.version;
    } else
      this.directives = new Directives({ version });
    this.setSchema(version, options);
    this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
  }
  /**
   * Create a deep copy of this Document and its contents.
   *
   * Custom Node values that inherit from `Object` still refer to their original instances.
   */
  clone() {
    const copy = Object.create(_Document.prototype, {
      [NODE_TYPE]: { value: DOC }
    });
    copy.commentBefore = this.commentBefore;
    copy.comment = this.comment;
    copy.errors = this.errors.slice();
    copy.warnings = this.warnings.slice();
    copy.options = Object.assign({}, this.options);
    if (this.directives)
      copy.directives = this.directives.clone();
    copy.schema = this.schema.clone();
    copy.contents = isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
    if (this.range)
      copy.range = this.range.slice();
    return copy;
  }
  /** Adds a value to the document. */
  add(value) {
    if (assertCollection(this.contents))
      this.contents.add(value);
  }
  /** Adds a value to the document. */
  addIn(path, value) {
    if (assertCollection(this.contents))
      this.contents.addIn(path, value);
  }
  /**
   * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
   *
   * If `node` already has an anchor, `name` is ignored.
   * Otherwise, the `node.anchor` value will be set to `name`,
   * or if an anchor with that name is already present in the document,
   * `name` will be used as a prefix for a new unique anchor.
   * If `name` is undefined, the generated anchor will use 'a' as a prefix.
   */
  createAlias(node2, name) {
    if (!node2.anchor) {
      const prev = anchorNames(this);
      node2.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      !name || prev.has(name) ? findNewAnchor(name || "a", prev) : name;
    }
    return new Alias(node2.anchor);
  }
  createNode(value, replacer, options) {
    let _replacer = void 0;
    if (typeof replacer === "function") {
      value = replacer.call({ "": value }, "", value);
      _replacer = replacer;
    } else if (Array.isArray(replacer)) {
      const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
      const asStr = replacer.filter(keyToStr).map(String);
      if (asStr.length > 0)
        replacer = replacer.concat(asStr);
      _replacer = replacer;
    } else if (options === void 0 && replacer) {
      options = replacer;
      replacer = void 0;
    }
    const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
    const { onAnchor, setAnchors, sourceObjects } = createNodeAnchors(
      this,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      anchorPrefix || "a"
    );
    const ctx = {
      aliasDuplicateObjects: aliasDuplicateObjects ?? true,
      keepUndefined: keepUndefined ?? false,
      onAnchor,
      onTagObj,
      replacer: _replacer,
      schema: this.schema,
      sourceObjects
    };
    const node2 = createNode(value, tag, ctx);
    if (flow && isCollection(node2))
      node2.flow = true;
    setAnchors();
    return node2;
  }
  /**
   * Convert a key and a value into a `Pair` using the current schema,
   * recursively wrapping all values as `Scalar` or `Collection` nodes.
   */
  createPair(key, value, options = {}) {
    const k = this.createNode(key, null, options);
    const v = this.createNode(value, null, options);
    return new Pair(k, v);
  }
  /**
   * Removes a value from the document.
   * @returns `true` if the item was found and removed.
   */
  delete(key) {
    return assertCollection(this.contents) ? this.contents.delete(key) : false;
  }
  /**
   * Removes a value from the document.
   * @returns `true` if the item was found and removed.
   */
  deleteIn(path) {
    if (isEmptyPath(path)) {
      if (this.contents == null)
        return false;
      this.contents = null;
      return true;
    }
    return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
  }
  /**
   * Returns item at `key`, or `undefined` if not found. By default unwraps
   * scalar values from their surrounding node; to disable set `keepScalar` to
   * `true` (collections are always returned intact).
   */
  get(key, keepScalar) {
    return isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
  }
  /**
   * Returns item at `path`, or `undefined` if not found. By default unwraps
   * scalar values from their surrounding node; to disable set `keepScalar` to
   * `true` (collections are always returned intact).
   */
  getIn(path, keepScalar) {
    if (isEmptyPath(path))
      return !keepScalar && isScalar(this.contents) ? this.contents.value : this.contents;
    return isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
  }
  /**
   * Checks if the document includes a value with the key `key`.
   */
  has(key) {
    return isCollection(this.contents) ? this.contents.has(key) : false;
  }
  /**
   * Checks if the document includes a value at `path`.
   */
  hasIn(path) {
    if (isEmptyPath(path))
      return this.contents !== void 0;
    return isCollection(this.contents) ? this.contents.hasIn(path) : false;
  }
  /**
   * Sets a value in this document. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   */
  set(key, value) {
    if (this.contents == null) {
      this.contents = collectionFromPath(this.schema, [key], value);
    } else if (assertCollection(this.contents)) {
      this.contents.set(key, value);
    }
  }
  /**
   * Sets a value in this document. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   */
  setIn(path, value) {
    if (isEmptyPath(path)) {
      this.contents = value;
    } else if (this.contents == null) {
      this.contents = collectionFromPath(this.schema, Array.from(path), value);
    } else if (assertCollection(this.contents)) {
      this.contents.setIn(path, value);
    }
  }
  /**
   * Change the YAML version and schema used by the document.
   * A `null` version disables support for directives, explicit tags, anchors, and aliases.
   * It also requires the `schema` option to be given as a `Schema` instance value.
   *
   * Overrides all previously set schema options.
   */
  setSchema(version, options = {}) {
    if (typeof version === "number")
      version = String(version);
    let opt;
    switch (version) {
      case "1.1":
        if (this.directives)
          this.directives.yaml.version = "1.1";
        else
          this.directives = new Directives({ version: "1.1" });
        opt = { resolveKnownTags: false, schema: "yaml-1.1" };
        break;
      case "1.2":
      case "next":
        if (this.directives)
          this.directives.yaml.version = version;
        else
          this.directives = new Directives({ version });
        opt = { resolveKnownTags: true, schema: "core" };
        break;
      case null:
        if (this.directives)
          delete this.directives;
        opt = null;
        break;
      default: {
        const sv = JSON.stringify(version);
        throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
      }
    }
    if (options.schema instanceof Object)
      this.schema = options.schema;
    else if (opt)
      this.schema = new Schema(Object.assign(opt, options));
    else
      throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
  }
  // json & jsonArg are only used from toJSON()
  toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
    const ctx = {
      anchors: /* @__PURE__ */ new Map(),
      doc: this,
      keep: !json,
      mapAsMap: mapAsMap === true,
      mapKeyWarned: false,
      maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
    };
    const res = toJS(this.contents, jsonArg ?? "", ctx);
    if (typeof onAnchor === "function")
      for (const { count: count2, res: res2 } of ctx.anchors.values())
        onAnchor(res2, count2);
    return typeof reviver === "function" ? applyReviver(reviver, { "": res }, "", res) : res;
  }
  /**
   * A JSON representation of the document `contents`.
   *
   * @param jsonArg Used by `JSON.stringify` to indicate the array index or
   *   property name.
   */
  toJSON(jsonArg, onAnchor) {
    return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
  }
  /** A YAML representation of the document. */
  toString(options = {}) {
    if (this.errors.length > 0)
      throw new Error("Document with errors cannot be stringified");
    if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
      const s = JSON.stringify(options.indent);
      throw new Error(`"indent" option must be a positive integer, not ${s}`);
    }
    return stringifyDocument(this, options);
  }
};
function assertCollection(contents) {
  if (isCollection(contents))
    return true;
  throw new Error("Expected a YAML collection as document contents");
}

// node_modules/yaml/browser/dist/errors.js
var YAMLError = class extends Error {
  constructor(name, pos, code, message) {
    super();
    this.name = name;
    this.code = code;
    this.message = message;
    this.pos = pos;
  }
};
var YAMLParseError = class extends YAMLError {
  constructor(pos, code, message) {
    super("YAMLParseError", pos, code, message);
  }
};
var YAMLWarning = class extends YAMLError {
  constructor(pos, code, message) {
    super("YAMLWarning", pos, code, message);
  }
};
var prettifyError = (src, lc2) => (error) => {
  if (error.pos[0] === -1)
    return;
  error.linePos = error.pos.map((pos) => lc2.linePos(pos));
  const { line, col } = error.linePos[0];
  error.message += ` at line ${line}, column ${col}`;
  let ci = col - 1;
  let lineStr = src.substring(lc2.lineStarts[line - 1], lc2.lineStarts[line]).replace(/[\n\r]+$/, "");
  if (ci >= 60 && lineStr.length > 80) {
    const trimStart = Math.min(ci - 39, lineStr.length - 79);
    lineStr = "…" + lineStr.substring(trimStart);
    ci -= trimStart - 1;
  }
  if (lineStr.length > 80)
    lineStr = lineStr.substring(0, 79) + "…";
  if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
    let prev = src.substring(lc2.lineStarts[line - 2], lc2.lineStarts[line - 1]);
    if (prev.length > 80)
      prev = prev.substring(0, 79) + "…\n";
    lineStr = prev + lineStr;
  }
  if (/[^ ]/.test(lineStr)) {
    let count2 = 1;
    const end = error.linePos[1];
    if (end?.line === line && end.col > col) {
      count2 = Math.max(1, Math.min(end.col - col, 80 - ci));
    }
    const pointer = " ".repeat(ci) + "^".repeat(count2);
    error.message += `:

${lineStr}
${pointer}
`;
  }
};

// node_modules/yaml/browser/dist/compose/resolve-props.js
function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
  let spaceBefore = false;
  let atNewline = startOnNewline;
  let hasSpace = startOnNewline;
  let comment = "";
  let commentSep = "";
  let hasNewline = false;
  let reqSpace = false;
  let tab = null;
  let anchor = null;
  let tag = null;
  let newlineAfterProp = null;
  let comma = null;
  let found = null;
  let start = null;
  for (const token of tokens) {
    if (reqSpace) {
      if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
        onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      reqSpace = false;
    }
    if (tab) {
      if (atNewline && token.type !== "comment" && token.type !== "newline") {
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      }
      tab = null;
    }
    switch (token.type) {
      case "space":
        if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
          tab = token;
        }
        hasSpace = true;
        break;
      case "comment": {
        if (!hasSpace)
          onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
        const cb = token.source.substring(1) || " ";
        if (!comment)
          comment = cb;
        else
          comment += commentSep + cb;
        commentSep = "";
        atNewline = false;
        break;
      }
      case "newline":
        if (atNewline) {
          if (comment)
            comment += token.source;
          else if (!found || indicator !== "seq-item-ind")
            spaceBefore = true;
        } else
          commentSep += token.source;
        atNewline = true;
        hasNewline = true;
        if (anchor || tag)
          newlineAfterProp = token;
        hasSpace = true;
        break;
      case "anchor":
        if (anchor)
          onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
        if (token.source.endsWith(":"))
          onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
        anchor = token;
        start ?? (start = token.offset);
        atNewline = false;
        hasSpace = false;
        reqSpace = true;
        break;
      case "tag": {
        if (tag)
          onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
        tag = token;
        start ?? (start = token.offset);
        atNewline = false;
        hasSpace = false;
        reqSpace = true;
        break;
      }
      case indicator:
        if (anchor || tag)
          onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
        if (found)
          onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
        found = token;
        atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
        hasSpace = false;
        break;
      case "comma":
        if (flow) {
          if (comma)
            onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
          comma = token;
          atNewline = false;
          hasSpace = false;
          break;
        }
      // else fallthrough
      default:
        onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
        atNewline = false;
        hasSpace = false;
    }
  }
  const last = tokens[tokens.length - 1];
  const end = last ? last.offset + last.source.length : offset;
  if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
    onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
  }
  if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
    onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
  return {
    comma,
    found,
    spaceBefore,
    comment,
    hasNewline,
    anchor,
    tag,
    newlineAfterProp,
    end,
    start: start ?? end
  };
}

// node_modules/yaml/browser/dist/compose/util-contains-newline.js
function containsNewline(key) {
  if (!key)
    return null;
  switch (key.type) {
    case "alias":
    case "scalar":
    case "double-quoted-scalar":
    case "single-quoted-scalar":
      if (key.source.includes("\n"))
        return true;
      if (key.end) {
        for (const st of key.end)
          if (st.type === "newline")
            return true;
      }
      return false;
    case "flow-collection":
      for (const it of key.items) {
        for (const st of it.start)
          if (st.type === "newline")
            return true;
        if (it.sep) {
          for (const st of it.sep)
            if (st.type === "newline")
              return true;
        }
        if (containsNewline(it.key) || containsNewline(it.value))
          return true;
      }
      return false;
    default:
      return true;
  }
}

// node_modules/yaml/browser/dist/compose/util-flow-indent-check.js
function flowIndentCheck(indent, fc, onError) {
  if (fc?.type === "flow-collection") {
    const end = fc.end[0];
    if (end.indent === indent && (end.source === "]" || end.source === "}") && containsNewline(fc)) {
      const msg = "Flow end indicator should be more indented than parent";
      onError(end, "BAD_INDENT", msg, true);
    }
  }
}

// node_modules/yaml/browser/dist/compose/util-map-includes.js
function mapIncludes(ctx, items, search) {
  const { uniqueKeys } = ctx.options;
  if (uniqueKeys === false)
    return false;
  const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || isScalar(a) && isScalar(b) && a.value === b.value;
  return items.some((pair) => isEqual(pair.key, search));
}

// node_modules/yaml/browser/dist/compose/resolve-block-map.js
var startColMsg = "All mapping items must start at the same column";
function resolveBlockMap({ composeNode: composeNode2, composeEmptyNode: composeEmptyNode2 }, ctx, bm, onError, tag) {
  const NodeClass = tag?.nodeClass ?? YAMLMap;
  const map2 = new NodeClass(ctx.schema);
  if (ctx.atRoot)
    ctx.atRoot = false;
  let offset = bm.offset;
  let commentEnd = null;
  for (const collItem of bm.items) {
    const { start, key, sep, value } = collItem;
    const keyProps = resolveProps(start, {
      indicator: "explicit-key-ind",
      next: key ?? sep?.[0],
      offset,
      onError,
      parentIndent: bm.indent,
      startOnNewline: true
    });
    const implicitKey = !keyProps.found;
    if (implicitKey) {
      if (key) {
        if (key.type === "block-seq")
          onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
        else if ("indent" in key && key.indent !== bm.indent)
          onError(offset, "BAD_INDENT", startColMsg);
      }
      if (!keyProps.anchor && !keyProps.tag && !sep) {
        commentEnd = keyProps.end;
        if (keyProps.comment) {
          if (map2.comment)
            map2.comment += "\n" + keyProps.comment;
          else
            map2.comment = keyProps.comment;
        }
        continue;
      }
      if (keyProps.newlineAfterProp || containsNewline(key)) {
        onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
      }
    } else if (keyProps.found?.indent !== bm.indent) {
      onError(offset, "BAD_INDENT", startColMsg);
    }
    ctx.atKey = true;
    const keyStart = keyProps.end;
    const keyNode = key ? composeNode2(ctx, key, keyProps, onError) : composeEmptyNode2(ctx, keyStart, start, null, keyProps, onError);
    if (ctx.schema.compat)
      flowIndentCheck(bm.indent, key, onError);
    ctx.atKey = false;
    if (mapIncludes(ctx, map2.items, keyNode))
      onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
    const valueProps = resolveProps(sep ?? [], {
      indicator: "map-value-ind",
      next: value,
      offset: keyNode.range[2],
      onError,
      parentIndent: bm.indent,
      startOnNewline: !key || key.type === "block-scalar"
    });
    offset = valueProps.end;
    if (valueProps.found) {
      if (implicitKey) {
        if (value?.type === "block-map" && !valueProps.hasNewline)
          onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
        if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
          onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
      }
      const valueNode = value ? composeNode2(ctx, value, valueProps, onError) : composeEmptyNode2(ctx, offset, sep, null, valueProps, onError);
      if (ctx.schema.compat)
        flowIndentCheck(bm.indent, value, onError);
      offset = valueNode.range[2];
      const pair = new Pair(keyNode, valueNode);
      if (ctx.options.keepSourceTokens)
        pair.srcToken = collItem;
      map2.items.push(pair);
    } else {
      if (implicitKey)
        onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
      if (valueProps.comment) {
        if (keyNode.comment)
          keyNode.comment += "\n" + valueProps.comment;
        else
          keyNode.comment = valueProps.comment;
      }
      const pair = new Pair(keyNode);
      if (ctx.options.keepSourceTokens)
        pair.srcToken = collItem;
      map2.items.push(pair);
    }
  }
  if (commentEnd && commentEnd < offset)
    onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
  map2.range = [bm.offset, offset, commentEnd ?? offset];
  return map2;
}

// node_modules/yaml/browser/dist/compose/resolve-block-seq.js
function resolveBlockSeq({ composeNode: composeNode2, composeEmptyNode: composeEmptyNode2 }, ctx, bs, onError, tag) {
  const NodeClass = tag?.nodeClass ?? YAMLSeq;
  const seq2 = new NodeClass(ctx.schema);
  if (ctx.atRoot)
    ctx.atRoot = false;
  if (ctx.atKey)
    ctx.atKey = false;
  let offset = bs.offset;
  let commentEnd = null;
  for (const { start, value } of bs.items) {
    const props = resolveProps(start, {
      indicator: "seq-item-ind",
      next: value,
      offset,
      onError,
      parentIndent: bs.indent,
      startOnNewline: true
    });
    if (!props.found) {
      if (props.anchor || props.tag || value) {
        if (value?.type === "block-seq")
          onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
        else
          onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
      } else {
        commentEnd = props.end;
        if (props.comment)
          seq2.comment = props.comment;
        continue;
      }
    }
    const node2 = value ? composeNode2(ctx, value, props, onError) : composeEmptyNode2(ctx, props.end, start, null, props, onError);
    if (ctx.schema.compat)
      flowIndentCheck(bs.indent, value, onError);
    offset = node2.range[2];
    seq2.items.push(node2);
  }
  seq2.range = [bs.offset, offset, commentEnd ?? offset];
  return seq2;
}

// node_modules/yaml/browser/dist/compose/resolve-end.js
function resolveEnd(end, offset, reqSpace, onError) {
  let comment = "";
  if (end) {
    let hasSpace = false;
    let sep = "";
    for (const token of end) {
      const { source, type } = token;
      switch (type) {
        case "space":
          hasSpace = true;
          break;
        case "comment": {
          if (reqSpace && !hasSpace)
            onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
          const cb = source.substring(1) || " ";
          if (!comment)
            comment = cb;
          else
            comment += sep + cb;
          sep = "";
          break;
        }
        case "newline":
          if (comment)
            sep += source;
          hasSpace = true;
          break;
        default:
          onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
      }
      offset += source.length;
    }
  }
  return { comment, offset };
}

// node_modules/yaml/browser/dist/compose/resolve-flow-collection.js
var blockMsg = "Block collections are not allowed within flow collections";
var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
function resolveFlowCollection({ composeNode: composeNode2, composeEmptyNode: composeEmptyNode2 }, ctx, fc, onError, tag) {
  const isMap2 = fc.start.source === "{";
  const fcName = isMap2 ? "flow map" : "flow sequence";
  const NodeClass = tag?.nodeClass ?? (isMap2 ? YAMLMap : YAMLSeq);
  const coll = new NodeClass(ctx.schema);
  coll.flow = true;
  const atRoot = ctx.atRoot;
  if (atRoot)
    ctx.atRoot = false;
  if (ctx.atKey)
    ctx.atKey = false;
  let offset = fc.offset + fc.start.source.length;
  for (let i2 = 0; i2 < fc.items.length; ++i2) {
    const collItem = fc.items[i2];
    const { start, key, sep, value } = collItem;
    const props = resolveProps(start, {
      flow: fcName,
      indicator: "explicit-key-ind",
      next: key ?? sep?.[0],
      offset,
      onError,
      parentIndent: fc.indent,
      startOnNewline: false
    });
    if (!props.found) {
      if (!props.anchor && !props.tag && !sep && !value) {
        if (i2 === 0 && props.comma)
          onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        else if (i2 < fc.items.length - 1)
          onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
        if (props.comment) {
          if (coll.comment)
            coll.comment += "\n" + props.comment;
          else
            coll.comment = props.comment;
        }
        offset = props.end;
        continue;
      }
      if (!isMap2 && ctx.options.strict && containsNewline(key))
        onError(
          key,
          // checked by containsNewline()
          "MULTILINE_IMPLICIT_KEY",
          "Implicit keys of flow sequence pairs need to be on a single line"
        );
    }
    if (i2 === 0) {
      if (props.comma)
        onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
    } else {
      if (!props.comma)
        onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
      if (props.comment) {
        let prevItemComment = "";
        loop: for (const st of start) {
          switch (st.type) {
            case "comma":
            case "space":
              break;
            case "comment":
              prevItemComment = st.source.substring(1);
              break loop;
            default:
              break loop;
          }
        }
        if (prevItemComment) {
          let prev = coll.items[coll.items.length - 1];
          if (isPair(prev))
            prev = prev.value ?? prev.key;
          if (prev.comment)
            prev.comment += "\n" + prevItemComment;
          else
            prev.comment = prevItemComment;
          props.comment = props.comment.substring(prevItemComment.length + 1);
        }
      }
    }
    if (!isMap2 && !sep && !props.found) {
      const valueNode = value ? composeNode2(ctx, value, props, onError) : composeEmptyNode2(ctx, props.end, sep, null, props, onError);
      coll.items.push(valueNode);
      offset = valueNode.range[2];
      if (isBlock(value))
        onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
    } else {
      ctx.atKey = true;
      const keyStart = props.end;
      const keyNode = key ? composeNode2(ctx, key, props, onError) : composeEmptyNode2(ctx, keyStart, start, null, props, onError);
      if (isBlock(key))
        onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
      ctx.atKey = false;
      const valueProps = resolveProps(sep ?? [], {
        flow: fcName,
        indicator: "map-value-ind",
        next: value,
        offset: keyNode.range[2],
        onError,
        parentIndent: fc.indent,
        startOnNewline: false
      });
      if (valueProps.found) {
        if (!isMap2 && !props.found && ctx.options.strict) {
          if (sep)
            for (const st of sep) {
              if (st === valueProps.found)
                break;
              if (st.type === "newline") {
                onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                break;
              }
            }
          if (props.start < valueProps.found.offset - 1024)
            onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
        }
      } else if (value) {
        if ("source" in value && value.source?.[0] === ":")
          onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
        else
          onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
      }
      const valueNode = value ? composeNode2(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode2(ctx, valueProps.end, sep, null, valueProps, onError) : null;
      if (valueNode) {
        if (isBlock(value))
          onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
      } else if (valueProps.comment) {
        if (keyNode.comment)
          keyNode.comment += "\n" + valueProps.comment;
        else
          keyNode.comment = valueProps.comment;
      }
      const pair = new Pair(keyNode, valueNode);
      if (ctx.options.keepSourceTokens)
        pair.srcToken = collItem;
      if (isMap2) {
        const map2 = coll;
        if (mapIncludes(ctx, map2.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        map2.items.push(pair);
      } else {
        const map2 = new YAMLMap(ctx.schema);
        map2.flow = true;
        map2.items.push(pair);
        const endRange = (valueNode ?? keyNode).range;
        map2.range = [keyNode.range[0], endRange[1], endRange[2]];
        coll.items.push(map2);
      }
      offset = valueNode ? valueNode.range[2] : valueProps.end;
    }
  }
  const expectedEnd = isMap2 ? "}" : "]";
  const [ce, ...ee] = fc.end;
  let cePos = offset;
  if (ce?.source === expectedEnd)
    cePos = ce.offset + ce.source.length;
  else {
    const name = fcName[0].toUpperCase() + fcName.substring(1);
    const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
    onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
    if (ce && ce.source.length !== 1)
      ee.unshift(ce);
  }
  if (ee.length > 0) {
    const end = resolveEnd(ee, cePos, ctx.options.strict, onError);
    if (end.comment) {
      if (coll.comment)
        coll.comment += "\n" + end.comment;
      else
        coll.comment = end.comment;
    }
    coll.range = [fc.offset, cePos, end.offset];
  } else {
    coll.range = [fc.offset, cePos, cePos];
  }
  return coll;
}

// node_modules/yaml/browser/dist/compose/compose-collection.js
function resolveCollection(CN2, ctx, token, onError, tagName, tag) {
  const coll = token.type === "block-map" ? resolveBlockMap(CN2, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq(CN2, ctx, token, onError, tag) : resolveFlowCollection(CN2, ctx, token, onError, tag);
  const Coll = coll.constructor;
  if (tagName === "!" || tagName === Coll.tagName) {
    coll.tag = Coll.tagName;
    return coll;
  }
  if (tagName)
    coll.tag = tagName;
  return coll;
}
function composeCollection(CN2, ctx, token, props, onError) {
  const tagToken = props.tag;
  const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
  if (token.type === "block-seq") {
    const { anchor, newlineAfterProp: nl } = props;
    const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
    if (lastProp && (!nl || nl.offset < lastProp.offset)) {
      const message = "Missing newline after block sequence props";
      onError(lastProp, "MISSING_CHAR", message);
    }
  }
  const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
  if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.tagName && expType === "seq") {
    return resolveCollection(CN2, ctx, token, onError, tagName);
  }
  let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
  if (!tag) {
    const kt = ctx.schema.knownTags[tagName];
    if (kt?.collection === expType) {
      ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
      tag = kt;
    } else {
      if (kt) {
        onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
      } else {
        onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
      }
      return resolveCollection(CN2, ctx, token, onError, tagName);
    }
  }
  const coll = resolveCollection(CN2, ctx, token, onError, tagName, tag);
  const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
  const node2 = isNode(res) ? res : new Scalar(res);
  node2.range = coll.range;
  node2.tag = tagName;
  if (tag?.format)
    node2.format = tag.format;
  return node2;
}

// node_modules/yaml/browser/dist/compose/resolve-block-scalar.js
function resolveBlockScalar(ctx, scalar2, onError) {
  const start = scalar2.offset;
  const header = parseBlockScalarHeader(scalar2, ctx.options.strict, onError);
  if (!header)
    return { value: "", type: null, comment: "", range: [start, start, start] };
  const type = header.mode === ">" ? Scalar.BLOCK_FOLDED : Scalar.BLOCK_LITERAL;
  const lines2 = scalar2.source ? splitLines(scalar2.source) : [];
  let chompStart = lines2.length;
  for (let i2 = lines2.length - 1; i2 >= 0; --i2) {
    const content = lines2[i2][1];
    if (content === "" || content === "\r")
      chompStart = i2;
    else
      break;
  }
  if (chompStart === 0) {
    const value2 = header.chomp === "+" && lines2.length > 0 ? "\n".repeat(Math.max(1, lines2.length - 1)) : "";
    let end2 = start + header.length;
    if (scalar2.source)
      end2 += scalar2.source.length;
    return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
  }
  let trimIndent = scalar2.indent + header.indent;
  let offset = scalar2.offset + header.length;
  let contentStart = 0;
  for (let i2 = 0; i2 < chompStart; ++i2) {
    const [indent, content] = lines2[i2];
    if (content === "" || content === "\r") {
      if (header.indent === 0 && indent.length > trimIndent)
        trimIndent = indent.length;
    } else {
      if (indent.length < trimIndent) {
        const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
        onError(offset + indent.length, "MISSING_CHAR", message);
      }
      if (header.indent === 0)
        trimIndent = indent.length;
      contentStart = i2;
      if (trimIndent === 0 && !ctx.atRoot) {
        const message = "Block scalar values in collections must be indented";
        onError(offset, "BAD_INDENT", message);
      }
      break;
    }
    offset += indent.length + content.length + 1;
  }
  for (let i2 = lines2.length - 1; i2 >= chompStart; --i2) {
    if (lines2[i2][0].length > trimIndent)
      chompStart = i2 + 1;
  }
  let value = "";
  let sep = "";
  let prevMoreIndented = false;
  for (let i2 = 0; i2 < contentStart; ++i2)
    value += lines2[i2][0].slice(trimIndent) + "\n";
  for (let i2 = contentStart; i2 < chompStart; ++i2) {
    let [indent, content] = lines2[i2];
    offset += indent.length + content.length + 1;
    const crlf = content[content.length - 1] === "\r";
    if (crlf)
      content = content.slice(0, -1);
    if (content && indent.length < trimIndent) {
      const src = header.indent ? "explicit indentation indicator" : "first line";
      const message = `Block scalar lines must not be less indented than their ${src}`;
      onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
      indent = "";
    }
    if (type === Scalar.BLOCK_LITERAL) {
      value += sep + indent.slice(trimIndent) + content;
      sep = "\n";
    } else if (indent.length > trimIndent || content[0] === "	") {
      if (sep === " ")
        sep = "\n";
      else if (!prevMoreIndented && sep === "\n")
        sep = "\n\n";
      value += sep + indent.slice(trimIndent) + content;
      sep = "\n";
      prevMoreIndented = true;
    } else if (content === "") {
      if (sep === "\n")
        value += "\n";
      else
        sep = "\n";
    } else {
      value += sep + content;
      sep = " ";
      prevMoreIndented = false;
    }
  }
  switch (header.chomp) {
    case "-":
      break;
    case "+":
      for (let i2 = chompStart; i2 < lines2.length; ++i2)
        value += "\n" + lines2[i2][0].slice(trimIndent);
      if (value[value.length - 1] !== "\n")
        value += "\n";
      break;
    default:
      value += "\n";
  }
  const end = start + header.length + scalar2.source.length;
  return { value, type, comment: header.comment, range: [start, end, end] };
}
function parseBlockScalarHeader({ offset, props }, strict, onError) {
  if (props[0].type !== "block-scalar-header") {
    onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
    return null;
  }
  const { source } = props[0];
  const mode = source[0];
  let indent = 0;
  let chomp = "";
  let error = -1;
  for (let i2 = 1; i2 < source.length; ++i2) {
    const ch = source[i2];
    if (!chomp && (ch === "-" || ch === "+"))
      chomp = ch;
    else {
      const n = Number(ch);
      if (!indent && n)
        indent = n;
      else if (error === -1)
        error = offset + i2;
    }
  }
  if (error !== -1)
    onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
  let hasSpace = false;
  let comment = "";
  let length = source.length;
  for (let i2 = 1; i2 < props.length; ++i2) {
    const token = props[i2];
    switch (token.type) {
      case "space":
        hasSpace = true;
      // fallthrough
      case "newline":
        length += token.source.length;
        break;
      case "comment":
        if (strict && !hasSpace) {
          const message = "Comments must be separated from other tokens by white space characters";
          onError(token, "MISSING_CHAR", message);
        }
        length += token.source.length;
        comment = token.source.substring(1);
        break;
      case "error":
        onError(token, "UNEXPECTED_TOKEN", token.message);
        length += token.source.length;
        break;
      /* istanbul ignore next should not happen */
      default: {
        const message = `Unexpected token in block scalar header: ${token.type}`;
        onError(token, "UNEXPECTED_TOKEN", message);
        const ts = token.source;
        if (ts && typeof ts === "string")
          length += ts.length;
      }
    }
  }
  return { mode, indent, chomp, comment, length };
}
function splitLines(source) {
  const split = source.split(/\n( *)/);
  const first = split[0];
  const m = first.match(/^( *)/);
  const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
  const lines2 = [line0];
  for (let i2 = 1; i2 < split.length; i2 += 2)
    lines2.push([split[i2], split[i2 + 1]]);
  return lines2;
}

// node_modules/yaml/browser/dist/compose/resolve-flow-scalar.js
function resolveFlowScalar(scalar2, strict, onError) {
  const { offset, type, source, end } = scalar2;
  let _type;
  let value;
  const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
  switch (type) {
    case "scalar":
      _type = Scalar.PLAIN;
      value = plainValue(source, _onError);
      break;
    case "single-quoted-scalar":
      _type = Scalar.QUOTE_SINGLE;
      value = singleQuotedValue(source, _onError);
      break;
    case "double-quoted-scalar":
      _type = Scalar.QUOTE_DOUBLE;
      value = doubleQuotedValue(source, _onError);
      break;
    /* istanbul ignore next should not happen */
    default:
      onError(scalar2, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
      return {
        value: "",
        type: null,
        comment: "",
        range: [offset, offset + source.length, offset + source.length]
      };
  }
  const valueEnd = offset + source.length;
  const re = resolveEnd(end, valueEnd, strict, onError);
  return {
    value,
    type: _type,
    comment: re.comment,
    range: [offset, valueEnd, re.offset]
  };
}
function plainValue(source, onError) {
  let badChar = "";
  switch (source[0]) {
    /* istanbul ignore next should not happen */
    case "	":
      badChar = "a tab character";
      break;
    case ",":
      badChar = "flow indicator character ,";
      break;
    case "%":
      badChar = "directive indicator character %";
      break;
    case "|":
    case ">": {
      badChar = `block scalar indicator ${source[0]}`;
      break;
    }
    case "@":
    case "`": {
      badChar = `reserved character ${source[0]}`;
      break;
    }
  }
  if (badChar)
    onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
  return unfoldLines(source);
}
function singleQuotedValue(source, onError) {
  if (source[source.length - 1] !== "'" || source.length === 1)
    onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
  return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
}
function unfoldLines(source) {
  const line = /(.*?)\r?\n/sy;
  let match = line.exec(source);
  if (!match)
    return source;
  let trimEnd, trimBoth;
  try {
    trimEnd = new RegExp("(?<![ 	])[ 	]+$");
    trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
  } catch {
    trimEnd = /[ \t]+$/;
    trimBoth = /^[ \t]+|[ \t]+$/g;
  }
  let res = match[1].replace(trimEnd, "");
  let sep = " ";
  let pos = line.lastIndex;
  while (match = line.exec(source)) {
    const lm = match[1].replace(trimBoth, "");
    if (lm === "") {
      if (sep === "\n")
        res += sep;
      else
        sep = "\n";
    } else {
      res += sep + lm;
      sep = " ";
    }
    pos = line.lastIndex;
  }
  const last = /[ \t]*(.*)/sy;
  last.lastIndex = pos;
  match = last.exec(source);
  return res + sep + (match?.[1] ?? "");
}
function doubleQuotedValue(source, onError) {
  let res = "";
  for (let i2 = 1; i2 < source.length - 1; ++i2) {
    const ch = source[i2];
    if (ch === "\r" && source[i2 + 1] === "\n")
      continue;
    if (ch === "\n") {
      const { fold, offset } = foldNewline(source, i2);
      res += fold;
      i2 = offset;
    } else if (ch === "\\") {
      let next = source[++i2];
      const cc = escapeCodes[next];
      if (cc)
        res += cc;
      else if (next === "\n") {
        next = source[i2 + 1];
        while (next === " " || next === "	")
          next = source[++i2 + 1];
      } else if (next === "\r" && source[i2 + 1] === "\n") {
        next = source[++i2 + 1];
        while (next === " " || next === "	")
          next = source[++i2 + 1];
      } else if (next === "x" || next === "u" || next === "U") {
        const length = next === "x" ? 2 : next === "u" ? 4 : 8;
        res += parseCharCode(source, i2 + 1, length, onError);
        i2 += length;
      } else {
        const raw = source.substr(i2 - 1, 2);
        onError(i2 - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        res += raw;
      }
    } else if (ch === " " || ch === "	") {
      const wsStart = i2;
      let next = source[i2 + 1];
      while (next === " " || next === "	")
        next = source[++i2 + 1];
      if (next !== "\n" && !(next === "\r" && source[i2 + 2] === "\n"))
        res += i2 > wsStart ? source.slice(wsStart, i2 + 1) : ch;
    } else {
      res += ch;
    }
  }
  if (source[source.length - 1] !== '"' || source.length === 1)
    onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
  return res;
}
function foldNewline(source, offset) {
  let fold = "";
  let ch = source[offset + 1];
  while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
    if (ch === "\r" && source[offset + 2] !== "\n")
      break;
    if (ch === "\n")
      fold += "\n";
    offset += 1;
    ch = source[offset + 1];
  }
  if (!fold)
    fold = " ";
  return { fold, offset };
}
var escapeCodes = {
  "0": "\0",
  // null character
  a: "\x07",
  // bell character
  b: "\b",
  // backspace
  e: "\x1B",
  // escape character
  f: "\f",
  // form feed
  n: "\n",
  // line feed
  r: "\r",
  // carriage return
  t: "	",
  // horizontal tab
  v: "\v",
  // vertical tab
  N: "",
  // Unicode next line
  _: " ",
  // Unicode non-breaking space
  L: "\u2028",
  // Unicode line separator
  P: "\u2029",
  // Unicode paragraph separator
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  "	": "	"
};
function parseCharCode(source, offset, length, onError) {
  const cc = source.substr(offset, length);
  const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
  const code = ok ? parseInt(cc, 16) : NaN;
  try {
    return String.fromCodePoint(code);
  } catch {
    const raw = source.substr(offset - 2, length + 2);
    onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
    return raw;
  }
}

// node_modules/yaml/browser/dist/compose/compose-scalar.js
function composeScalar(ctx, token, tagToken, onError) {
  const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar(ctx, token, onError) : resolveFlowScalar(token, ctx.options.strict, onError);
  const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
  let tag;
  if (ctx.options.stringKeys && ctx.atKey) {
    tag = ctx.schema[SCALAR];
  } else if (tagName)
    tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
  else if (token.type === "scalar")
    tag = findScalarTagByTest(ctx, value, token, onError);
  else
    tag = ctx.schema[SCALAR];
  let scalar2;
  try {
    const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
    scalar2 = isScalar(res) ? res : new Scalar(res);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
    scalar2 = new Scalar(value);
  }
  scalar2.range = range;
  scalar2.source = value;
  if (type)
    scalar2.type = type;
  if (tagName)
    scalar2.tag = tagName;
  if (tag.format)
    scalar2.format = tag.format;
  if (comment)
    scalar2.comment = comment;
  return scalar2;
}
function findScalarTagByName(schema4, value, tagName, tagToken, onError) {
  if (tagName === "!")
    return schema4[SCALAR];
  const matchWithTest = [];
  for (const tag of schema4.tags) {
    if (!tag.collection && tag.tag === tagName) {
      if (tag.default && tag.test)
        matchWithTest.push(tag);
      else
        return tag;
    }
  }
  for (const tag of matchWithTest)
    if (tag.test?.test(value))
      return tag;
  const kt = schema4.knownTags[tagName];
  if (kt && !kt.collection) {
    schema4.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
    return kt;
  }
  onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
  return schema4[SCALAR];
}
function findScalarTagByTest({ atKey, directives, schema: schema4 }, value, token, onError) {
  const tag = schema4.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema4[SCALAR];
  if (schema4.compat) {
    const compat = schema4.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema4[SCALAR];
    if (tag.tag !== compat.tag) {
      const ts = directives.tagString(tag.tag);
      const cs = directives.tagString(compat.tag);
      const msg = `Value may be parsed as either ${ts} or ${cs}`;
      onError(token, "TAG_RESOLVE_FAILED", msg, true);
    }
  }
  return tag;
}

// node_modules/yaml/browser/dist/compose/util-empty-scalar-position.js
function emptyScalarPosition(offset, before, pos) {
  if (before) {
    pos ?? (pos = before.length);
    for (let i2 = pos - 1; i2 >= 0; --i2) {
      let st = before[i2];
      switch (st.type) {
        case "space":
        case "comment":
        case "newline":
          offset -= st.source.length;
          continue;
      }
      st = before[++i2];
      while (st?.type === "space") {
        offset += st.source.length;
        st = before[++i2];
      }
      break;
    }
  }
  return offset;
}

// node_modules/yaml/browser/dist/compose/compose-node.js
var CN = { composeNode, composeEmptyNode };
function composeNode(ctx, token, props, onError) {
  const atKey = ctx.atKey;
  const { spaceBefore, comment, anchor, tag } = props;
  let node2;
  let isSrcToken = true;
  switch (token.type) {
    case "alias":
      node2 = composeAlias(ctx, token, onError);
      if (anchor || tag)
        onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
      break;
    case "scalar":
    case "single-quoted-scalar":
    case "double-quoted-scalar":
    case "block-scalar":
      node2 = composeScalar(ctx, token, tag, onError);
      if (anchor)
        node2.anchor = anchor.source.substring(1);
      break;
    case "block-map":
    case "block-seq":
    case "flow-collection":
      try {
        node2 = composeCollection(CN, ctx, token, props, onError);
        if (anchor)
          node2.anchor = anchor.source.substring(1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onError(token, "RESOURCE_EXHAUSTION", message);
      }
      break;
    default: {
      const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
      onError(token, "UNEXPECTED_TOKEN", message);
      isSrcToken = false;
    }
  }
  node2 ?? (node2 = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
  if (anchor && node2.anchor === "")
    onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
  if (atKey && ctx.options.stringKeys && (!isScalar(node2) || typeof node2.value !== "string" || node2.tag && node2.tag !== "tag:yaml.org,2002:str")) {
    const msg = "With stringKeys, all keys must be strings";
    onError(tag ?? token, "NON_STRING_KEY", msg);
  }
  if (spaceBefore)
    node2.spaceBefore = true;
  if (comment) {
    if (token.type === "scalar" && token.source === "")
      node2.comment = comment;
    else
      node2.commentBefore = comment;
  }
  if (ctx.options.keepSourceTokens && isSrcToken)
    node2.srcToken = token;
  return node2;
}
function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
  const token = {
    type: "scalar",
    offset: emptyScalarPosition(offset, before, pos),
    indent: -1,
    source: ""
  };
  const node2 = composeScalar(ctx, token, tag, onError);
  if (anchor) {
    node2.anchor = anchor.source.substring(1);
    if (node2.anchor === "")
      onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
  }
  if (spaceBefore)
    node2.spaceBefore = true;
  if (comment) {
    node2.comment = comment;
    node2.range[2] = end;
  }
  return node2;
}
function composeAlias({ options }, { offset, source, end }, onError) {
  const alias = new Alias(source.substring(1));
  if (alias.source === "")
    onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
  if (alias.source.endsWith(":"))
    onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
  const valueEnd = offset + source.length;
  const re = resolveEnd(end, valueEnd, options.strict, onError);
  alias.range = [offset, valueEnd, re.offset];
  if (re.comment)
    alias.comment = re.comment;
  return alias;
}

// node_modules/yaml/browser/dist/compose/compose-doc.js
function composeDoc(options, directives, { offset, start, value, end }, onError) {
  const opts = Object.assign({ _directives: directives }, options);
  const doc = new Document(void 0, opts);
  const ctx = {
    atKey: false,
    atRoot: true,
    directives: doc.directives,
    options: doc.options,
    schema: doc.schema
  };
  const props = resolveProps(start, {
    indicator: "doc-start",
    next: value ?? end?.[0],
    offset,
    onError,
    parentIndent: 0,
    startOnNewline: true
  });
  if (props.found) {
    doc.directives.docStart = true;
    if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
      onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
  }
  doc.contents = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
  const contentEnd = doc.contents.range[2];
  const re = resolveEnd(end, contentEnd, false, onError);
  if (re.comment)
    doc.comment = re.comment;
  doc.range = [offset, contentEnd, re.offset];
  return doc;
}

// node_modules/yaml/browser/dist/compose/composer.js
function getErrorPos(src) {
  if (typeof src === "number")
    return [src, src + 1];
  if (Array.isArray(src))
    return src.length === 2 ? src : [src[0], src[1]];
  const { offset, source } = src;
  return [offset, offset + (typeof source === "string" ? source.length : 1)];
}
function parsePrelude(prelude) {
  let comment = "";
  let atComment = false;
  let afterEmptyLine = false;
  for (let i2 = 0; i2 < prelude.length; ++i2) {
    const source = prelude[i2];
    switch (source[0]) {
      case "#":
        comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
        atComment = true;
        afterEmptyLine = false;
        break;
      case "%":
        if (prelude[i2 + 1]?.[0] !== "#")
          i2 += 1;
        atComment = false;
        break;
      default:
        if (!atComment)
          afterEmptyLine = true;
        atComment = false;
    }
  }
  return { comment, afterEmptyLine };
}
var Composer = class {
  constructor(options = {}) {
    this.doc = null;
    this.atDirectives = false;
    this.prelude = [];
    this.errors = [];
    this.warnings = [];
    this.onError = (source, code, message, warning) => {
      const pos = getErrorPos(source);
      if (warning)
        this.warnings.push(new YAMLWarning(pos, code, message));
      else
        this.errors.push(new YAMLParseError(pos, code, message));
    };
    this.directives = new Directives({ version: options.version || "1.2" });
    this.options = options;
  }
  decorate(doc, afterDoc) {
    const { comment, afterEmptyLine } = parsePrelude(this.prelude);
    if (comment) {
      const dc = doc.contents;
      if (afterDoc) {
        doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
      } else if (afterEmptyLine || doc.directives.docStart || !dc) {
        doc.commentBefore = comment;
      } else if (isCollection(dc) && !dc.flow && dc.items.length > 0) {
        let it = dc.items[0];
        if (isPair(it))
          it = it.key;
        const cb = it.commentBefore;
        it.commentBefore = cb ? `${comment}
${cb}` : comment;
      } else {
        const cb = dc.commentBefore;
        dc.commentBefore = cb ? `${comment}
${cb}` : comment;
      }
    }
    if (afterDoc) {
      for (let i2 = 0; i2 < this.errors.length; ++i2)
        doc.errors.push(this.errors[i2]);
      for (let i2 = 0; i2 < this.warnings.length; ++i2)
        doc.warnings.push(this.warnings[i2]);
    } else {
      doc.errors = this.errors;
      doc.warnings = this.warnings;
    }
    this.prelude = [];
    this.errors = [];
    this.warnings = [];
  }
  /**
   * Current stream status information.
   *
   * Mostly useful at the end of input for an empty stream.
   */
  streamInfo() {
    return {
      comment: parsePrelude(this.prelude).comment,
      directives: this.directives,
      errors: this.errors,
      warnings: this.warnings
    };
  }
  /**
   * Compose tokens into documents.
   *
   * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
   * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
   */
  *compose(tokens, forceDoc = false, endOffset = -1) {
    for (const token of tokens)
      yield* this.next(token);
    yield* this.end(forceDoc, endOffset);
  }
  /** Advance the composer by one CST token. */
  *next(token) {
    switch (token.type) {
      case "directive":
        this.directives.add(token.source, (offset, message, warning) => {
          const pos = getErrorPos(token);
          pos[0] += offset;
          this.onError(pos, "BAD_DIRECTIVE", message, warning);
        });
        this.prelude.push(token.source);
        this.atDirectives = true;
        break;
      case "document": {
        const doc = composeDoc(this.options, this.directives, token, this.onError);
        if (this.atDirectives && !doc.directives.docStart)
          this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
        this.decorate(doc, false);
        if (this.doc)
          yield this.doc;
        this.doc = doc;
        this.atDirectives = false;
        break;
      }
      case "byte-order-mark":
      case "space":
        break;
      case "comment":
      case "newline":
        this.prelude.push(token.source);
        break;
      case "error": {
        const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
        const error = new YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
        if (this.atDirectives || !this.doc)
          this.errors.push(error);
        else
          this.doc.errors.push(error);
        break;
      }
      case "doc-end": {
        if (!this.doc) {
          const msg = "Unexpected doc-end without preceding document";
          this.errors.push(new YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
          break;
        }
        this.doc.directives.docEnd = true;
        const end = resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
        this.decorate(this.doc, true);
        if (end.comment) {
          const dc = this.doc.comment;
          this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
        }
        this.doc.range[2] = end.offset;
        break;
      }
      default:
        this.errors.push(new YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
    }
  }
  /**
   * Call at end of input to yield any remaining document.
   *
   * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
   * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
   */
  *end(forceDoc = false, endOffset = -1) {
    if (this.doc) {
      this.decorate(this.doc, true);
      yield this.doc;
      this.doc = null;
    } else if (forceDoc) {
      const opts = Object.assign({ _directives: this.directives }, this.options);
      const doc = new Document(void 0, opts);
      if (this.atDirectives)
        this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
      doc.range = [0, endOffset, endOffset];
      this.decorate(doc, false);
      yield doc;
    }
  }
};

// node_modules/yaml/browser/dist/parse/cst-visit.js
var BREAK2 = /* @__PURE__ */ Symbol("break visit");
var SKIP2 = /* @__PURE__ */ Symbol("skip children");
var REMOVE2 = /* @__PURE__ */ Symbol("remove item");
function visit2(cst, visitor) {
  if ("type" in cst && cst.type === "document")
    cst = { start: cst.start, value: cst.value };
  _visit(Object.freeze([]), cst, visitor);
}
visit2.BREAK = BREAK2;
visit2.SKIP = SKIP2;
visit2.REMOVE = REMOVE2;
visit2.itemAtPath = (cst, path) => {
  let item = cst;
  for (const [field, index] of path) {
    const tok = item?.[field];
    if (tok && "items" in tok) {
      item = tok.items[index];
    } else
      return void 0;
  }
  return item;
};
visit2.parentCollection = (cst, path) => {
  const parent = visit2.itemAtPath(cst, path.slice(0, -1));
  const field = path[path.length - 1][0];
  const coll = parent?.[field];
  if (coll && "items" in coll)
    return coll;
  throw new Error("Parent collection not found");
};
function _visit(path, item, visitor) {
  let ctrl = visitor(item, path);
  if (typeof ctrl === "symbol")
    return ctrl;
  for (const field of ["key", "value"]) {
    const token = item[field];
    if (token && "items" in token) {
      for (let i2 = 0; i2 < token.items.length; ++i2) {
        const ci = _visit(Object.freeze(path.concat([[field, i2]])), token.items[i2], visitor);
        if (typeof ci === "number")
          i2 = ci - 1;
        else if (ci === BREAK2)
          return BREAK2;
        else if (ci === REMOVE2) {
          token.items.splice(i2, 1);
          i2 -= 1;
        }
      }
      if (typeof ctrl === "function" && field === "key")
        ctrl = ctrl(item, path);
    }
  }
  return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
}

// node_modules/yaml/browser/dist/parse/cst.js
var BOM = "\uFEFF";
var DOCUMENT = "";
var FLOW_END = "";
var SCALAR2 = "";
function tokenType(source) {
  switch (source) {
    case BOM:
      return "byte-order-mark";
    case DOCUMENT:
      return "doc-mode";
    case FLOW_END:
      return "flow-error-end";
    case SCALAR2:
      return "scalar";
    case "---":
      return "doc-start";
    case "...":
      return "doc-end";
    case "":
    case "\n":
    case "\r\n":
      return "newline";
    case "-":
      return "seq-item-ind";
    case "?":
      return "explicit-key-ind";
    case ":":
      return "map-value-ind";
    case "{":
      return "flow-map-start";
    case "}":
      return "flow-map-end";
    case "[":
      return "flow-seq-start";
    case "]":
      return "flow-seq-end";
    case ",":
      return "comma";
  }
  switch (source[0]) {
    case " ":
    case "	":
      return "space";
    case "#":
      return "comment";
    case "%":
      return "directive-line";
    case "*":
      return "alias";
    case "&":
      return "anchor";
    case "!":
      return "tag";
    case "'":
      return "single-quoted-scalar";
    case '"':
      return "double-quoted-scalar";
    case "|":
    case ">":
      return "block-scalar-header";
  }
  return null;
}

// node_modules/yaml/browser/dist/parse/lexer.js
function isEmpty(ch) {
  switch (ch) {
    case void 0:
    case " ":
    case "\n":
    case "\r":
    case "	":
      return true;
    default:
      return false;
  }
}
var hexDigits = new Set("0123456789ABCDEFabcdef");
var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
var flowIndicatorChars = new Set(",[]{}");
var invalidAnchorChars = new Set(" ,[]{}\n\r	");
var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
var Lexer = class {
  constructor() {
    this.atEnd = false;
    this.blockScalarIndent = -1;
    this.blockScalarKeep = false;
    this.buffer = "";
    this.flowKey = false;
    this.flowLevel = 0;
    this.indentNext = 0;
    this.indentValue = 0;
    this.lineEndPos = null;
    this.next = null;
    this.pos = 0;
  }
  /**
   * Generate YAML tokens from the `source` string. If `incomplete`,
   * a part of the last line may be left as a buffer for the next call.
   *
   * @returns A generator of lexical tokens
   */
  *lex(source, incomplete = false) {
    if (source) {
      if (typeof source !== "string")
        throw TypeError("source is not a string");
      this.buffer = this.buffer ? this.buffer + source : source;
      this.lineEndPos = null;
    }
    this.atEnd = !incomplete;
    let next = this.next ?? "stream";
    while (next && (incomplete || this.hasChars(1)))
      next = yield* this.parseNext(next);
  }
  atLineEnd() {
    let i2 = this.pos;
    let ch = this.buffer[i2];
    while (ch === " " || ch === "	")
      ch = this.buffer[++i2];
    if (!ch || ch === "#" || ch === "\n")
      return true;
    if (ch === "\r")
      return this.buffer[i2 + 1] === "\n";
    return false;
  }
  charAt(n) {
    return this.buffer[this.pos + n];
  }
  continueScalar(offset) {
    let ch = this.buffer[offset];
    if (this.indentNext > 0) {
      let indent = 0;
      while (ch === " ")
        ch = this.buffer[++indent + offset];
      if (ch === "\r") {
        const next = this.buffer[indent + offset + 1];
        if (next === "\n" || !next && !this.atEnd)
          return offset + indent + 1;
      }
      return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
    }
    if (ch === "-" || ch === ".") {
      const dt = this.buffer.substr(offset, 3);
      if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
        return -1;
    }
    return offset;
  }
  getLine() {
    let end = this.lineEndPos;
    if (typeof end !== "number" || end !== -1 && end < this.pos) {
      end = this.buffer.indexOf("\n", this.pos);
      this.lineEndPos = end;
    }
    if (end === -1)
      return this.atEnd ? this.buffer.substring(this.pos) : null;
    if (this.buffer[end - 1] === "\r")
      end -= 1;
    return this.buffer.substring(this.pos, end);
  }
  hasChars(n) {
    return this.pos + n <= this.buffer.length;
  }
  setNext(state) {
    this.buffer = this.buffer.substring(this.pos);
    this.pos = 0;
    this.lineEndPos = null;
    this.next = state;
    return null;
  }
  peek(n) {
    return this.buffer.substr(this.pos, n);
  }
  *parseNext(next) {
    switch (next) {
      case "stream":
        return yield* this.parseStream();
      case "line-start":
        return yield* this.parseLineStart();
      case "block-start":
        return yield* this.parseBlockStart();
      case "doc":
        return yield* this.parseDocument();
      case "flow":
        return yield* this.parseFlowCollection();
      case "quoted-scalar":
        return yield* this.parseQuotedScalar();
      case "block-scalar":
        return yield* this.parseBlockScalar();
      case "plain-scalar":
        return yield* this.parsePlainScalar();
    }
  }
  *parseStream() {
    let line = this.getLine();
    if (line === null)
      return this.setNext("stream");
    if (line[0] === BOM) {
      yield* this.pushCount(1);
      line = line.substring(1);
    }
    if (line[0] === "%") {
      let dirEnd = line.length;
      let cs = line.indexOf("#");
      while (cs !== -1) {
        const ch = line[cs - 1];
        if (ch === " " || ch === "	") {
          dirEnd = cs - 1;
          break;
        } else {
          cs = line.indexOf("#", cs + 1);
        }
      }
      while (true) {
        const ch = line[dirEnd - 1];
        if (ch === " " || ch === "	")
          dirEnd -= 1;
        else
          break;
      }
      const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
      yield* this.pushCount(line.length - n);
      this.pushNewline();
      return "stream";
    }
    if (this.atLineEnd()) {
      const sp = yield* this.pushSpaces(true);
      yield* this.pushCount(line.length - sp);
      yield* this.pushNewline();
      return "stream";
    }
    yield DOCUMENT;
    return yield* this.parseLineStart();
  }
  *parseLineStart() {
    const ch = this.charAt(0);
    if (!ch && !this.atEnd)
      return this.setNext("line-start");
    if (ch === "-" || ch === ".") {
      if (!this.atEnd && !this.hasChars(4))
        return this.setNext("line-start");
      const s = this.peek(3);
      if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
        yield* this.pushCount(3);
        this.indentValue = 0;
        this.indentNext = 0;
        return s === "---" ? "doc" : "stream";
      }
    }
    this.indentValue = yield* this.pushSpaces(false);
    if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
      this.indentNext = this.indentValue;
    return yield* this.parseBlockStart();
  }
  *parseBlockStart() {
    const [ch0, ch1] = this.peek(2);
    if (!ch1 && !this.atEnd)
      return this.setNext("block-start");
    if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
      const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
      this.indentNext = this.indentValue + 1;
      this.indentValue += n;
      return "block-start";
    }
    return "doc";
  }
  *parseDocument() {
    yield* this.pushSpaces(true);
    const line = this.getLine();
    if (line === null)
      return this.setNext("doc");
    let n = yield* this.pushIndicators();
    switch (line[n]) {
      case "#":
        yield* this.pushCount(line.length - n);
      // fallthrough
      case void 0:
        yield* this.pushNewline();
        return yield* this.parseLineStart();
      case "{":
      case "[":
        yield* this.pushCount(1);
        this.flowKey = false;
        this.flowLevel = 1;
        return "flow";
      case "}":
      case "]":
        yield* this.pushCount(1);
        return "doc";
      case "*":
        yield* this.pushUntil(isNotAnchorChar);
        return "doc";
      case '"':
      case "'":
        return yield* this.parseQuotedScalar();
      case "|":
      case ">":
        n += yield* this.parseBlockScalarHeader();
        n += yield* this.pushSpaces(true);
        yield* this.pushCount(line.length - n);
        yield* this.pushNewline();
        return yield* this.parseBlockScalar();
      default:
        return yield* this.parsePlainScalar();
    }
  }
  *parseFlowCollection() {
    let nl, sp;
    let indent = -1;
    do {
      nl = yield* this.pushNewline();
      if (nl > 0) {
        sp = yield* this.pushSpaces(false);
        this.indentValue = indent = sp;
      } else {
        sp = 0;
      }
      sp += yield* this.pushSpaces(true);
    } while (nl + sp > 0);
    const line = this.getLine();
    if (line === null)
      return this.setNext("flow");
    if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
      const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
      if (!atFlowEndMarker) {
        this.flowLevel = 0;
        yield FLOW_END;
        return yield* this.parseLineStart();
      }
    }
    let n = 0;
    while (line[n] === ",") {
      n += yield* this.pushCount(1);
      n += yield* this.pushSpaces(true);
      this.flowKey = false;
    }
    n += yield* this.pushIndicators();
    switch (line[n]) {
      case void 0:
        return "flow";
      case "#":
        yield* this.pushCount(line.length - n);
        return "flow";
      case "{":
      case "[":
        yield* this.pushCount(1);
        this.flowKey = false;
        this.flowLevel += 1;
        return "flow";
      case "}":
      case "]":
        yield* this.pushCount(1);
        this.flowKey = true;
        this.flowLevel -= 1;
        return this.flowLevel ? "flow" : "doc";
      case "*":
        yield* this.pushUntil(isNotAnchorChar);
        return "flow";
      case '"':
      case "'":
        this.flowKey = true;
        return yield* this.parseQuotedScalar();
      case ":": {
        const next = this.charAt(1);
        if (this.flowKey || isEmpty(next) || next === ",") {
          this.flowKey = false;
          yield* this.pushCount(1);
          yield* this.pushSpaces(true);
          return "flow";
        }
      }
      // fallthrough
      default:
        this.flowKey = false;
        return yield* this.parsePlainScalar();
    }
  }
  *parseQuotedScalar() {
    const quote = this.charAt(0);
    let end = this.buffer.indexOf(quote, this.pos + 1);
    if (quote === "'") {
      while (end !== -1 && this.buffer[end + 1] === "'")
        end = this.buffer.indexOf("'", end + 2);
    } else {
      while (end !== -1) {
        let n = 0;
        while (this.buffer[end - 1 - n] === "\\")
          n += 1;
        if (n % 2 === 0)
          break;
        end = this.buffer.indexOf('"', end + 1);
      }
    }
    const qb = this.buffer.substring(0, end);
    let nl = qb.indexOf("\n", this.pos);
    if (nl !== -1) {
      while (nl !== -1) {
        const cs = this.continueScalar(nl + 1);
        if (cs === -1)
          break;
        nl = qb.indexOf("\n", cs);
      }
      if (nl !== -1) {
        end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
      }
    }
    if (end === -1) {
      if (!this.atEnd)
        return this.setNext("quoted-scalar");
      end = this.buffer.length;
    }
    yield* this.pushToIndex(end + 1, false);
    return this.flowLevel ? "flow" : "doc";
  }
  *parseBlockScalarHeader() {
    this.blockScalarIndent = -1;
    this.blockScalarKeep = false;
    let i2 = this.pos;
    while (true) {
      const ch = this.buffer[++i2];
      if (ch === "+")
        this.blockScalarKeep = true;
      else if (ch > "0" && ch <= "9")
        this.blockScalarIndent = Number(ch) - 1;
      else if (ch !== "-")
        break;
    }
    return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
  }
  *parseBlockScalar() {
    let nl = this.pos - 1;
    let indent = 0;
    let ch;
    loop: for (let i3 = this.pos; ch = this.buffer[i3]; ++i3) {
      switch (ch) {
        case " ":
          indent += 1;
          break;
        case "\n":
          nl = i3;
          indent = 0;
          break;
        case "\r": {
          const next = this.buffer[i3 + 1];
          if (!next && !this.atEnd)
            return this.setNext("block-scalar");
          if (next === "\n")
            break;
        }
        // fallthrough
        default:
          break loop;
      }
    }
    if (!ch && !this.atEnd)
      return this.setNext("block-scalar");
    if (indent >= this.indentNext) {
      if (this.blockScalarIndent === -1)
        this.indentNext = indent;
      else {
        this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
      }
      do {
        const cs = this.continueScalar(nl + 1);
        if (cs === -1)
          break;
        nl = this.buffer.indexOf("\n", cs);
      } while (nl !== -1);
      if (nl === -1) {
        if (!this.atEnd)
          return this.setNext("block-scalar");
        nl = this.buffer.length;
      }
    }
    let i2 = nl + 1;
    ch = this.buffer[i2];
    while (ch === " ")
      ch = this.buffer[++i2];
    if (ch === "	") {
      while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
        ch = this.buffer[++i2];
      nl = i2 - 1;
    } else if (!this.blockScalarKeep) {
      do {
        let i3 = nl - 1;
        let ch2 = this.buffer[i3];
        if (ch2 === "\r")
          ch2 = this.buffer[--i3];
        const lastChar = i3;
        while (ch2 === " ")
          ch2 = this.buffer[--i3];
        if (ch2 === "\n" && i3 >= this.pos && i3 + 1 + indent > lastChar)
          nl = i3;
        else
          break;
      } while (true);
    }
    yield SCALAR2;
    yield* this.pushToIndex(nl + 1, true);
    return yield* this.parseLineStart();
  }
  *parsePlainScalar() {
    const inFlow = this.flowLevel > 0;
    let end = this.pos - 1;
    let i2 = this.pos - 1;
    let ch;
    while (ch = this.buffer[++i2]) {
      if (ch === ":") {
        const next = this.buffer[i2 + 1];
        if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
          break;
        end = i2;
      } else if (isEmpty(ch)) {
        let next = this.buffer[i2 + 1];
        if (ch === "\r") {
          if (next === "\n") {
            i2 += 1;
            ch = "\n";
            next = this.buffer[i2 + 1];
          } else
            end = i2;
        }
        if (next === "#" || inFlow && flowIndicatorChars.has(next))
          break;
        if (ch === "\n") {
          const cs = this.continueScalar(i2 + 1);
          if (cs === -1)
            break;
          i2 = Math.max(i2, cs - 2);
        }
      } else {
        if (inFlow && flowIndicatorChars.has(ch))
          break;
        end = i2;
      }
    }
    if (!ch && !this.atEnd)
      return this.setNext("plain-scalar");
    yield SCALAR2;
    yield* this.pushToIndex(end + 1, true);
    return inFlow ? "flow" : "doc";
  }
  *pushCount(n) {
    if (n > 0) {
      yield this.buffer.substr(this.pos, n);
      this.pos += n;
      return n;
    }
    return 0;
  }
  *pushToIndex(i2, allowEmpty) {
    const s = this.buffer.slice(this.pos, i2);
    if (s) {
      yield s;
      this.pos += s.length;
      return s.length;
    } else if (allowEmpty)
      yield "";
    return 0;
  }
  *pushIndicators() {
    let n = 0;
    loop: while (true) {
      switch (this.charAt(0)) {
        case "!":
          n += yield* this.pushTag();
          n += yield* this.pushSpaces(true);
          continue loop;
        case "&":
          n += yield* this.pushUntil(isNotAnchorChar);
          n += yield* this.pushSpaces(true);
          continue loop;
        case "-":
        // this is an error
        case "?":
        // this is an error outside flow collections
        case ":": {
          const inFlow = this.flowLevel > 0;
          const ch1 = this.charAt(1);
          if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
            if (!inFlow)
              this.indentNext = this.indentValue + 1;
            else if (this.flowKey)
              this.flowKey = false;
            n += yield* this.pushCount(1);
            n += yield* this.pushSpaces(true);
            continue loop;
          }
        }
      }
      break loop;
    }
    return n;
  }
  *pushTag() {
    if (this.charAt(1) === "<") {
      let i2 = this.pos + 2;
      let ch = this.buffer[i2];
      while (!isEmpty(ch) && ch !== ">")
        ch = this.buffer[++i2];
      return yield* this.pushToIndex(ch === ">" ? i2 + 1 : i2, false);
    } else {
      let i2 = this.pos + 1;
      let ch = this.buffer[i2];
      while (ch) {
        if (tagChars.has(ch))
          ch = this.buffer[++i2];
        else if (ch === "%" && hexDigits.has(this.buffer[i2 + 1]) && hexDigits.has(this.buffer[i2 + 2])) {
          ch = this.buffer[i2 += 3];
        } else
          break;
      }
      return yield* this.pushToIndex(i2, false);
    }
  }
  *pushNewline() {
    const ch = this.buffer[this.pos];
    if (ch === "\n")
      return yield* this.pushCount(1);
    else if (ch === "\r" && this.charAt(1) === "\n")
      return yield* this.pushCount(2);
    else
      return 0;
  }
  *pushSpaces(allowTabs) {
    let i2 = this.pos - 1;
    let ch;
    do {
      ch = this.buffer[++i2];
    } while (ch === " " || allowTabs && ch === "	");
    const n = i2 - this.pos;
    if (n > 0) {
      yield this.buffer.substr(this.pos, n);
      this.pos = i2;
    }
    return n;
  }
  *pushUntil(test) {
    let i2 = this.pos;
    let ch = this.buffer[i2];
    while (!test(ch))
      ch = this.buffer[++i2];
    return yield* this.pushToIndex(i2, false);
  }
};

// node_modules/yaml/browser/dist/parse/line-counter.js
var LineCounter = class {
  constructor() {
    this.lineStarts = [];
    this.addNewLine = (offset) => this.lineStarts.push(offset);
    this.linePos = (offset) => {
      let low = 0;
      let high = this.lineStarts.length;
      while (low < high) {
        const mid = low + high >> 1;
        if (this.lineStarts[mid] < offset)
          low = mid + 1;
        else
          high = mid;
      }
      if (this.lineStarts[low] === offset)
        return { line: low + 1, col: 1 };
      if (low === 0)
        return { line: 0, col: offset };
      const start = this.lineStarts[low - 1];
      return { line: low, col: offset - start + 1 };
    };
  }
};

// node_modules/yaml/browser/dist/parse/parser.js
function includesToken(list, type) {
  for (let i2 = 0; i2 < list.length; ++i2)
    if (list[i2].type === type)
      return true;
  return false;
}
function findNonEmptyIndex(list) {
  for (let i2 = 0; i2 < list.length; ++i2) {
    switch (list[i2].type) {
      case "space":
      case "comment":
      case "newline":
        break;
      default:
        return i2;
    }
  }
  return -1;
}
function isFlowToken(token) {
  switch (token?.type) {
    case "alias":
    case "scalar":
    case "single-quoted-scalar":
    case "double-quoted-scalar":
    case "flow-collection":
      return true;
    default:
      return false;
  }
}
function getPrevProps(parent) {
  switch (parent.type) {
    case "document":
      return parent.start;
    case "block-map": {
      const it = parent.items[parent.items.length - 1];
      return it.sep ?? it.start;
    }
    case "block-seq":
      return parent.items[parent.items.length - 1].start;
    /* istanbul ignore next should not happen */
    default:
      return [];
  }
}
function getFirstKeyStartProps(prev) {
  if (prev.length === 0)
    return [];
  let i2 = prev.length;
  loop: while (--i2 >= 0) {
    switch (prev[i2].type) {
      case "doc-start":
      case "explicit-key-ind":
      case "map-value-ind":
      case "seq-item-ind":
      case "newline":
        break loop;
    }
  }
  while (prev[++i2]?.type === "space") {
  }
  return prev.splice(i2, prev.length);
}
function arrayPushArray(target, source) {
  if (source.length < 1e5)
    Array.prototype.push.apply(target, source);
  else
    for (let i2 = 0; i2 < source.length; ++i2)
      target.push(source[i2]);
}
function fixFlowSeqItems(fc) {
  if (fc.start.type === "flow-seq-start") {
    for (const it of fc.items) {
      if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
        if (it.key)
          it.value = it.key;
        delete it.key;
        if (isFlowToken(it.value)) {
          if (it.value.end)
            arrayPushArray(it.value.end, it.sep);
          else
            it.value.end = it.sep;
        } else
          arrayPushArray(it.start, it.sep);
        delete it.sep;
      }
    }
  }
}
var Parser = class {
  /**
   * @param onNewLine - If defined, called separately with the start position of
   *   each new line (in `parse()`, including the start of input).
   */
  constructor(onNewLine) {
    this.atNewLine = true;
    this.atScalar = false;
    this.indent = 0;
    this.offset = 0;
    this.onKeyLine = false;
    this.stack = [];
    this.source = "";
    this.type = "";
    this.lexer = new Lexer();
    this.onNewLine = onNewLine;
  }
  /**
   * Parse `source` as a YAML stream.
   * If `incomplete`, a part of the last line may be left as a buffer for the next call.
   *
   * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
   *
   * @returns A generator of tokens representing each directive, document, and other structure.
   */
  *parse(source, incomplete = false) {
    if (this.onNewLine && this.offset === 0)
      this.onNewLine(0);
    for (const lexeme of this.lexer.lex(source, incomplete))
      yield* this.next(lexeme);
    if (!incomplete)
      yield* this.end();
  }
  /**
   * Advance the parser by the `source` of one lexical token.
   */
  *next(source) {
    this.source = source;
    if (this.atScalar) {
      this.atScalar = false;
      yield* this.step();
      this.offset += source.length;
      return;
    }
    const type = tokenType(source);
    if (!type) {
      const message = `Not a YAML token: ${source}`;
      yield* this.pop({ type: "error", offset: this.offset, message, source });
      this.offset += source.length;
    } else if (type === "scalar") {
      this.atNewLine = false;
      this.atScalar = true;
      this.type = "scalar";
    } else {
      this.type = type;
      yield* this.step();
      switch (type) {
        case "newline":
          this.atNewLine = true;
          this.indent = 0;
          if (this.onNewLine)
            this.onNewLine(this.offset + source.length);
          break;
        case "space":
          if (this.atNewLine && source[0] === " ")
            this.indent += source.length;
          break;
        case "explicit-key-ind":
        case "map-value-ind":
        case "seq-item-ind":
          if (this.atNewLine)
            this.indent += source.length;
          break;
        case "doc-mode":
        case "flow-error-end":
          return;
        default:
          this.atNewLine = false;
      }
      this.offset += source.length;
    }
  }
  /** Call at end of input to push out any remaining constructions */
  *end() {
    while (this.stack.length > 0)
      yield* this.pop();
  }
  get sourceToken() {
    const st = {
      type: this.type,
      offset: this.offset,
      indent: this.indent,
      source: this.source
    };
    return st;
  }
  *step() {
    const top = this.peek(1);
    if (this.type === "doc-end" && top?.type !== "doc-end") {
      while (this.stack.length > 0)
        yield* this.pop();
      this.stack.push({
        type: "doc-end",
        offset: this.offset,
        source: this.source
      });
      return;
    }
    if (!top)
      return yield* this.stream();
    switch (top.type) {
      case "document":
        return yield* this.document(top);
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
        return yield* this.scalar(top);
      case "block-scalar":
        return yield* this.blockScalar(top);
      case "block-map":
        return yield* this.blockMap(top);
      case "block-seq":
        return yield* this.blockSequence(top);
      case "flow-collection":
        return yield* this.flowCollection(top);
      case "doc-end":
        return yield* this.documentEnd(top);
    }
    yield* this.pop();
  }
  peek(n) {
    return this.stack[this.stack.length - n];
  }
  *pop(error) {
    const token = error ?? this.stack.pop();
    if (!token) {
      const message = "Tried to pop an empty stack";
      yield { type: "error", offset: this.offset, source: "", message };
    } else if (this.stack.length === 0) {
      yield token;
    } else {
      const top = this.peek(1);
      if (token.type === "block-scalar") {
        token.indent = "indent" in top ? top.indent : 0;
      } else if (token.type === "flow-collection" && top.type === "document") {
        token.indent = 0;
      }
      if (token.type === "flow-collection")
        fixFlowSeqItems(token);
      switch (top.type) {
        case "document":
          top.value = token;
          break;
        case "block-scalar":
          top.props.push(token);
          break;
        case "block-map": {
          const it = top.items[top.items.length - 1];
          if (it.value) {
            top.items.push({ start: [], key: token, sep: [] });
            this.onKeyLine = true;
            return;
          } else if (it.sep) {
            it.value = token;
          } else {
            Object.assign(it, { key: token, sep: [] });
            this.onKeyLine = !it.explicitKey;
            return;
          }
          break;
        }
        case "block-seq": {
          const it = top.items[top.items.length - 1];
          if (it.value)
            top.items.push({ start: [], value: token });
          else
            it.value = token;
          break;
        }
        case "flow-collection": {
          const it = top.items[top.items.length - 1];
          if (!it || it.value)
            top.items.push({ start: [], key: token, sep: [] });
          else if (it.sep)
            it.value = token;
          else
            Object.assign(it, { key: token, sep: [] });
          return;
        }
        /* istanbul ignore next should not happen */
        default:
          yield* this.pop();
          yield* this.pop(token);
      }
      if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
        const last = token.items[token.items.length - 1];
        if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
          if (top.type === "document")
            top.end = last.start;
          else
            top.items.push({ start: last.start });
          token.items.splice(-1, 1);
        }
      }
    }
  }
  *stream() {
    switch (this.type) {
      case "directive-line":
        yield { type: "directive", offset: this.offset, source: this.source };
        return;
      case "byte-order-mark":
      case "space":
      case "comment":
      case "newline":
        yield this.sourceToken;
        return;
      case "doc-mode":
      case "doc-start": {
        const doc = {
          type: "document",
          offset: this.offset,
          start: []
        };
        if (this.type === "doc-start")
          doc.start.push(this.sourceToken);
        this.stack.push(doc);
        return;
      }
    }
    yield {
      type: "error",
      offset: this.offset,
      message: `Unexpected ${this.type} token in YAML stream`,
      source: this.source
    };
  }
  *document(doc) {
    if (doc.value)
      return yield* this.lineEnd(doc);
    switch (this.type) {
      case "doc-start": {
        if (findNonEmptyIndex(doc.start) !== -1) {
          yield* this.pop();
          yield* this.step();
        } else
          doc.start.push(this.sourceToken);
        return;
      }
      case "anchor":
      case "tag":
      case "space":
      case "comment":
      case "newline":
        doc.start.push(this.sourceToken);
        return;
    }
    const bv = this.startBlockValue(doc);
    if (bv)
      this.stack.push(bv);
    else {
      yield {
        type: "error",
        offset: this.offset,
        message: `Unexpected ${this.type} token in YAML document`,
        source: this.source
      };
    }
  }
  *scalar(scalar2) {
    if (this.type === "map-value-ind") {
      const prev = getPrevProps(this.peek(2));
      const start = getFirstKeyStartProps(prev);
      let sep;
      if (scalar2.end) {
        sep = scalar2.end;
        sep.push(this.sourceToken);
        delete scalar2.end;
      } else
        sep = [this.sourceToken];
      const map2 = {
        type: "block-map",
        offset: scalar2.offset,
        indent: scalar2.indent,
        items: [{ start, key: scalar2, sep }]
      };
      this.onKeyLine = true;
      this.stack[this.stack.length - 1] = map2;
    } else
      yield* this.lineEnd(scalar2);
  }
  *blockScalar(scalar2) {
    switch (this.type) {
      case "space":
      case "comment":
      case "newline":
        scalar2.props.push(this.sourceToken);
        return;
      case "scalar":
        scalar2.source = this.source;
        this.atNewLine = true;
        this.indent = 0;
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        yield* this.pop();
        break;
      /* istanbul ignore next should not happen */
      default:
        yield* this.pop();
        yield* this.step();
    }
  }
  *blockMap(map2) {
    const it = map2.items[map2.items.length - 1];
    switch (this.type) {
      case "newline":
        this.onKeyLine = false;
        if (it.value) {
          const end = "end" in it.value ? it.value.end : void 0;
          const last = Array.isArray(end) ? end[end.length - 1] : void 0;
          if (last?.type === "comment")
            end?.push(this.sourceToken);
          else
            map2.items.push({ start: [this.sourceToken] });
        } else if (it.sep) {
          it.sep.push(this.sourceToken);
        } else {
          it.start.push(this.sourceToken);
        }
        return;
      case "space":
      case "comment":
        if (it.value) {
          map2.items.push({ start: [this.sourceToken] });
        } else if (it.sep) {
          it.sep.push(this.sourceToken);
        } else {
          if (this.atIndentedComment(it.start, map2.indent)) {
            const prev = map2.items[map2.items.length - 2];
            const end = prev?.value?.end;
            if (Array.isArray(end)) {
              arrayPushArray(end, it.start);
              end.push(this.sourceToken);
              map2.items.pop();
              return;
            }
          }
          it.start.push(this.sourceToken);
        }
        return;
    }
    if (this.indent >= map2.indent) {
      const atMapIndent = !this.onKeyLine && this.indent === map2.indent;
      const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
      let start = [];
      if (atNextItem && it.sep && !it.value) {
        const nl = [];
        for (let i2 = 0; i2 < it.sep.length; ++i2) {
          const st = it.sep[i2];
          switch (st.type) {
            case "newline":
              nl.push(i2);
              break;
            case "space":
              break;
            case "comment":
              if (st.indent > map2.indent)
                nl.length = 0;
              break;
            default:
              nl.length = 0;
          }
        }
        if (nl.length >= 2)
          start = it.sep.splice(nl[1]);
      }
      switch (this.type) {
        case "anchor":
        case "tag":
          if (atNextItem || it.value) {
            start.push(this.sourceToken);
            map2.items.push({ start });
            this.onKeyLine = true;
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            it.start.push(this.sourceToken);
          }
          return;
        case "explicit-key-ind":
          if (!it.sep && !it.explicitKey) {
            it.start.push(this.sourceToken);
            it.explicitKey = true;
          } else if (atNextItem || it.value) {
            start.push(this.sourceToken);
            map2.items.push({ start, explicitKey: true });
          } else {
            this.stack.push({
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken], explicitKey: true }]
            });
          }
          this.onKeyLine = true;
          return;
        case "map-value-ind":
          if (it.explicitKey) {
            if (!it.sep) {
              if (includesToken(it.start, "newline")) {
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              } else {
                const start2 = getFirstKeyStartProps(it.start);
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                });
              }
            } else if (it.value) {
              map2.items.push({ start: [], key: null, sep: [this.sourceToken] });
            } else if (includesToken(it.sep, "map-value-ind")) {
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start, key: null, sep: [this.sourceToken] }]
              });
            } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
              const start2 = getFirstKeyStartProps(it.start);
              const key = it.key;
              const sep = it.sep;
              sep.push(this.sourceToken);
              delete it.key;
              delete it.sep;
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: start2, key, sep }]
              });
            } else if (start.length > 0) {
              it.sep = it.sep.concat(start, this.sourceToken);
            } else {
              it.sep.push(this.sourceToken);
            }
          } else {
            if (!it.sep) {
              Object.assign(it, { key: null, sep: [this.sourceToken] });
            } else if (it.value || atNextItem) {
              map2.items.push({ start, key: null, sep: [this.sourceToken] });
            } else if (includesToken(it.sep, "map-value-ind")) {
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: [], key: null, sep: [this.sourceToken] }]
              });
            } else {
              it.sep.push(this.sourceToken);
            }
          }
          this.onKeyLine = true;
          return;
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar": {
          const fs = this.flowScalar(this.type);
          if (atNextItem || it.value) {
            map2.items.push({ start, key: fs, sep: [] });
            this.onKeyLine = true;
          } else if (it.sep) {
            this.stack.push(fs);
          } else {
            Object.assign(it, { key: fs, sep: [] });
            this.onKeyLine = true;
          }
          return;
        }
        default: {
          const bv = this.startBlockValue(map2);
          if (bv) {
            if (bv.type === "block-seq") {
              if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                yield* this.pop({
                  type: "error",
                  offset: this.offset,
                  message: "Unexpected block-seq-ind on same line with key",
                  source: this.source
                });
                return;
              }
            } else if (atMapIndent) {
              map2.items.push({ start });
            }
            this.stack.push(bv);
            return;
          }
        }
      }
    }
    yield* this.pop();
    yield* this.step();
  }
  *blockSequence(seq2) {
    const it = seq2.items[seq2.items.length - 1];
    switch (this.type) {
      case "newline":
        if (it.value) {
          const end = "end" in it.value ? it.value.end : void 0;
          const last = Array.isArray(end) ? end[end.length - 1] : void 0;
          if (last?.type === "comment")
            end?.push(this.sourceToken);
          else
            seq2.items.push({ start: [this.sourceToken] });
        } else
          it.start.push(this.sourceToken);
        return;
      case "space":
      case "comment":
        if (it.value)
          seq2.items.push({ start: [this.sourceToken] });
        else {
          if (this.atIndentedComment(it.start, seq2.indent)) {
            const prev = seq2.items[seq2.items.length - 2];
            const end = prev?.value?.end;
            if (Array.isArray(end)) {
              arrayPushArray(end, it.start);
              end.push(this.sourceToken);
              seq2.items.pop();
              return;
            }
          }
          it.start.push(this.sourceToken);
        }
        return;
      case "anchor":
      case "tag":
        if (it.value || this.indent <= seq2.indent)
          break;
        it.start.push(this.sourceToken);
        return;
      case "seq-item-ind":
        if (this.indent !== seq2.indent)
          break;
        if (it.value || includesToken(it.start, "seq-item-ind"))
          seq2.items.push({ start: [this.sourceToken] });
        else
          it.start.push(this.sourceToken);
        return;
    }
    if (this.indent > seq2.indent) {
      const bv = this.startBlockValue(seq2);
      if (bv) {
        this.stack.push(bv);
        return;
      }
    }
    yield* this.pop();
    yield* this.step();
  }
  *flowCollection(fc) {
    const it = fc.items[fc.items.length - 1];
    if (this.type === "flow-error-end") {
      let top;
      do {
        yield* this.pop();
        top = this.peek(1);
      } while (top?.type === "flow-collection");
    } else if (fc.end.length === 0) {
      switch (this.type) {
        case "comma":
        case "explicit-key-ind":
          if (!it || it.sep)
            fc.items.push({ start: [this.sourceToken] });
          else
            it.start.push(this.sourceToken);
          return;
        case "map-value-ind":
          if (!it || it.value)
            fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
          else if (it.sep)
            it.sep.push(this.sourceToken);
          else
            Object.assign(it, { key: null, sep: [this.sourceToken] });
          return;
        case "space":
        case "comment":
        case "newline":
        case "anchor":
        case "tag":
          if (!it || it.value)
            fc.items.push({ start: [this.sourceToken] });
          else if (it.sep)
            it.sep.push(this.sourceToken);
          else
            it.start.push(this.sourceToken);
          return;
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar": {
          const fs = this.flowScalar(this.type);
          if (!it || it.value)
            fc.items.push({ start: [], key: fs, sep: [] });
          else if (it.sep)
            this.stack.push(fs);
          else
            Object.assign(it, { key: fs, sep: [] });
          return;
        }
        case "flow-map-end":
        case "flow-seq-end":
          fc.end.push(this.sourceToken);
          return;
      }
      const bv = this.startBlockValue(fc);
      if (bv)
        this.stack.push(bv);
      else {
        yield* this.pop();
        yield* this.step();
      }
    } else {
      const parent = this.peek(2);
      if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
        yield* this.pop();
        yield* this.step();
      } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
        const prev = getPrevProps(parent);
        const start = getFirstKeyStartProps(prev);
        fixFlowSeqItems(fc);
        const sep = fc.end.splice(1, fc.end.length);
        sep.push(this.sourceToken);
        const map2 = {
          type: "block-map",
          offset: fc.offset,
          indent: fc.indent,
          items: [{ start, key: fc, sep }]
        };
        this.onKeyLine = true;
        this.stack[this.stack.length - 1] = map2;
      } else {
        yield* this.lineEnd(fc);
      }
    }
  }
  flowScalar(type) {
    if (this.onNewLine) {
      let nl = this.source.indexOf("\n") + 1;
      while (nl !== 0) {
        this.onNewLine(this.offset + nl);
        nl = this.source.indexOf("\n", nl) + 1;
      }
    }
    return {
      type,
      offset: this.offset,
      indent: this.indent,
      source: this.source
    };
  }
  startBlockValue(parent) {
    switch (this.type) {
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
        return this.flowScalar(this.type);
      case "block-scalar-header":
        return {
          type: "block-scalar",
          offset: this.offset,
          indent: this.indent,
          props: [this.sourceToken],
          source: ""
        };
      case "flow-map-start":
      case "flow-seq-start":
        return {
          type: "flow-collection",
          offset: this.offset,
          indent: this.indent,
          start: this.sourceToken,
          items: [],
          end: []
        };
      case "seq-item-ind":
        return {
          type: "block-seq",
          offset: this.offset,
          indent: this.indent,
          items: [{ start: [this.sourceToken] }]
        };
      case "explicit-key-ind": {
        this.onKeyLine = true;
        const prev = getPrevProps(parent);
        const start = getFirstKeyStartProps(prev);
        start.push(this.sourceToken);
        return {
          type: "block-map",
          offset: this.offset,
          indent: this.indent,
          items: [{ start, explicitKey: true }]
        };
      }
      case "map-value-ind": {
        this.onKeyLine = true;
        const prev = getPrevProps(parent);
        const start = getFirstKeyStartProps(prev);
        return {
          type: "block-map",
          offset: this.offset,
          indent: this.indent,
          items: [{ start, key: null, sep: [this.sourceToken] }]
        };
      }
    }
    return null;
  }
  atIndentedComment(start, indent) {
    if (this.type !== "comment")
      return false;
    if (this.indent <= indent)
      return false;
    return start.every((st) => st.type === "newline" || st.type === "space");
  }
  *documentEnd(docEnd) {
    if (this.type !== "doc-mode") {
      if (docEnd.end)
        docEnd.end.push(this.sourceToken);
      else
        docEnd.end = [this.sourceToken];
      if (this.type === "newline")
        yield* this.pop();
    }
  }
  *lineEnd(token) {
    switch (this.type) {
      case "comma":
      case "doc-start":
      case "doc-end":
      case "flow-seq-end":
      case "flow-map-end":
      case "map-value-ind":
        yield* this.pop();
        yield* this.step();
        break;
      case "newline":
        this.onKeyLine = false;
      // fallthrough
      case "space":
      case "comment":
      default:
        if (token.end)
          token.end.push(this.sourceToken);
        else
          token.end = [this.sourceToken];
        if (this.type === "newline")
          yield* this.pop();
    }
  }
};

// node_modules/yaml/browser/dist/public-api.js
function parseOptions(options) {
  const prettyErrors = options.prettyErrors !== false;
  const lineCounter = options.lineCounter || prettyErrors && new LineCounter() || null;
  return { lineCounter, prettyErrors };
}
function parseDocument(source, options = {}) {
  const { lineCounter, prettyErrors } = parseOptions(options);
  const parser = new Parser(lineCounter?.addNewLine);
  const composer = new Composer(options);
  let doc = null;
  for (const _doc of composer.compose(parser.parse(source), true, source.length)) {
    if (!doc)
      doc = _doc;
    else if (doc.options.logLevel !== "silent") {
      doc.errors.push(new YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
      break;
    }
  }
  if (prettyErrors && lineCounter) {
    doc.errors.forEach(prettifyError(source, lineCounter));
    doc.warnings.forEach(prettifyError(source, lineCounter));
  }
  return doc;
}
function parse(src, reviver, options) {
  let _reviver = void 0;
  if (typeof reviver === "function") {
    _reviver = reviver;
  } else if (options === void 0 && reviver && typeof reviver === "object") {
    options = reviver;
  }
  const doc = parseDocument(src, options);
  if (!doc)
    return null;
  doc.warnings.forEach((warning) => warn(doc.options.logLevel, warning));
  if (doc.errors.length > 0) {
    if (doc.options.logLevel !== "silent")
      throw doc.errors[0];
    else
      doc.errors = [];
  }
  return doc.toJS(Object.assign({ reviver: _reviver }, options));
}

// src/core/frontmatter.ts
var FrontmatterError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "FrontmatterError";
  }
};
var OPEN = /^---[ \t]*(\r?\n)/;
var CLOSE = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m;
function splitFrontmatter(text) {
  const open = OPEN.exec(text);
  if (open) {
    const rest = text.slice(open[0].length);
    const close = CLOSE.exec(rest);
    if (close) {
      return {
        yaml: rest.slice(0, close.index),
        open: open[0],
        close: close[0],
        body: rest.slice(close.index + close[0].length),
        eol: open[1]
      };
    }
  }
  const eol = /\r\n/.test(text) ? "\r\n" : "\n";
  return { yaml: void 0, open: "", close: "", body: text, eol };
}
function readFrontmatter(text) {
  const { yaml } = splitFrontmatter(text);
  if (yaml === void 0 || yaml.trim() === "") return {};
  let data;
  try {
    data = parse(yaml);
  } catch (e) {
    throw new FrontmatterError(`The frontmatter is not valid YAML: ${e instanceof Error ? e.message : e}`);
  }
  if (data === null || data === void 0) return {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new FrontmatterError("The frontmatter is not a list of keys and values.");
  }
  return data;
}
function readNotesMeta(text) {
  const fm = readFrontmatter(text);
  const meta = {
    authors: stringList(fm["authors"]),
    deprecated: fm["deprecated"] === true,
    previous_paths: stringList(fm["previous_paths"])
  };
  for (const key of ["title", "version", "posted", "video", "factoriobin"]) {
    const v = optionalString(fm[key]);
    if (v !== void 0) meta[key] = v;
  }
  return meta;
}
function updateFrontmatter(text, updates) {
  const note = splitFrontmatter(text);
  const yaml = note.yaml ?? "";
  const eol = note.eol;
  const lines2 = yaml === "" ? [] : yaml.replace(/\r?\n$/, "").split(/\r?\n/);
  const keyLines = topLevelKeyLines(yaml);
  const edits = [];
  const appended = [];
  for (const [key, value] of Object.entries(updates)) {
    const i2 = keyLines.findIndex((k) => k.key === key);
    if (i2 === -1) {
      if (value !== void 0) appended.push(...renderPair(key, value));
      continue;
    }
    const start = keyLines[i2].line;
    let end = i2 + 1 < keyLines.length ? keyLines[i2 + 1].line : lines2.length;
    while (end > start + 1 && /^(?:\s*|#.*)$/.test(lines2[end - 1])) end--;
    edits.push({ key, start, end });
  }
  edits.sort((a, b) => b.start - a.start);
  for (const { key, start, end } of edits) {
    const value = updates[key];
    lines2.splice(start, end - start, ...value === void 0 ? [] : renderPair(key, value));
  }
  lines2.push(...appended);
  const open = note.yaml === void 0 ? "---" + eol : note.open;
  const close = note.yaml === void 0 ? "---" + eol : note.close || "---";
  const out = open + lines2.map((l) => l + eol).join("") + close + note.body;
  const check = readFrontmatter(out);
  for (const [key, value] of Object.entries(updates)) {
    if (JSON.stringify(check[key]) !== JSON.stringify(value)) {
      throw new FrontmatterError(`Could not set "${key}" in the frontmatter.`);
    }
  }
  return out;
}
function bumpVersion(version) {
  if (version === void 0 || version.trim() === "") return "2";
  const m = /^(.*?)(\d+)(\D*)$/.exec(version.trim());
  if (!m) return void 0;
  return `${m[1]}${BigInt(m[2]) + 1n}${m[3]}`;
}
function topLevelKeyLines(yaml) {
  if (yaml.trim() === "") return [];
  const doc = parseDocument(yaml);
  if (doc.errors.length > 0) {
    throw new FrontmatterError(`The frontmatter is not valid YAML: ${doc.errors[0].message}`);
  }
  if (doc.contents === null) return [];
  if (!isMap(doc.contents) || doc.contents.flow) {
    throw new FrontmatterError("The frontmatter is not a list of keys and values.");
  }
  const lineStarts = [0];
  for (let i2 = 0; i2 < yaml.length; i2++) if (yaml[i2] === "\n") lineStarts.push(i2 + 1);
  const lineOf = (offset) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) line++;
    return line;
  };
  const result = [];
  for (const pair of doc.contents.items) {
    if (!isScalar(pair.key) || !pair.key.range) {
      throw new FrontmatterError("The frontmatter has a key that is not plain text.");
    }
    const line = lineOf(pair.key.range[0]);
    if (result.some((r) => r.line === line)) {
      throw new FrontmatterError("The frontmatter has two keys on one line.");
    }
    result.push({ key: String(pair.key.value), line });
  }
  return result;
}
function renderPair(key, value) {
  const doc = new Document({ [key]: value });
  const pair = isMap(doc.contents) ? doc.contents.items[0] : void 0;
  const node2 = pair?.value;
  if (isSeq(node2) || isMap(node2)) node2.flow = true;
  if (isScalar(node2) && typeof node2.value === "string" && /[\r\n]|^[\d.]+$/.test(node2.value)) {
    node2.type = "QUOTE_DOUBLE";
  }
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n$/, "").split("\n");
}
function optionalString(v) {
  if (v === null || v === void 0) return void 0;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.trim() === "" ? void 0 : v;
  return void 0;
}
function stringList(v) {
  if (Array.isArray(v)) return v.map(optionalString).filter((s) => s !== void 0);
  const one = optionalString(v);
  return one === void 0 ? [] : [one];
}

// src/core/notes-template.ts
var DEFAULT_NOTES_TEMPLATE = `---
title:
authors: []
version: "1"
posted:
---
`;
function fillNotesTemplate(template, fields) {
  const updates = { title: fields.title, posted: fields.posted };
  if (fields.authors.length > 0) updates["authors"] = fields.authors;
  return updateFrontmatter(template, updates);
}

// src/core/blueprint-folder.ts
var BLUEPRINT_FILE = "blueprint.json";
var NOTES_FILE = "README.md";
function joinPath(...parts) {
  return parts.flatMap((p) => p.split("/")).filter((p) => p !== "").join("/");
}
function parentFolder(path) {
  const i2 = path.lastIndexOf("/");
  return i2 === -1 ? "" : path.slice(0, i2);
}
function baseName(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}
function isScannedPath(path) {
  return path.split("/").every((seg) => seg === "" || !/^[_.]/.test(seg));
}
function selfAndAncestors(folder) {
  const out = [];
  let f = joinPath(folder);
  for (; ; ) {
    out.push(f);
    if (f === "") return out;
    f = parentFolder(f);
  }
}
async function findBlueprintFolder(folder, hasBlueprintFile) {
  for (const f of selfAndAncestors(folder)) {
    if (f !== "" && isScannedPath(f) && await hasBlueprintFile(f)) return f;
  }
  return void 0;
}

// src/core/book-tree.ts
var KIND_KEYS2 = [
  ["blueprint", "blueprint"],
  ["blueprint_book", "blueprint-book"],
  ["upgrade_planner", "upgrade-planner"],
  ["deconstruction_planner", "deconstruction-planner"]
];
function bookTree(value) {
  return node(value, []);
}
function flattenTree(root) {
  const out = [];
  const visit3 = (n) => {
    out.push(n);
    n.children.forEach(visit3);
  };
  visit3(root);
  return out;
}
var UNLABELED = {
  blueprint: "Blueprint",
  "blueprint-book": "Book",
  "upgrade-planner": "Upgrade planner",
  "deconstruction-planner": "Deconstruction planner"
};
function displayLabel(n) {
  if (n.label !== "") return n.label;
  return n.slot === void 0 ? UNLABELED[n.kind] : `${UNLABELED[n.kind]} (slot ${n.slot})`;
}
function node(value, slots) {
  if (!isObject2(value)) return void 0;
  for (const [key, kind] of KIND_KEYS2) {
    const body = value[key];
    if (!isObject2(body)) continue;
    const label = typeof body["label"] === "string" ? plainLabel(body["label"]) : "";
    const result = {
      slot: slots.length === 0 ? void 0 : slots[slots.length - 1],
      slots,
      path: slots.join("/"),
      kind,
      label,
      children: []
    };
    const entries = body["blueprints"];
    if (kind === "blueprint-book" && Array.isArray(entries)) {
      const children = [];
      entries.forEach((entry, position) => {
        const index = isObject2(entry) ? entry["index"] : void 0;
        const slot = typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : position;
        const child = node(entry, [...slots, slot]);
        if (child) children.push(child);
      });
      result.children = children.sort((a, b) => a.slot - b.slot);
    }
    return result;
  }
  return void 0;
}
function isObject2(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// src/core/links.ts
var DEFAULT_LINK_BASE = "https://blueprints.abucnasty.dev";
function stringUrl(base, folder, slots = [], sha) {
  const entry = slots.map((s) => `/${checkSlot(s)}`).join("");
  const at = sha === void 0 || sha === "" ? "" : `@${checkSha(sha)}`;
  return `${folderUrl(base, folder)}${entry}${at}.txt`;
}
function coverUrl(base, folder) {
  return `${folderUrl(base, folder)}/cover.jpg`;
}
function folderUrl(base, folder) {
  const path = encodePath(folder);
  if (path === "") throw new Error("A link needs a blueprint folder path.");
  return `${base.trim().replace(/\/+$/, "")}/${path}`;
}
function encodePath(path) {
  return path.split("/").filter((s) => s !== "").map((s) => encodeURIComponent(s).replace(/\(/g, "%28").replace(/\)/g, "%29")).join("/");
}
function checkSlot(slot) {
  if (!Number.isInteger(slot) || slot < 0) throw new Error(`Not a slot number: ${slot}`);
  return slot;
}
function checkSha(sha) {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`Not a commit SHA: ${sha}`);
  return sha;
}

// src/core/generated-block.ts
function generatedBlockLines(input) {
  const inner = [];
  if (input.hasRenders) {
    inner.push(`![${escapeInline(input.title)}](${coverUrl(input.base, input.folder)})`);
  }
  if (input.tree.kind === "blueprint-book" && input.tree.children.length > 0) {
    if (inner.length > 0) inner.push("");
    const visit3 = (n, depth) => {
      const indent = "  ".repeat(depth);
      const label = escapeInline(displayLabel(n));
      const url = stringUrl(input.base, input.folder, n.slots);
      inner.push(n.kind === "blueprint-book" ? `${indent}- ${label} ([book](${url}))` : `${indent}- [${label}](${url})`);
      for (const c of n.children) visit3(c, depth + 1);
    };
    for (const c of input.tree.children) visit3(c, 0);
  }
  return inner.length === 0 ? void 0 : inner;
}
var COVER_LINE = /^!\[(?:[^\]\\]|\\.)*\]\(https?:\/\/[^\s()]+\/cover\.jpg\)[ \t]*$/;
var LIST_ITEM = /^[ \t]*- (?:\[(?:[^\]\\]|\\.)*\]\(https?:\/\/[^\s()]+\.txt\)|.*\(\[book\]\(https?:\/\/[^\s()]+\.txt\)\))[ \t]*$/;
function lines(body) {
  const out = [];
  for (let start = 0; start < body.length; ) {
    const nl = body.indexOf("\n", start);
    const end = nl === -1 ? body.length : nl + 1;
    out.push({ text: body.slice(start, nl === -1 ? end : nl).replace(/\r$/, ""), start, end });
    start = end;
  }
  return out;
}
var blank = (l) => l.text.trim() === "";
function findGeneratedBlock(body) {
  const ls = lines(body);
  let i2 = 0;
  while (i2 < ls.length && blank(ls[i2])) i2++;
  const first = i2;
  let end;
  if (i2 < ls.length && COVER_LINE.test(ls[i2].text)) {
    end = ls[i2].end;
    i2++;
    while (i2 < ls.length && blank(ls[i2])) i2++;
  }
  while (i2 < ls.length && LIST_ITEM.test(ls[i2].text)) {
    end = ls[i2].end;
    i2++;
  }
  return end === void 0 ? void 0 : { start: ls[first].start, end };
}
function applyGeneratedBlock(note, blockLines) {
  const split = splitFrontmatter(note);
  const head = note.slice(0, note.length - split.body.length);
  const eol = split.yaml !== void 0 ? split.eol : /\r\n/.test(note) ? "\r\n" : "\n";
  const legacy = removeLegacyMarkedBlock(split.body);
  if (legacy === "invalid") {
    return {
      status: "invalid",
      text: note,
      reason: "This note has an incomplete or repeated <!-- blueprint:generated --> marker; remove it by hand."
    };
  }
  const body = legacy ?? split.body;
  const found = findGeneratedBlock(body);
  if (found === void 0 && legacy === void 0 && blockLines === void 0) return { status: "unchanged", text: note };
  const rest = (found ? body.slice(found.end) : body).replace(/^(?:[ \t]*\r?\n)+/, "");
  const lead = split.yaml !== void 0 ? eol : "";
  const text = blockLines === void 0 ? head + (rest === "" ? "" : lead + rest) : head + lead + blockLines.join(eol) + eol + (rest === "" ? "" : eol + rest);
  if (text === note) return { status: "unchanged", text };
  const existed = found !== void 0 || legacy !== void 0;
  return { status: blockLines === void 0 ? "removed" : existed ? "replaced" : "inserted", text };
}
var LEGACY_START = "<!-- blueprint:generated:start -->";
var LEGACY_END = "<!-- blueprint:generated:end -->";
function removeLegacyMarkedBlock(body) {
  const count2 = (m) => body.split(m).length - 1;
  if (count2(LEGACY_START) + count2(LEGACY_END) === 0) return void 0;
  if (count2(LEGACY_START) !== 1 || count2(LEGACY_END) !== 1) return "invalid";
  const ls = lines(body);
  const s = ls.findIndex((l) => l.text.trim() === LEGACY_START);
  const e = ls.findIndex((l) => l.text.trim() === LEGACY_END);
  if (s === -1 || e === -1 || e < s) return "invalid";
  const before = body.slice(0, ls[s].start);
  let after = body.slice(ls[e].end);
  if (/(?:^|\n)[ \t]*\r?\n$/.test(before) || before === "") after = after.replace(/^[ \t]*\r?\n/, "");
  return before + after;
}
function escapeInline(text) {
  const oneLine2 = text.replace(/\s+/g, " ").trim();
  let out = oneLine2.replace(/[\\`*_[\]{}<>#!|~=$%^&]/g, "\\$&");
  out = out.replace(/^([-+])/, "\\$1").replace(/^(\d+)([.)])/, "$1\\$2");
  return out;
}

// src/core/sha256.ts
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function sha256Hex(data) {
  const bitLength = data.length * 8;
  const padded = new Uint8Array(data.length + 9 + 63 >> 6 << 6);
  padded.set(data);
  padded[data.length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 4294967296));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const h = new Uint32Array([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i2 = 0; i2 < 16; i2++) w[i2] = view.getUint32(off + i2 * 4);
    for (let i2 = 16; i2 < 64; i2++) {
      const a2 = w[i2 - 15];
      const b2 = w[i2 - 2];
      const s0 = rotr(a2, 7) ^ rotr(a2, 18) ^ a2 >>> 3;
      const s1 = rotr(b2, 17) ^ rotr(b2, 19) ^ b2 >>> 10;
      w[i2] = w[i2 - 16] + s0 + w[i2 - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i2 = 0; i2 < 64; i2++) {
      const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + (e & f ^ ~e & g) + K[i2] + w[i2] >>> 0;
      const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + (a & b ^ a & c ^ b & c) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h[0] = h[0] + a >>> 0;
    h[1] = h[1] + b >>> 0;
    h[2] = h[2] + c >>> 0;
    h[3] = h[3] + d >>> 0;
    h[4] = h[4] + e >>> 0;
    h[5] = h[5] + f >>> 0;
    h[6] = h[6] + g >>> 0;
    h[7] = h[7] + hh >>> 0;
  }
  return Array.from(h, (x2) => x2.toString(16).padStart(8, "0")).join("");
}
function rotr(x2, n) {
  return x2 >>> n | x2 << 32 - n;
}

// src/core/render-state.ts
var RENDER_MANIFEST = "render.json";
function blueprintHash(blueprint) {
  return sha256Hex(new TextEncoder().encode(writeCompactSortedJson(blueprint)));
}
function renderTargets(value) {
  const out = [];
  const visit3 = (node2, slots) => {
    if (!isObject3(node2)) return;
    const bp = node2["blueprint"];
    if (isObject3(bp)) {
      if (arrayLength2(bp["entities"]) + arrayLength2(bp["tiles"]) === 0) return;
      const path = slots.join("/");
      const key = path === "" ? "0" : path;
      out.push({ key, path, file: `${key}.jpg`, label: typeof bp["label"] === "string" ? bp["label"] : "", hash: blueprintHash(bp) });
      return;
    }
    const book = node2["blueprint_book"];
    if (!isObject3(book) || !Array.isArray(book["blueprints"])) return;
    const children = book["blueprints"].map((entry, position) => {
      const index = isObject3(entry) ? entry["index"] : void 0;
      return { entry, slot: typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : position };
    });
    children.sort((a, b) => a.slot - b.slot);
    for (const c of children) visit3(c.entry, [...slots, c.slot]);
  };
  visit3(value, []);
  return out;
}
function parseRenderManifest(text) {
  if (text === void 0) return void 0;
  try {
    const v = JSON.parse(text);
    if (!isObject3(v) || v["schema"] !== 1 || !isObject3(v["entries"])) return void 0;
    const entries = {};
    for (const [k, e] of Object.entries(v["entries"])) {
      if (isObject3(e) && typeof e["file"] === "string" && typeof e["sha256"] === "string") {
        entries[k] = e;
      }
    }
    return { schema: 1, rendered_at: typeof v["rendered_at"] === "string" ? v["rendered_at"] : "", entries };
  } catch {
    return void 0;
  }
}
function renderState(value, manifest, images) {
  const present = new Set(images);
  const claimed = /* @__PURE__ */ new Set();
  const entries = renderTargets(value).map((t) => {
    const recorded = manifest?.entries[t.key];
    const image = present.has(t.file) ? t.file : void 0;
    if (image !== void 0) claimed.add(image);
    const state = image === void 0 ? "none" : recorded !== void 0 && recorded.sha256 === t.hash ? "current" : "outdated";
    return { ...t, state, image };
  });
  const orphans = images.filter((f) => !claimed.has(f)).sort();
  const count2 = (s) => entries.filter((e) => e.state === s).length;
  const counts = { total: entries.length, current: count2("current"), outdated: count2("outdated"), none: count2("none"), orphans: orphans.length };
  const overall = counts.total === 0 || counts.none === counts.total ? "none" : counts.current === counts.total ? "current" : "outdated";
  return { entries, orphans, overall, counts };
}
function renderStateLabel(s) {
  if (s.counts.total === 0) return "Render: nothing to render";
  if (s.overall === "none") return "Render: none";
  if (s.overall === "current") return "Render: current";
  const stale = s.counts.total - s.counts.current;
  return s.counts.total === 1 ? "Render: outdated" : `Render: ${stale} of ${s.counts.total} outdated`;
}
function arrayLength2(v) {
  return Array.isArray(v) ? v.length : 0;
}
function isObject3(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// src/core/stats.ts
var STATS_KEYS = ["entities", "tiles", "blueprints", "factorio_version"];
function blueprintStats(value) {
  const d = describeBlueprint(value);
  const stats = {};
  if (d.kind === "blueprint" || d.kind === "blueprint-book") {
    stats.entities = d.counts.entities;
    if (d.counts.tiles > 0) stats.tiles = d.counts.tiles;
  }
  if (d.kind === "blueprint-book") stats.blueprints = d.counts.blueprints;
  if (d.factorioVersion !== void 0) stats.factorio_version = d.factorioVersion;
  return stats;
}
function applyStatsToNote(note, stats) {
  const fm = readFrontmatter(note);
  const updates = {};
  for (const key of STATS_KEYS) {
    const want = stats[key];
    const has = Object.prototype.hasOwnProperty.call(fm, key);
    if (want === void 0 ? has : !has || fm[key] !== want) updates[key] = want;
  }
  return Object.keys(updates).length === 0 ? note : updateFrontmatter(note, updates);
}

// src/commands/copy-blueprint.ts
async function copyBlueprintString(host, contextFolder) {
  const folder = await findBlueprintFolder(
    contextFolder,
    (f) => host.files.exists(joinPath(f, BLUEPRINT_FILE))
  );
  if (folder === void 0) {
    return reject(host, "This is not inside a blueprint folder (a folder with a blueprint.json).");
  }
  const path = joinPath(folder, BLUEPRINT_FILE);
  let summary;
  let encoded;
  try {
    const value = readCanonicalJson(await host.files.read(path));
    summary = summarizeBlueprint(describeBlueprint(value));
    encoded = encodeBlueprintString(value);
  } catch (e) {
    return reject(host, `Could not read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await host.clipboard.writeText(encoded);
  } catch (e) {
    return reject(host, `Could not write to the clipboard: ${e instanceof Error ? e.message : String(e)}`);
  }
  host.ui.notice(`Copied ${summary} from ${folder}. Paste it in Factorio with Import string.`);
  return { action: "copied", folder, string: encoded };
}
function reject(host, reason) {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}

// src/commands/copy-link.ts
async function copyLiveLink(host, contextFolder) {
  const folder = await findBlueprintFolder(contextFolder, (f) => host.files.exists(joinPath(f, BLUEPRINT_FILE)));
  if (folder === void 0) return reject2(host, "This is not inside a blueprint folder (a folder with a blueprint.json).");
  let tree;
  try {
    tree = bookTree(readCanonicalJson(await host.files.read(joinPath(folder, BLUEPRINT_FILE))));
  } catch (e) {
    return reject2(host, `Could not read ${folder}/${BLUEPRINT_FILE}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!tree) return reject2(host, `${folder}/${BLUEPRINT_FILE} is not a blueprint, book or planner.`);
  let node2 = tree;
  if (tree.kind === "blueprint-book" && tree.children.length > 0) {
    const nodes = flattenTree(tree);
    const index = await host.ui.pick(nodes.map(pickItem), "Link to the whole book or one entry");
    if (index === void 0) return { action: "cancelled" };
    node2 = nodes[index];
  }
  const url = stringUrl(host.settings.linkBase, folder, node2.slots);
  try {
    await host.clipboard.writeText(url);
  } catch (e) {
    return reject2(host, `Could not write to the clipboard: ${e instanceof Error ? e.message : String(e)}`);
  }
  const what = node2.slots.length === 0 ? `${KIND_NAMES[node2.kind]} ${folder}` : `"${displayLabel(node2)}" (slot ${node2.path}) of ${folder}`;
  host.ui.notice(`Copied the live link to ${what}: ${url}`);
  return { action: "copied", folder, url };
}
function pickItem(n) {
  if (n.slots.length === 0) return { label: `Whole book: ${displayLabel(n)}`, detail: "slot path: none (the root)" };
  const indent = " ".repeat(n.slots.length - 1);
  return { label: `${indent}${displayLabel(n)}`, detail: `slot ${n.path} · ${KIND_NAMES[n.kind]}` };
}
function reject2(host, reason) {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}

// src/commands/generated-notes.ts
var IMAGE = /\.(?:jpe?g|png|webp)$/i;
async function listRenderFiles(host, folder) {
  const root = joinPath(folder, "renders");
  if (!await host.files.exists(root)) return [];
  const out = [];
  const walk = async (dir) => {
    const { files, folders } = await host.files.list(dir);
    for (const f of files) if (IMAGE.test(f)) out.push(f.slice(root.length + 1));
    for (const d of folders) await walk(d);
  };
  await walk(root);
  return out.sort();
}
async function noteWithBlock(host, folder, note, value) {
  const tree = bookTree(value);
  if (!tree) return { status: "invalid", text: note, reason: `${folder}/${BLUEPRINT_FILE} is not a blueprint.` };
  let title;
  try {
    title = readNotesMeta(note).title ?? baseName(folder);
  } catch {
    title = baseName(folder);
  }
  const hasRenders = (await listRenderFiles(host, folder)).length > 0;
  const lines2 = generatedBlockLines({ base: host.settings.linkBase, folder, title, tree, hasRenders });
  const block = applyGeneratedBlock(note, lines2);
  if (block.status === "invalid") return block;
  let text;
  try {
    text = applyStatsToNote(block.text, blueprintStats(value));
  } catch (e) {
    return { status: "invalid", text: note, reason: e instanceof Error ? e.message : String(e) };
  }
  if (text === note) return { status: "unchanged", text: note };
  return { status: block.status === "unchanged" ? "replaced" : block.status, text };
}
async function refreshGeneratedBlock(host, folder) {
  const notesPath = joinPath(folder, NOTES_FILE);
  try {
    if (!await host.files.exists(notesPath)) return { status: "skipped", folder, reason: "no README.md" };
    const note = await host.files.read(notesPath);
    const value = readCanonicalJson(await host.files.read(joinPath(folder, BLUEPRINT_FILE)));
    const update = await noteWithBlock(host, folder, note, value);
    if (update.status === "invalid") return { status: "skipped", folder, reason: update.reason };
    if (update.status === "unchanged") return { status: "unchanged", folder };
    await host.files.write(notesPath, update.text);
    return { status: "changed", folder };
  } catch (e) {
    return { status: "skipped", folder, reason: e instanceof Error ? e.message : String(e) };
  }
}
async function findBlueprintFolders(host, from = "") {
  const out = [];
  const walk = async (dir) => {
    const { files, folders } = await host.files.list(dir);
    if (dir !== "" && files.includes(joinPath(dir, BLUEPRINT_FILE))) {
      out.push(dir);
      return;
    }
    for (const d of folders) if (!/^[_.]/.test(baseName(d))) await walk(d);
  };
  await walk(from);
  return out.sort();
}
async function refreshAllGeneratedBlocks(host) {
  const results = [];
  for (const folder of await findBlueprintFolders(host)) results.push(await refreshGeneratedBlock(host, folder));
  const changed = results.filter((r) => r.status === "changed").length;
  const unchanged = results.filter((r) => r.status === "unchanged").length;
  const skipped = results.filter((r) => r.status === "skipped");
  const lines2 = [
    `Generated content: ${changed} note${changed === 1 ? "" : "s"} changed, ${unchanged} already current` + (skipped.length > 0 ? `, ${skipped.length} skipped` : "") + ". Not committed; the Git plugin's sync will pick the changes up.",
    ...skipped.map((s) => `Skipped ${s.folder}: ${s.reason}`)
  ];
  host.ui.notice(lines2.join("\n"), skipped.length > 0 ? "error" : "info");
  return results;
}

// src/commands/git-notice.ts
function reportGit(host, done, git, extra = "", warn2 = extra !== "") {
  switch (git.status) {
    case "pushed":
      host.ui.notice(`${done}, committed and pushed (${git.commit}).${extra}`, warn2 ? "error" : "info");
      return;
    case "nothing-to-commit":
      host.ui.notice(`${done}. Git found nothing new to commit.${extra}`, warn2 ? "error" : "info");
      return;
    case "failed": {
      const lfs = git.step === "push" && /\blfs\b|batch response/i.test(git.message) ? " Render images are uploaded with Git LFS: run _tools/setup/setup-machine.sh on this computer, then sync again." : "";
      host.ui.notice(
        (git.committed ? `${done} and committed ${git.commit ?? ""} locally, but ${git.message}.${lfs} The Git plugin's timed sync will try again.` : `${done}, but ${git.message}. The files are saved; the Git plugin's timed sync will commit them.`) + extra,
        "error"
      );
      return;
    }
  }
}

// src/commands/render-preview.ts
var RENDER_SCRIPT = "_tools/render/bin/render.js";
var RENDER_MODULES = "_tools/render/node_modules";
var active;
function isRendering() {
  return active !== void 0;
}
function cancelRender() {
  if (!active) return false;
  active.abort();
  return true;
}
async function renderPreview(host, contextFolder, options = {}) {
  if (active) {
    host.ui.notice("A render is already running; wait for it or cancel it first.", "error");
    return { action: "busy" };
  }
  const controller = new AbortController();
  active = controller;
  try {
    return await run(host, contextFolder, controller.signal, options);
  } finally {
    active = void 0;
  }
}
async function run(host, contextFolder, signal, options) {
  const { files, ui } = host;
  const folder = await findBlueprintFolder(contextFolder, (f) => files.exists(joinPath(f, BLUEPRINT_FILE)));
  if (folder === void 0) return reject3(host, "This is not inside a blueprint folder (a folder with a blueprint.json).");
  if (host.processes === void 0 || host.vaultPath === void 0) {
    return reject3(host, "Rendering needs the desktop app with the vault on this computer's disk.");
  }
  const settings = host.settings.render;
  if (settings.factorioPath.trim() === "") {
    ui.notice(
      "Set the Factorio path for this computer (Settings, Factorio Blueprints, Factorio path), then render again.",
      "error"
    );
    ui.openSettings?.();
    return { action: "needs-settings" };
  }
  if (!await files.exists(RENDER_SCRIPT)) {
    return reject3(host, `The render tool is missing (${RENDER_SCRIPT}). Pull the latest vault and try again.`);
  }
  if (!await files.exists(RENDER_MODULES)) {
    return reject3(
      host,
      `The render tool's dependencies are not installed. In a terminal, run:
cd "${absolute(host.vaultPath, "_tools/render")}" && npm ci
then render again.`
    );
  }
  const abs = (p) => absolute(host.vaultPath, p);
  const node2 = settings.nodePath.trim() || "node";
  let only = [];
  if (options.onlyNeeded) {
    let value;
    try {
      value = readCanonicalJson(await files.read(joinPath(folder, BLUEPRINT_FILE)));
    } catch (e) {
      return reject3(host, `Could not read ${folder}/${BLUEPRINT_FILE}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const manifestPath = joinPath(folder, "renders", RENDER_MANIFEST);
    const manifest = await files.exists(manifestPath) ? parseRenderManifest(await files.read(manifestPath)) : void 0;
    const state = renderState(value, manifest, await listRenderFiles(host, folder));
    const needed = state.entries.filter((e) => e.state !== "current").map((e) => e.path);
    if (needed.length === 0 && state.counts.total > 0) {
      ui.notice(`The render of ${folder} is already current.`);
      return { action: "rendered", folder, images: [], problems: [], committed: false };
    }
    if (needed.length < state.counts.total && !needed.includes("")) only = needed;
  }
  const args = [
    abs(RENDER_SCRIPT),
    "--factorio",
    settings.factorioPath.trim(),
    "--input",
    abs(joinPath(folder, BLUEPRINT_FILE)),
    "--out",
    abs(joinPath(folder, "renders")),
    "--json",
    ...only.length > 0 ? ["--only", only.join(",")] : [],
    ...settings.extraArgs
  ];
  const progress = ui.progress(`Rendering ${folder}: starting Factorio…`);
  let result;
  try {
    result = await host.processes.run(node2, args, {
      cwd: host.vaultPath,
      signal,
      onStderrLine: (line) => {
        const text = line.trim();
        if (text !== "") progress.update(`Rendering ${folder}: ${text.length > 120 ? text.slice(0, 117) + "…" : text}`);
      }
    });
  } finally {
    progress.close();
  }
  if (signal.aborted) {
    ui.notice(`Render of ${folder} cancelled. Nothing was committed.`);
    return { action: "cancelled" };
  }
  const sandbox = result.sandbox;
  if (sandbox?.failure === "no-permission") {
    return fail(
      host,
      `Obsidian runs as a Flatpak, so the render has to start outside its sandbox, which it is not allowed to do yet. In a terminal, run:
flatpak override --user --talk-name=org.freedesktop.Flatpak ${sandbox.appId}
then quit and reopen Obsidian and render again.`
    );
  }
  if (sandbox?.failure === "launcher-missing") {
    return fail(
      host,
      "Obsidian runs as a Flatpak, but flatpak-spawn, which starts the render outside its sandbox, is not available in it, so the render cannot run."
    );
  }
  if (result.code === -1 || sandbox?.failure === "command-not-found") {
    const why = result.code === -1 ? result.error ?? "unknown error" : lastErrorLine(result.stderr);
    return fail(
      host,
      `Could not start Node.js (${node2}): ${why}. Set "Node path" in the plugin settings.` + (sandbox ? " Obsidian runs as a Flatpak, so it must be the full path to node on the computer itself (what `which node` prints in a terminal)." : "")
    );
  }
  if (result.code !== 0 && result.code !== 2) {
    return fail(host, `Render of ${folder} failed: ${lastErrorLine(result.stderr)}. Nothing was committed.`);
  }
  const report = parseReport(result.stdout);
  const images = report ? reportedFiles(report) : await listRenderFiles(host, folder);
  const problems = report ? reportedProblems(report) : result.code === 2 ? ["some blueprints got no image (no report)"] : [];
  const summary = `Rendered ${images.length} image${images.length === 1 ? "" : "s"} for ${folder}` + (problems.length > 0 ? ` (${problems.length} problem${problems.length === 1 ? "" : "s"}: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "; …" : ""})` : "");
  if (images.length === 0) {
    ui.notice(`${summary}. Nothing to commit.`, "error");
    return { action: "rendered", folder, images, problems, committed: false };
  }
  const block = await refreshGeneratedBlock(host, folder);
  const blockNote = block.status === "skipped" && block.reason !== "no README.md" ? ` Notes not updated: ${block.reason}` : "";
  if (!host.settings.commitAfterImport || host.git === void 0) {
    ui.notice(`${summary}.${blockNote}`, problems.length > 0 ? "error" : "info");
    return { action: "rendered", folder, images, problems, committed: false };
  }
  if (!await host.git.lfsAvailable()) {
    ui.notice(
      `${summary}, but git-lfs is not installed on this computer, so the images were not committed (they must not go into plain git). Run _tools/setup/setup-machine.sh, then commit with the Git plugin.${blockNote}`,
      "error"
    );
    return { action: "rendered", folder, images, problems, committed: false };
  }
  const git = await host.git.commitAndSync(folder, await commitMessage(host, folder));
  reportGit(host, summary, git, blockNote, blockNote !== "" || problems.length > 0);
  return {
    action: "rendered",
    folder,
    images,
    problems,
    committed: git.status === "pushed" || git.status === "failed" && git.committed
  };
}
async function commitMessage(host, folder) {
  let title = folder.slice(folder.lastIndexOf("/") + 1);
  let version;
  try {
    const meta = readNotesMeta(await host.files.read(joinPath(folder, NOTES_FILE)));
    title = meta.title ?? title;
    version = meta.version;
  } catch {
  }
  return `render ${title}${version !== void 0 ? ` ${version}` : ""}`.replace(/\s+/g, " ").trim();
}
function parseReport(stdout) {
  const text = stdout.trim();
  if (text === "") return void 0;
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
  } catch {
    return void 0;
  }
}
function reportedFiles(report) {
  const images = Array.isArray(report["images"]) ? report["images"] : [];
  return images.map((i2) => typeof i2 === "object" && i2 !== null ? i2["file"] : void 0).filter((f) => typeof f === "string" && f !== "").sort();
}
function reportedProblems(report) {
  const out = [];
  const name = (r) => {
    const label = typeof r["label"] === "string" && r["label"] !== "" ? ` "${r["label"]}"` : "";
    const path = typeof r["path"] === "string" && r["path"] !== "" ? `slot ${r["path"]}` : "the blueprint";
    return path + label;
  };
  const count2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v) ? Object.values(v).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0) : 0;
  const list = (key) => Array.isArray(report[key]) ? report[key] : [];
  for (const p of list("problems")) if (typeof p === "string" && p !== "") out.push(p);
  for (const m of list("without_image")) {
    if (typeof m !== "object" || m === null) continue;
    const r = m;
    if (r["reason"] === "empty blueprint") continue;
    out.push(`${name(r)}: no image${typeof r["reason"] === "string" ? ` (${r["reason"]})` : ""}`);
  }
  for (const i2 of list("images")) {
    if (typeof i2 !== "object" || i2 === null) continue;
    const r = i2;
    const n = count2(r["failed"]) + count2(r["missing"]);
    if (n > 0) out.push(`${name(r)}: ${n} entit${n === 1 ? "y" : "ies"} not built`);
  }
  return out;
}
function lastErrorLine(stderr) {
  const lines2 = stderr.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  const line = [...lines2].reverse().find((l) => /^render: /.test(l)) ?? lines2.at(-1) ?? "no output";
  return line.length > 300 ? line.slice(0, 297) + "…" : line;
}
function absolute(vaultPath, path) {
  return `${vaultPath.replace(/[\\/]+$/, "")}/${path}`;
}
function reject3(host, reason) {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}
function fail(host, reason) {
  host.ui.notice(reason, "error");
  return { action: "failed", reason };
}

// src/commands/render-status.ts
async function folderRenderState(host, folder) {
  const value = readCanonicalJson(await host.files.read(joinPath(folder, BLUEPRINT_FILE)));
  const manifestPath = joinPath(folder, "renders", RENDER_MANIFEST);
  const manifest = await host.files.exists(manifestPath) ? parseRenderManifest(await host.files.read(manifestPath)) : void 0;
  return renderState(value, manifest, await listRenderFiles(host, folder));
}
async function foldersNeedingRender(host) {
  const out = [];
  for (const folder of await findBlueprintFolders(host)) {
    try {
      const state = await folderRenderState(host, folder);
      if (state.counts.total > 0 && state.overall !== "current") out.push({ folder, state });
    } catch {
    }
  }
  return out;
}
function describeState(s) {
  return renderStateLabel(s).replace(/^Render: /, "");
}
async function showFoldersNeedingRender(host) {
  const progress = host.ui.progress("Checking render state of every blueprint…");
  let list;
  try {
    list = await foldersNeedingRender(host);
  } finally {
    progress.close();
  }
  if (list.length === 0) {
    host.ui.notice("Every blueprint's render is current.");
    return;
  }
  const items = [
    { label: `Render all ${list.length} that need it`, detail: "one after another; Cancel render preview stops after the current one" },
    ...list.map((f) => ({ label: f.folder, detail: describeState(f.state) }))
  ];
  const chosen = await host.ui.pick(items, "Blueprints whose render is missing or outdated");
  if (chosen === void 0) return;
  if (chosen === 0) {
    await renderAll(host, list.map((f) => f.folder));
    return;
  }
  await host.ui.openNote?.(joinPath(list[chosen - 1].folder, NOTES_FILE));
}
var queueCancelled = false;
function cancelRenderAll() {
  const running = isRendering();
  queueCancelled = true;
  if (running) cancelRender();
  return running;
}
async function renderAllNeeded(host) {
  const progress = host.ui.progress("Checking render state of every blueprint…");
  let list;
  try {
    list = await foldersNeedingRender(host);
  } finally {
    progress.close();
  }
  if (list.length === 0) {
    host.ui.notice("Every blueprint's render is current.");
    return;
  }
  await renderAll(host, list.map((f) => f.folder));
}
async function renderAll(host, folders) {
  if (isRendering()) {
    host.ui.notice("A render is already running; wait for it or cancel it first.", "error");
    return { rendered: [], failed: [], cancelled: false };
  }
  queueCancelled = false;
  const result = { rendered: [], failed: [], cancelled: false };
  const overall = host.ui.progress(`Rendering ${folders.length} blueprints…`);
  try {
    for (const [i2, folder] of folders.entries()) {
      if (queueCancelled) {
        result.cancelled = true;
        break;
      }
      overall.update(`Rendering ${i2 + 1} of ${folders.length}: ${folder}`);
      const out = await renderPreview(host, folder, { onlyNeeded: true });
      if (out.action === "rendered") result.rendered.push(folder);
      else if (out.action === "cancelled") result.cancelled = true;
      else if (out.action === "needs-settings") {
        result.failed.push({ folder, reason: "Factorio path not set" });
        break;
      } else result.failed.push({ folder, reason: "reason" in out ? out.reason : out.action });
      if (result.cancelled) break;
    }
  } finally {
    overall.close();
    queueCancelled = false;
  }
  const lines2 = [
    `Render all: ${result.rendered.length} of ${folders.length} rendered` + (result.failed.length > 0 ? `, ${result.failed.length} failed` : "") + (result.cancelled ? ", cancelled" : "") + ".",
    ...result.failed.map((f) => `${f.folder}: ${f.reason.split("\n")[0]}`)
  ];
  host.ui.notice(lines2.join("\n"), result.failed.length > 0 || result.cancelled ? "error" : "info");
  return result;
}

// src/commands/import-blueprint.ts
async function chooseImportTarget(host, contextFolder) {
  const folder = await findBlueprintFolder(
    contextFolder,
    (f) => host.files.exists(joinPath(f, BLUEPRINT_FILE))
  );
  if (folder !== void 0) return { mode: "update", folder };
  if (!isScannedPath(contextFolder)) {
    return {
      mode: "refuse",
      reason: `Blueprints cannot be created in "${contextFolder}": folders starting with "_" or "." are never scanned.`
    };
  }
  return { mode: "create", parent: joinPath(contextFolder) };
}
async function importFromClipboard(host, contextFolder) {
  const { ui } = host;
  let text;
  try {
    text = await host.clipboard.readText();
  } catch (e) {
    return reject4(host, `Could not read the clipboard: ${errorText2(e)}`);
  }
  let value;
  let json;
  let description;
  try {
    ({ value, json } = decodeBlueprintString(text));
    description = describeBlueprint(value);
  } catch (e) {
    return reject4(host, clipboardErrorMessage(e));
  }
  const lossy = findLossyNumbers(json);
  if (lossy.length > 0) {
    return reject4(
      host,
      `This blueprint has numbers that cannot be stored exactly (${lossy.slice(0, 3).join(", ")}). Nothing was written.`
    );
  }
  const canonical = writeCanonicalJson(value);
  const summary = summarizeBlueprint(description);
  const target = await chooseImportTarget(host, contextFolder);
  if (target.mode === "refuse") return reject4(host, target.reason);
  const commit = host.settings.commitAfterImport && host.git !== void 0;
  let folder;
  let blockWarning = "";
  let commitMessage2;
  let action;
  if (target.mode === "update") {
    folder = target.folder;
    const jsonPath = joinPath(folder, BLUEPRINT_FILE);
    const notesPath = joinPath(folder, NOTES_FILE);
    const previous = await host.files.read(jsonPath).catch(() => void 0);
    if (previous === canonical) {
      ui.notice(`${folder} already holds this ${KIND_NAMES[description.kind]}; nothing to do.`);
      return { action: "unchanged", folder };
    }
    const notes = await host.files.exists(notesPath) ? await host.files.read(notesPath).catch(() => void 0) : void 0;
    let meta;
    try {
      meta = notes === void 0 ? void 0 : readNotesMeta(notes);
    } catch {
      meta = void 0;
    }
    const title = meta?.title ?? baseName(folder);
    const answer = await ui.askUpdate({
      folder,
      title,
      summary,
      previousSummary: previous === void 0 ? void 0 : safeSummary(previous),
      currentVersion: meta?.version,
      suggestedVersion: bumpVersion(meta?.version),
      canBumpVersion: notes !== void 0 && meta !== void 0,
      askChangeNote: commit
    });
    if (!answer) return { action: "cancelled" };
    try {
      await host.files.write(jsonPath, canonical);
      if (notes !== void 0) {
        let next = notes;
        if (answer.newVersion !== void 0 && answer.newVersion !== meta?.version) {
          next = updateFrontmatter(next, { version: answer.newVersion });
        }
        const block = await noteWithBlock(host, folder, next, value);
        if (block.status === "invalid") blockWarning = ` ${block.reason}`;
        else next = block.text;
        if (next !== notes) await host.files.write(notesPath, next);
      }
    } catch (e) {
      return reject4(host, `Could not write ${folder}: ${errorText2(e)}`);
    }
    commitMessage2 = oneLine(answer.changeNote) || `update ${title}`;
    action = "updated";
  } else {
    const title = plainLabel(description.label ?? "") || capitalize(KIND_NAMES[description.kind]);
    const slug = slugify(title) || slugify(KIND_NAMES[description.kind]);
    const checkSlug = (s) => checkNewSlug(host, target.parent, s);
    const answer = await ui.askCreate({
      parent: target.parent,
      summary,
      title,
      slug,
      askChangeNote: commit,
      checkSlug
    });
    if (!answer) return { action: "cancelled" };
    const problem = await checkSlug(answer.slug);
    if (problem !== void 0) return reject4(host, problem);
    const newTitle = oneLine(answer.title) || title;
    folder = joinPath(target.parent, answer.slug);
    try {
      await host.files.mkdir(folder);
      await host.files.write(joinPath(folder, BLUEPRINT_FILE), canonical);
      const template = await readTemplate(host);
      const notes = fillNotesTemplate(template, {
        title: newTitle,
        posted: host.today(),
        authors: host.settings.authors
      });
      const block = await noteWithBlock(host, folder, notes, value);
      if (block.status === "invalid") blockWarning = ` ${block.reason}`;
      await host.files.write(joinPath(folder, NOTES_FILE), block.text);
    } catch (e) {
      return reject4(host, `Could not write ${folder}: ${errorText2(e)}`);
    }
    commitMessage2 = oneLine(answer.changeNote) || `add ${newTitle}`;
    action = "created";
    if (ui.openNote) await ui.openNote(joinPath(folder, NOTES_FILE)).catch(() => void 0);
  }
  const verb = action === "created" ? "Created" : "Updated";
  let renderNote = "";
  if (action === "updated") {
    try {
      const state = await folderRenderState(host, folder);
      if (state.overall === "outdated") {
        renderNote = ` (its render is now outdated: ${describeState(state)}; run Render preview)`;
      }
    } catch {
    }
  }
  let git;
  if (!commit) {
    ui.notice(`${verb} ${folder} with ${summary}${renderNote}.${blockWarning}`);
  } else {
    git = await host.git.commitAndSync(folder, commitMessage2);
    reportGit(host, `${verb} ${folder} with ${summary}${renderNote}`, git, blockWarning);
  }
  if (host.settings.render.afterImport) await renderPreview(host, folder);
  return { action, folder, git };
}
async function checkNewSlug(host, parent, slug) {
  if (!isValidSlug(slug)) {
    return "Use lowercase letters, digits and single dashes only, for example military-science-240.";
  }
  if (await host.files.exists(joinPath(parent, slug))) {
    return `${joinPath(parent, slug)} already exists; choose another name.`;
  }
  return void 0;
}
async function readTemplate(host) {
  const path = host.settings.templatePath.trim();
  if (path !== "") {
    try {
      if (await host.files.exists(path)) return await host.files.read(path);
    } catch {
    }
  }
  return DEFAULT_NOTES_TEMPLATE;
}
function clipboardErrorMessage(e) {
  if (e instanceof BlueprintStringError) {
    switch (e.code) {
      case "empty":
        return "The clipboard is empty. Copy a blueprint string in Factorio first.";
      case "not-a-blueprint-string":
        return "The clipboard does not hold a blueprint string. In Factorio, open the blueprint and choose Export to string.";
      case "unsupported-version":
        return `${e.message} This string is from a newer Factorio format that this plugin cannot read.`;
      case "corrupt":
        return `${e.message} Copy the string again; it may have been cut short.`;
      case "not-a-blueprint":
        return e.message;
    }
  }
  return `Could not read the blueprint string: ${errorText2(e)}`;
}
function safeSummary(text) {
  try {
    return summarizeBlueprint(describeBlueprint(readCanonicalJson(text)));
  } catch {
    return void 0;
  }
}
function reject4(host, reason) {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}
function oneLine(s) {
  return s.replace(/\s+/g, " ").trim();
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function errorText2(e) {
  return e instanceof Error ? e.message : String(e);
}

// src/obsidian/host.ts
var import_obsidian3 = require("obsidian");

// src/git/commit-and-sync.ts
var BUSY_MARKERS = [
  ["MERGE_HEAD", "a merge is in progress"],
  ["rebase-merge", "a rebase is in progress"],
  ["rebase-apply", "a rebase or am is in progress"],
  ["CHERRY_PICK_HEAD", "a cherry-pick is in progress"],
  ["REVERT_HEAD", "a revert is in progress"],
  ["index.lock", "another git command is running"]
];
async function commitAndSync(opts) {
  const { run: run2, pathExists, folder, message } = opts;
  const pathspec = ["--", folder === "" ? "." : folder];
  const lit = "--literal-pathspecs";
  const inside = await run2(["rev-parse", "--is-inside-work-tree"]);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    return fail2("check", false, "the vault is not a git repository", inside);
  }
  const busy = await busyReason(run2, pathExists);
  if (busy !== void 0) return fail2("check", false, `git is busy: ${busy}`);
  const add = await run2([lit, "add", "-A", ...pathspec]);
  if (add.code !== 0) return fail2("stage", false, "git add failed", add);
  const staged = await run2([lit, "diff", "--cached", "--quiet", ...pathspec]);
  if (staged.code === 0) return { status: "nothing-to-commit" };
  if (staged.code !== 1) return fail2("stage", false, "git diff failed", staged);
  const commitOut = await run2([lit, "commit", "--only", "-m", message, ...pathspec]);
  if (commitOut.code !== 0) return fail2("commit", false, "git commit failed", commitOut);
  const head = await run2(["rev-parse", "--short", "HEAD"]);
  const commit = head.stdout.trim();
  const pull = await run2(["pull", "--no-rebase", "--no-edit"]);
  if (pull.code !== 0) {
    let note = "git pull failed";
    if (await gitPathExists(run2, pathExists, "MERGE_HEAD")) {
      const abort = await run2(["merge", "--abort"]);
      note = abort.code === 0 ? "git pull hit a merge conflict, so the merge was undone" : "git pull hit a merge conflict and undoing it failed; resolve it in the Git plugin";
    }
    return fail2("pull", true, note, pull, commit);
  }
  const push = await run2(["push"]);
  if (push.code !== 0) return fail2("push", true, "git push failed", push, commit);
  return { status: "pushed", commit };
}
async function busyReason(run2, pathExists) {
  for (const [marker, reason] of BUSY_MARKERS) {
    if (await gitPathExists(run2, pathExists, marker)) return reason;
  }
  return void 0;
}
async function gitPathExists(run2, pathExists, name) {
  const out = await run2(["rev-parse", "--git-path", name]);
  return out.code === 0 && await pathExists(out.stdout.trim());
}
function fail2(step, committed, what, out, commit) {
  const detail = out ? firstErrorLine(out) : "";
  const result = {
    status: "failed",
    step,
    committed,
    message: detail ? `${what}: ${detail}` : what
  };
  if (commit !== void 0) result.commit = commit;
  return result;
}
function firstErrorLine(out) {
  const lines2 = (out.stderr + "\n" + out.stdout).split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "" && !/^hint:/i.test(l));
  const line = lines2.find((l) => /\blfs\b|batch response/i.test(l) && !/^(?:uploading lfs objects|git lfs)/i.test(l)) ?? lines2.find((l) => /^(fatal|error):/i.test(l)) ?? lines2.find((l) => /conflict/i.test(l)) ?? lines2[0] ?? "";
  return line.length > 200 ? line.slice(0, 197) + "..." : line;
}
async function lfsAvailable(run2) {
  const out = await run2(["lfs", "version"]);
  return out.code === 0 && /git-lfs/i.test(out.stdout + out.stderr);
}

// src/git/node-runner.ts
var import_child_process = require("child_process");
var import_fs = require("fs");
var import_path = require("path");
var TIMEOUT_MS = 12e4;
function createGitRunner(gitBinary, cwd) {
  const env = {
    ...process.env,
    // Fail instead of waiting for a password prompt nobody can see.
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    // Commits go through without an editor; merges use the default message.
    GIT_EDITOR: "true",
    GIT_MERGE_AUTOEDIT: "no"
  };
  return (args) => new Promise((done) => {
    (0, import_child_process.execFile)(
      gitBinary,
      args,
      { cwd, env, timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        let code = 0;
        if (error) {
          const c = error.code;
          code = typeof c === "number" ? c : -1;
          if (code === -1 && !stderr) stderr = `could not run ${gitBinary}: ${error.message}`;
        }
        done({ code, stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
}
function nodePathExists(cwd) {
  return async (p) => (0, import_fs.existsSync)((0, import_path.resolve)(cwd, p));
}
function defaultGitBinary() {
  if (process.platform === "darwin") {
    for (const p of ["/opt/homebrew/bin/git", "/usr/local/bin/git"]) {
      if ((0, import_fs.existsSync)(p)) return p;
    }
  }
  return "git";
}

// src/process/flatpak.ts
var import_fs3 = require("fs");

// src/process/node-process.ts
var import_child_process2 = require("child_process");
var import_fs2 = require("fs");
var nodeProcessRunner = {
  run(program, args, { cwd, signal, onStderrLine }) {
    return new Promise((done) => {
      let stdout = "";
      let stderr = "";
      let partial = "";
      let settled = false;
      const finish = (r) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        done(r);
      };
      let child;
      try {
        child = (0, import_child_process2.spawn)(program, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      } catch (e) {
        finish({ code: -1, stdout, stderr, error: e instanceof Error ? e.message : String(e) });
        return;
      }
      const onAbort = () => child.kill("SIGINT");
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort);
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (d) => stdout += d);
      child.stderr?.on("data", (d) => {
        stderr += d;
        partial += d;
        const lines2 = partial.split(/\r?\n/);
        partial = lines2.pop() ?? "";
        for (const line of lines2) onStderrLine?.(line);
      });
      child.on("error", (e) => finish({ code: -1, stdout, stderr, error: e.message }));
      child.on("close", (code) => {
        if (partial !== "") onStderrLine?.(partial);
        finish({ code, stdout, stderr });
      });
    });
  }
};
function defaultNodeBinary() {
  if (process.platform === "darwin") {
    for (const p of ["/opt/homebrew/bin/node", "/usr/local/bin/node"]) if ((0, import_fs2.existsSync)(p)) return p;
  }
  return "node";
}

// src/process/flatpak.ts
var DEFAULT_FLATPAK_APP_ID = "md.obsidian.Obsidian";
function flatpakAppId(env = process.env, readInfo = () => (0, import_fs3.existsSync)("/.flatpak-info") ? (0, import_fs3.readFileSync)("/.flatpak-info", "utf8") : void 0) {
  const id = env["FLATPAK_ID"]?.trim();
  if (id) return id;
  let info;
  try {
    info = readInfo();
  } catch {
    info = "";
  }
  if (info === void 0) return void 0;
  return /^\s*name\s*=\s*(\S+)\s*$/m.exec(info)?.[1] ?? DEFAULT_FLATPAK_APP_ID;
}
function launchCommand(program, args, cwd, sandboxed, launcher = "flatpak-spawn") {
  if (!sandboxed) return { command: program, args };
  return { command: launcher, args: ["--host", "--watch-bus", `--directory=${cwd}`, program, ...args] };
}
function sandboxFailure(r) {
  if (r.code === -1) return /ENOENT|not found/i.test(r.error ?? "") ? "launcher-missing" : void 0;
  if (r.code === 0 || r.stdout.trim() !== "") return void 0;
  if (/org\.freedesktop\.Flatpak/.test(r.stderr)) return "no-permission";
  if (r.code === 127 || /Failed to (?:start|execute|spawn)[^\n]*(?:No such file|not found)/i.test(r.stderr)) {
    return "command-not-found";
  }
  return void 0;
}
function hostProcessRunner(appId, launcher = "flatpak-spawn", inner = nodeProcessRunner) {
  return {
    async run(program, args, options) {
      const launch = launchCommand(program, args, options.cwd, true, launcher);
      const result = await inner.run(launch.command, launch.args, options);
      const failure = sandboxFailure(result);
      return { ...result, sandbox: failure === void 0 ? { appId } : { appId, failure } };
    }
  };
}
function processRunnerForThisApp() {
  const appId = flatpakAppId();
  return appId === void 0 ? nodeProcessRunner : hostProcessRunner(appId);
}

// src/obsidian/modals.ts
var import_obsidian = require("obsidian");
var AnswerModal = class extends import_obsidian.Modal {
  resolve;
  answered = false;
  ask() {
    return new Promise((resolve2) => {
      this.resolve = resolve2;
      this.open();
    });
  }
  finish(answer) {
    if (this.answered) return;
    this.answered = true;
    this.resolve?.(answer);
    this.close();
  }
  onClose() {
    this.contentEl.empty();
    if (!this.answered) {
      this.answered = true;
      this.resolve?.(void 0);
    }
  }
  buttons(okText, onOk) {
    new import_obsidian.Setting(this.contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.finish(void 0))).addButton((b) => b.setButtonText(okText).setCta().onClick(onOk));
    this.scope.register([], "Enter", (evt) => {
      evt.preventDefault();
      onOk();
      return false;
    });
  }
};
var CreateBlueprintModal = class extends AnswerModal {
  prompt;
  constructor(app, prompt) {
    super(app);
    this.prompt = prompt;
  }
  onOpen() {
    const p = this.prompt;
    let title = p.title;
    let slug = p.slug;
    let slugEdited = false;
    let note = "";
    let busy = false;
    let slugInput;
    this.titleEl.setText("Import new blueprint");
    this.contentEl.createEl("p", { text: `Importing ${p.summary}.` });
    new import_obsidian.Setting(this.contentEl).setName("Title").setDesc("Shown in the notes and the catalog.").addText(
      (t) => t.setValue(title).onChange((v) => {
        title = v;
        if (!slugEdited) {
          slug = slugify(v);
          slugInput?.setValue(slug);
          void showProblem();
        }
      })
    );
    new import_obsidian.Setting(this.contentEl).setName("Folder name").setDesc(`Created in ${p.parent === "" ? "the vault root" : p.parent}/.`).addText((t) => {
      slugInput = t;
      t.setValue(slug).onChange((v) => {
        slug = v.trim();
        slugEdited = true;
        void showProblem();
      });
    });
    const problemEl = this.contentEl.createEl("p", { cls: "mod-warning" });
    const showProblem = async () => {
      const problem = await p.checkSlug(slug);
      problemEl.setText(problem ?? "");
      return problem;
    };
    void showProblem();
    if (p.askChangeNote) {
      new import_obsidian.Setting(this.contentEl).setName("Change note").setDesc("Optional, one line. Used as the commit message.").addText((t) => t.setPlaceholder(`add ${title}`).onChange((v) => note = v));
    }
    this.buttons("Import", () => {
      if (busy) return;
      busy = true;
      void showProblem().then((problem) => {
        busy = false;
        if (problem === void 0) this.finish({ title: title.trim(), slug, changeNote: note });
      });
    });
  }
};
var UpdateBlueprintModal = class extends AnswerModal {
  prompt;
  constructor(app, prompt) {
    super(app);
    this.prompt = prompt;
  }
  onOpen() {
    const p = this.prompt;
    let bump = p.canBumpVersion && p.suggestedVersion !== void 0;
    let version = p.suggestedVersion ?? p.currentVersion ?? "";
    let note = "";
    this.titleEl.setText(`Update ${p.title}`);
    this.contentEl.createEl("p", { text: `Replace the blueprint in ${p.folder}/.` });
    const list = this.contentEl.createEl("ul");
    list.createEl("li", { text: `Now: ${p.previousSummary ?? "unreadable blueprint.json"}` });
    list.createEl("li", { text: `New: ${p.summary}` });
    this.contentEl.createEl("p", { text: "The notes are not changed, apart from the version if you bump it." });
    if (p.canBumpVersion) {
      new import_obsidian.Setting(this.contentEl).setName("Bump version").setDesc(`Current version: ${p.currentVersion ?? "none"}. New version:`).addToggle((t) => t.setValue(bump).onChange((v) => bump = v)).addText((t) => t.setValue(version).onChange((v) => version = v.trim()));
    }
    if (p.askChangeNote) {
      new import_obsidian.Setting(this.contentEl).setName("Change note").setDesc("Optional, one line. Used as the commit message.").addText((t) => t.setPlaceholder(`update ${p.title}`).onChange((v) => note = v));
    }
    this.buttons(
      "Update",
      () => this.finish({ newVersion: bump && version !== "" ? version : void 0, changeNote: note })
    );
  }
};
var PickModal = class extends import_obsidian.SuggestModal {
  items;
  resolve;
  chosen;
  constructor(app, items, placeholder) {
    super(app);
    this.items = items;
    this.setPlaceholder(placeholder);
  }
  ask() {
    return new Promise((resolve2) => {
      this.resolve = resolve2;
      this.open();
    });
  }
  getSuggestions(query) {
    const q = query.trim().toLowerCase();
    return this.items.map((_, i2) => i2).filter((i2) => q === "" || `${this.items[i2].label} ${this.items[i2].detail ?? ""}`.toLowerCase().includes(q));
  }
  renderSuggestion(index, el) {
    const item = this.items[index];
    el.createEl("div", { text: item.label });
    if (item.detail) el.createEl("small", { text: item.detail, cls: "setting-item-description" });
  }
  onChooseSuggestion(index) {
    this.chosen = index;
  }
  onClose() {
    super.onClose();
    setTimeout(() => this.resolve?.(this.chosen), 0);
  }
};

// src/obsidian/settings.ts
var import_obsidian2 = require("obsidian");
var DEFAULT_SETTINGS = {
  authors: "",
  commitAfterImport: true,
  templatePath: "_tools/templates/blueprint-notes.md",
  linkBase: DEFAULT_LINK_BASE
};
var LOCAL = {
  gitBinary: "factorio-blueprints-git-binary",
  factorioPath: "factorio-blueprints-factorio-path",
  nodePath: "factorio-blueprints-node-path",
  renderArgs: "factorio-blueprints-render-args",
  renderAfterImport: "factorio-blueprints-render-after-import"
};
var GIT_BINARY_KEY = LOCAL.gitBinary;
function parseAuthors(authors) {
  return authors.split(",").map((a) => a.trim()).filter((a) => a !== "");
}
function parseArgs(text) {
  return [...text.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}
function localString(app, key) {
  const v = app.loadLocalStorage(key);
  return typeof v === "string" ? v : "";
}
function loadRenderSettings(app) {
  return {
    factorioPath: localString(app, LOCAL.factorioPath),
    nodePath: localString(app, LOCAL.nodePath) || defaultNodeBinary(),
    extraArgs: parseArgs(localString(app, LOCAL.renderArgs)),
    afterImport: app.loadLocalStorage(LOCAL.renderAfterImport) === true
  };
}
var BlueprintSettingTab = class extends import_obsidian2.PluginSettingTab {
  owner;
  constructor(app, owner) {
    super(app, owner);
    this.owner = owner;
  }
  display() {
    const { containerEl } = this;
    const s = this.owner.settings;
    containerEl.empty();
    new import_obsidian2.Setting(containerEl).setName("Default authors").setDesc("Written to the authors field of new blueprints. Separate names with commas.").addText(
      (t) => t.setPlaceholder("abucnasty").setValue(s.authors).onChange(async (v) => {
        s.authors = v;
        await this.owner.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Commit after import and render").setDesc("After an import or a render, commit just that blueprint folder, then pull and push.").addToggle(
      (t) => t.setValue(s.commitAfterImport).onChange(async (v) => {
        s.commitAfterImport = v;
        await this.owner.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Notes template").setDesc("Vault path of the README.md template for new blueprints. A built-in copy is used if it is missing.").addText(
      (t) => t.setPlaceholder(DEFAULT_SETTINGS.templatePath).setValue(s.templatePath).onChange(async (v) => {
        s.templatePath = v.trim() || DEFAULT_SETTINGS.templatePath;
        await this.owner.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Live link address").setDesc("Base URL of the link service, used for copied links and the links in notes.").addText(
      (t) => t.setPlaceholder(DEFAULT_LINK_BASE).setValue(s.linkBase).onChange(async (v) => {
        s.linkBase = v.trim().replace(/\/+$/, "") || DEFAULT_LINK_BASE;
        await this.owner.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("This computer").setHeading();
    containerEl.createEl("p", {
      text: "Saved on this computer only, not synced.",
      cls: "setting-item-description"
    });
    this.localText(
      "Git binary",
      "Leave empty to use git from the PATH (on a Mac, Homebrew's git if installed).",
      LOCAL.gitBinary,
      "git"
    );
    this.localText(
      "Factorio path",
      "The Factorio executable or install folder, for Render preview. The full game, not the headless build.",
      LOCAL.factorioPath,
      "/path/to/factorio"
    );
    this.localText(
      "Node path",
      "Node.js 22 or later, which runs the render tool. Leave empty to use node from the PATH (on a Mac, Homebrew's node if installed).",
      LOCAL.nodePath,
      "node"
    );
    this.localText(
      "Extra render arguments",
      "Added to every render, for example --show-window.",
      LOCAL.renderArgs,
      "--show-window"
    );
    new import_obsidian2.Setting(containerEl).setName("Render after import").setDesc("Run Render preview right after each import (a second commit). Needs the Factorio path.").addToggle(
      (t) => t.setValue(this.app.loadLocalStorage(LOCAL.renderAfterImport) === true).onChange((v) => this.app.saveLocalStorage(LOCAL.renderAfterImport, v ? true : null))
    );
  }
  localText(name, desc, key, placeholder) {
    new import_obsidian2.Setting(this.containerEl).setName(name).setDesc(desc).addText(
      (t) => t.setPlaceholder(placeholder).setValue(localString(this.app, key)).onChange((v) => this.app.saveLocalStorage(key, v.trim() === "" ? null : v.trim()))
    );
  }
};

// src/obsidian/host.ts
function createObsidianHost(app, settings, openSettings) {
  const adapter = app.vault.adapter;
  const vaultDir = adapter instanceof import_obsidian3.FileSystemAdapter ? adapter.getBasePath() : void 0;
  const p = (path) => (0, import_obsidian3.normalizePath)(path === "" ? "/" : path);
  const gitRunner = (dir) => {
    const configured = app.loadLocalStorage(GIT_BINARY_KEY);
    const binary2 = typeof configured === "string" && configured !== "" ? configured : defaultGitBinary();
    return createGitRunner(binary2, dir);
  };
  return {
    settings,
    today: () => localDate(/* @__PURE__ */ new Date()),
    vaultPath: vaultDir,
    processes: vaultDir === void 0 ? void 0 : processRunnerForThisApp(),
    files: {
      exists: (path) => adapter.exists(p(path)),
      read: (path) => adapter.read(p(path)),
      async write(path, text) {
        const file = app.vault.getFileByPath(p(path));
        if (file) await app.vault.modify(file, text);
        else if (await adapter.exists(p(path))) await adapter.write(p(path), text);
        else await app.vault.create(p(path), text);
      },
      async mkdir(path) {
        if (await adapter.exists(p(path))) return;
        await app.vault.createFolder(p(path));
      },
      async list(path) {
        const listed = await adapter.list(p(path));
        const clean = (x2) => x2.replace(/^\/+/, "");
        return { files: listed.files.map(clean), folders: listed.folders.map(clean) };
      }
    },
    clipboard: {
      readText: () => navigator.clipboard.readText(),
      writeText: (text) => navigator.clipboard.writeText(text)
    },
    ui: {
      notice(message, kind = "info") {
        new import_obsidian3.Notice(message, kind === "error" ? 15e3 : 8e3);
      },
      askCreate: (prompt) => new CreateBlueprintModal(app, prompt).ask(),
      askUpdate: (prompt) => new UpdateBlueprintModal(app, prompt).ask(),
      pick: (items, placeholder) => new PickModal(app, items, placeholder).ask(),
      progress(message) {
        const notice = new import_obsidian3.Notice(message, 0);
        return {
          update: (m) => notice.setMessage(m),
          close: () => notice.hide()
        };
      },
      openSettings,
      async openNote(path) {
        for (let i2 = 0; i2 < 20; i2++) {
          const file = app.vault.getAbstractFileByPath(p(path));
          if (file instanceof import_obsidian3.TFile) {
            await app.workspace.getLeaf(false).openFile(file);
            return;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    },
    git: vaultDir === void 0 ? void 0 : {
      lfsAvailable: () => lfsAvailable(gitRunner(vaultDir)),
      commitAndSync(folder, message) {
        return commitAndSync({
          run: gitRunner(vaultDir),
          pathExists: nodePathExists(vaultDir),
          folder,
          message
        });
      }
    }
  };
}
function localDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// src/main.ts
var FOLDER_COMMANDS = [
  {
    id: "import-blueprint-from-clipboard",
    name: "Import blueprint from clipboard",
    menuTitle: "Import blueprint from clipboard here",
    icon: "clipboard-paste",
    menuOnlyInBlueprintFolder: false,
    exclusive: true,
    run: importFromClipboard
  },
  {
    id: "copy-blueprint-string",
    name: "Copy blueprint string",
    menuTitle: "Copy blueprint string",
    icon: "clipboard-copy",
    menuOnlyInBlueprintFolder: true,
    exclusive: true,
    run: copyBlueprintString
  },
  {
    id: "copy-live-link",
    name: "Copy live link",
    menuTitle: "Copy live link",
    icon: "link",
    menuOnlyInBlueprintFolder: true,
    exclusive: false,
    run: copyLiveLink
  },
  {
    id: "render-preview",
    name: "Render preview",
    menuTitle: "Render preview",
    icon: "image",
    menuOnlyInBlueprintFolder: true,
    exclusive: false,
    run: (host, folder) => renderPreview(host, folder)
  }
];
var FactorioBlueprintsPlugin = class extends import_obsidian4.Plugin {
  settings = { ...DEFAULT_SETTINGS };
  running = false;
  statusEl;
  statusFolder;
  statusCache = /* @__PURE__ */ new Map();
  statusTimer;
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new BlueprintSettingTab(this.app, this));
    for (const cmd of FOLDER_COMMANDS) {
      this.addCommand({
        id: cmd.id,
        name: cmd.name,
        icon: cmd.icon,
        callback: () => {
          const file = this.app.workspace.getActiveFile();
          if (!file) {
            this.host().ui.notice(
              "Open a note in the folder first, or right-click the folder in the file explorer.",
              "error"
            );
            return;
          }
          void this.runCommand(cmd, folderOf(file));
        }
      });
    }
    this.addCommand({
      id: "cancel-render-preview",
      name: "Cancel render preview",
      icon: "square",
      callback: () => {
        if (!cancelRenderAll()) this.host().ui.notice("No render is running.");
      }
    });
    this.addCommand({
      id: "show-blueprints-needing-render",
      name: "Show blueprints needing a render",
      icon: "list-checks",
      callback: () => void this.runExclusive((host) => showFoldersNeedingRender(host))
    });
    this.addCommand({
      id: "render-all-needing-render",
      name: "Render all that need it",
      icon: "images",
      callback: () => void this.runExclusive((host) => renderAllNeeded(host))
    });
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("mod-clickable");
    this.statusEl.setAttribute("aria-label", "Render preview (only what is missing or outdated)");
    this.statusEl.hide();
    this.registerDomEvent(this.statusEl, "click", () => {
      if (this.statusFolder === void 0) return;
      void renderPreview(this.host(), this.statusFolder, { onlyNeeded: true }).finally(() => this.scheduleStatus());
    });
    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleStatus()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleStatus()));
    for (const event of ["create", "delete", "modify", "rename"]) {
      this.registerEvent(
        this.app.vault.on(event, (file) => {
          if (this.statusFolder !== void 0 && file.path.startsWith(this.statusFolder + "/")) this.scheduleStatus();
        })
      );
    }
    this.app.workspace.onLayoutReady(() => this.scheduleStatus());
    this.addCommand({
      id: "refresh-generated-blocks",
      name: "Refresh generated content in all notes",
      icon: "refresh-cw",
      callback: () => {
        const host = this.host();
        if (this.running) {
          host.ui.notice("A blueprint command is still running; try again in a moment.", "error");
          return;
        }
        this.running = true;
        void refreshAllGeneratedBlocks(host).catch((e) => host.ui.notice(`Refreshing generated content failed: ${e instanceof Error ? e.message : String(e)}`, "error")).finally(() => this.running = false);
      }
    });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        const folder = folderOf(file);
        const inBlueprint = this.isInBlueprintFolder(folder);
        for (const cmd of FOLDER_COMMANDS) {
          if (cmd.menuOnlyInBlueprintFolder && !inBlueprint) continue;
          menu.addItem(
            (item) => item.setTitle(cmd.menuTitle).setIcon(cmd.icon).onClick(() => void this.runCommand(cmd, folder))
          );
        }
      })
    );
  }
  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  host() {
    return createObsidianHost(
      this.app,
      {
        authors: parseAuthors(this.settings.authors),
        commitAfterImport: this.settings.commitAfterImport,
        templatePath: this.settings.templatePath,
        linkBase: this.settings.linkBase || DEFAULT_SETTINGS.linkBase,
        render: loadRenderSettings(this.app)
      },
      () => this.openSettings()
    );
  }
  /** Obsidian has no public API to open a plugin's settings tab. */
  openSettings() {
    const setting = this.app.setting;
    try {
      setting?.open();
      setting?.openTabById(this.manifest.id);
    } catch {
    }
  }
  async runExclusive(fn) {
    const host = this.host();
    if (this.running) {
      host.ui.notice("A blueprint command is still running; try again in a moment.", "error");
      return;
    }
    this.running = true;
    try {
      await fn(host);
    } catch (e) {
      host.ui.notice(`Failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      console.error(e);
    } finally {
      this.running = false;
      this.scheduleStatus();
    }
  }
  /** Update the status bar soon (debounced: saves come in bursts). */
  scheduleStatus() {
    if (this.statusTimer !== void 0) window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => {
      this.statusTimer = void 0;
      void this.updateStatus();
    }, 300);
  }
  async updateStatus() {
    const el = this.statusEl;
    if (!el) return;
    const file = this.app.workspace.getActiveFile();
    const folder = file ? this.blueprintFolderOf(folderOf(file)) : void 0;
    this.statusFolder = folder;
    if (folder === void 0) {
      el.hide();
      return;
    }
    try {
      const adapter = this.app.vault.adapter;
      const stat = async (p) => {
        const s = await adapter.stat(p);
        return s ? `${s.mtime}:${s.size}` : "-";
      };
      const host = this.host();
      const rendersDir = joinPath(folder, "renders");
      const key = [
        await stat(joinPath(folder, BLUEPRINT_FILE)),
        await stat(joinPath(rendersDir, RENDER_MANIFEST)),
        await host.files.exists(rendersDir) ? JSON.stringify(await adapter.list(rendersDir)) : ""
      ].join("|");
      let cached = this.statusCache.get(folder);
      if (cached?.key !== key) {
        cached = { key, label: renderStateLabel(await folderRenderState(host, folder)) };
        this.statusCache.set(folder, cached);
      }
      if (this.statusFolder !== folder) return;
      el.setText(cached.label);
      el.show();
    } catch {
      el.hide();
    }
  }
  blueprintFolderOf(folder) {
    return selfAndAncestors(folder).find(
      (f) => f !== "" && isScannedPath(f) && this.app.vault.getAbstractFileByPath(joinPath(f, BLUEPRINT_FILE)) instanceof import_obsidian4.TFile
    );
  }
  async runCommand(cmd, folder) {
    const host = this.host();
    if (cmd.exclusive && this.running) {
      host.ui.notice("A blueprint command is still running; try again in a moment.", "error");
      return;
    }
    if (cmd.exclusive) this.running = true;
    try {
      await cmd.run(host, folder);
    } catch (e) {
      host.ui.notice(`${cmd.name} failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      console.error(e);
    } finally {
      if (cmd.exclusive) this.running = false;
      this.scheduleStatus();
    }
  }
  /** Synchronous check for menus, from the vault index. */
  isInBlueprintFolder(folder) {
    return this.blueprintFolderOf(folder) !== void 0;
  }
};
function folderOf(file) {
  const folder = file instanceof import_obsidian4.TFolder ? file : file.parent;
  return !folder || folder.isRoot() ? "" : folder.path;
}
