/*jslint plusplus: true */
/*jslint bitwise: true */

'use strict';

var Big = require('../3rtparty/jsbn.packed.js'),
    models = require('./models/index.js'),
    ZERO = new Big("0"),
    ONE = new Big("1");

var fmod = function (val, modulus) {
    var rv, bitm_l, mask;
    if (val.compareTo(modulus) < 0) {
        return val;
    }
    rv = val;
    bitm_l = modulus.bitLength();
    while (rv.bitLength() >= bitm_l) {
        mask = modulus.shiftLeft(rv.bitLength() - bitm_l);
        rv = rv.xor(mask);
    }

    return rv;
};
var fmul = function (value_1, value_2, modulus) {
    var ret = ZERO, j, bitl_1;

    bitl_1 = value_1.bitLength();
    for (j = 0; j < bitl_1; j++) {
        if (value_1.testBit(j)) {
            ret = ret.xor(value_2);
        }
        value_2 = value_2.shiftLeft(1);
    }
    return fmod(ret, modulus);

};
var finv = function (value, modulus) {
    var b, c, u, v, j, tmp;

    b = ONE;
    c = ZERO;
    u = fmod(value, modulus);
    v = modulus;

    while (u.bitLength() > 1) {
        j = u.bitLength() - v.bitLength();
        if (j < 0) {
            tmp = u;
            u = v;
            v = tmp;

            tmp = c;
            c = b;
            b = tmp;

            j = -j;
        }

        u = u.xor(v.shiftLeft(j));
        b = b.xor(c.shiftLeft(j));
    }

    return b;
};
var ftrace = function (value, modulus) {
    var rv = value,
        bitm_l = modulus.bitLength(),
        idx;

    for (idx = 1; idx <= bitm_l - 2; idx++) {
        rv = fmul(rv, rv, modulus);
        rv = rv.xor(value);
    }

    return rv.intValue();
};
var fsquad_odd = function (value, modulus) {
    var val_a = fmod(value, modulus),
        val_z = val_a,
        bitl_m = modulus.bitLength(),
        range_to = (bitl_m - 2) / 2,
        val_w,
        idx;

    for (idx = 1; idx <= range_to; idx++) {
        val_z = fmul(val_z, val_z, modulus);
        val_z = fmul(val_z, val_z, modulus);
        val_z = val_z.xor(val_a);
    }

    val_w = fmul(val_z, val_z, modulus);
    val_w = val_w.xor(val_z, val_w);

    if (val_w.compareTo(val_a) === 0) {
        return val_z;
    }

    throw new Error("squad eq fail");
};
var fsquad = function (value, modulus) {
    var ret;
    if (modulus.testBit(0)) {
        ret = fsquad_odd(value, modulus);
    }

    return fmod(ret, modulus);
};
var Field = function (param_modulus, value, is_mod) {
    var modulus = param_modulus, ob,
        mod = function (val) {
            return fmod(val, modulus);
        },
        mul = function (val) {
            return fmul(val, ob.value, modulus);
        },
        add = function (val) {
            return ob.value.xor(val);
        },
        inv = function () {
            return finv(ob.value, modulus);
        };
    ob = {
        "mul": mul,
        "mod": mod,
        "add": add,
        "inv": inv,
        "value": value,
    };

    if (is_mod !== true) {
        ob.value = mod(value);
    }
    return ob;
};

var Point = function (p_curve, p_x, p_y) {
    var zero = ZERO,
        modulus = p_curve.modulus,
        ob,
        coords,
        add = function (point_1) {
            var a, x0, x1, y0, y1, x2, y2, point_2, lbd, tmp, tmp2;

            a = p_curve.param_a;
            point_2 = new Point(p_curve, zero, zero);

            x0 = ob.x.value;
            y0 = ob.y.value;
            x1 = point_1.x.value;
            y1 = point_1.y.value;

            if (ob.is_zero()) {
                return point_1;
            }

            if (point_1.is_zero()) {
                return ob;
            }

            if (x0.compareTo(x1) !== 0) {
                tmp = y0.xor(y1);
                tmp2 = x0.xor(x1);
                lbd = fmul(tmp, finv(tmp2, modulus),  modulus);
                x2 = a.xor(fmul(lbd, lbd, modulus));
                x2 = x2.xor(lbd);
                x2 = x2.xor(x0);
                x2 = x2.xor(x1);
            } else {
                if (y1.compareTo(y0) !== 0) {
                    return point_2;
                }
                if (x1.compareTo(zero) === 0) {
                    return point_2;
                }

                lbd = x1.xor(point_1.y.mul(point_1.x.inv()));
                x2 = fmul(lbd, lbd, modulus).xor(a);
                x2 = x2.xor(lbd);
            }
            y2 = fmul(lbd, x1.xor(x2), modulus);
            y2 = y2.xor(x2);
            y2 = y2.xor(y1);

            point_2.x.value = x2;
            point_2.y.value = y2;

            return point_2;

        },
        mul = function (param_n) {
            var point_s = new Point(p_curve, zero, zero), cmp, point,
                bitn_l = param_n.bitLength(),
                j;

            cmp = param_n.compareTo(zero);
            if (cmp === 0) {
                return point_s;
            }

            if (cmp < 0) {
                param_n = param_n.negate();
                point = ob.negate();
            } else {
                point = this;
            }

            for (j = bitn_l - 1; j >= 0; j--) {
                point_s = point_s.add(point_s);
                if (param_n.testBit(j)) {
                    point_s = point_s.add(point);
                }
            }

            return point_s;
        },
        negate = function () {
            return new Point(p_curve, ob.x.value, ob.x.value.xor(ob.y.value));
        },
        is_zero = function () {
            return (ob.x.value.compareTo(zero) === 0) && (ob.y.value.compareTo(zero) === 0);
        },
        expand = function (val) {
            var pa = p_curve.param_a,
                pb = p_curve.param_b,
                x2,
                y,
                k,
                trace,
                trace_y;

            if (val.compareTo(ZERO) === 0) {
                return {
                    x: val,
                    y: fmul(pb, pb, modulus),
                };
            }

            k = val.testBit(0);
            val = val.clearBit(0);

            trace = ftrace(val, modulus);
            if ((trace !== 0 && pa.compareTo(ZERO) === 0) || (trace === 0 && pa.compareTo(ONE) === 0)) {
                val = val.setBit(0);
            }

            x2 = fmul(val, val, modulus);
            y = fmul(x2, val, modulus);

            if (pa.compareTo(ONE) === 0) {
                y = y.xor(x2);
            }

            y = y.xor(pb);
            x2 = finv(x2, modulus);

            y = fmul(y, x2, modulus);
            y = fsquad(y, modulus);

            trace_y = ftrace(y, modulus);

            if ((k === true && trace_y === 0) || (k === false && trace_y !== 0)) {
                y = y.xor(ONE);
            }

            y = fmul(y, val, modulus);

            return {
                x: val,
                y: y,
            };
        },
        compress = function () {
            var x_inv, tmp, ret, trace;

            x_inv = finv(ob.x.value, modulus);
            tmp = fmul(x_inv, ob.y.value, modulus);
            trace = ftrace(tmp, modulus);
            ret = ob.x.value;
            if (trace === 1) {
                ret = ret.setBit(0);
            } else {
                ret = ret.clearBit(0);
            }

            return ret;
        },
        equals = function (other) {
            return (other.x.value.compareTo(ob.x.value) === 0) && (
                other.y.value.compareTo(ob.y.value) === 0
            );
        },
        toString = function () {
            return "<Point x:" + ob.x.value.toString(16) + ", y:" + ob.y.value.toString(16) + " >";
        };

    if (p_y === undefined) {
        coords = expand(p_x);
        p_x = coords.x;
        p_y = coords.y;
    }

    ob = {
        "add": add,
        "mul": mul,
        "is_zero": is_zero,
        "negate": negate,
        "expand": expand,
        "compress": compress,
        "equals": equals,
        "toString": toString,
        "x": new Field(modulus, p_x),
        "y": new Field(modulus, p_y),
    };
    return ob;
};


var Curve = function (params, param_b, m, k1, k2, base, order, kofactor) {
    if (params.base === undefined) {
        params = {
            param_a: params,
            param_b: param_b,
            m: m,
            k1: k1,
            k2: k2,
            base: base,
            order: order,
            kofactor: kofactor,
        };
    }
    var ob,
        comp_modulus = function (k3, k2, k1) {
            var modulus = ZERO;
            modulus = modulus.setBit(k1);
            modulus = modulus.setBit(k2);
            modulus = modulus.setBit(k3);
            ob.modulus = modulus;
        },
        set_base = function (base_x, base_y) {
            ob.base = ob.point(base_x, base_y);
        },
        field = function (val) {
            return new Field(ob.modulus, val);
        },
        point = function (px, py) {
            return new Point(ob, px, py);
        },
        truncate = function (value) {
            var bitl_o = ob.order.bitLength(),
                xbit = value.bitLength();

            while (bitl_o <= xbit) {
                value = value.clearBit(xbit - 1);
                xbit = value.bitLength();
            }
            return value;
        },
        contains = function (point) {
            var lh, y2;
            lh = point.x.value.xor(ob.param_a);
            lh = fmul(lh, point.x.value, ob.modulus);
            lh = lh.xor(point.y.value);
            lh = fmul(lh, point.x.value, ob.modulus);
            lh = lh.xor(ob.param_b);
            y2 = fmul(point.y.value, point.y.value, ob.modulus);
            lh = lh.xor(y2);

            return lh.compareTo(ZERO) === 0;
        },
        trace = function (value) {
            return ftrace(value, ob.modulus);
        },
        rand = function () {
            var bits, words, ret, rand24;

            bits = ob.order.bitLength();
            words = Math.floor((bits + 23) / 24);
            rand24 = new Uint8Array(words * 3);
            rand24 = crypto.getRandomValues(rand24);

            ret = new Big(rand24);

            return ret;
        },
        keygen = function () {
            var rand_d = ob.rand(), priv, pub;
            while (true) {
                priv = new models.Priv(ob, rand_d);
                pub = priv.pub();
                if (pub.validate()) {
                    return priv;
                }
            }
        };

    ob = {
        "field": field,
        "point": point,
        "comp_modulus": comp_modulus,
        "set_base": set_base,
        "modulus": ZERO,
        "truncate": truncate,
        "contains": contains,
        "trace": trace,
        "rand": rand,
        "keygen": keygen,
        "order": params.order,
        "kofactor": params.kofactor,
        "param_a": params.a,
        "param_b": params.b,
        "param_m": params.m,
    };
    ob.comp_modulus(params.m, params.k1, params.k2);
    if (params.base.x === undefined) {
        ob.set_base(params.base);
    } else {
        ob.set_base(params.base.x, params.base.y);
    }
    return ob;
};

Curve.defined = {
    DSTU_B_257: new Curve({
        a: new Big("0", 16),
        b: new Big("01CEF494720115657E18F938D7A7942394FF9425C1458C57861F9EEA6ADBE3BE10", 16),

        base: {
            x: new Big('002A29EF207D0E9B6C55CD260B306C7E007AC491CA1B10C62334A9E8DCD8D20FB7', 16),
            y: new Big('010686D41FF744D4449FCCF6D8EEA03102E6812C93A9D60B978B702CF156D814EF', 16)
        },

        order: new Big('800000000000000000000000000000006759213AF182E987D3E17714907D470D', 16),
        kofactor: new Big("4"),

        m: 257,
        k1: 12,
        k2: 0,
    })
};

module.exports.Curve = Curve;
module.exports.Field = Field;