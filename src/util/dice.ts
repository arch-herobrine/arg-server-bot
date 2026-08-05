export interface IDiceResult {
    sum: number;
    rolled: number[];
    exp: string;
}

const rollSingle = (face: number, rolled: number[]): number => {
    if (face < 1) return 0;
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const r = (array[0] % face) + 1;
    rolled.push(r);
    return r;
};

const roll = (count: number, face: number, rolled: number[]): number => {
    const c = Math.floor(count);
    const f = Math.floor(face);
    let total = 0;
    for (let i = 0; i < c; i++) {
        total += rollSingle(f, rolled);
    }
    return total;
};

const fixFloat = (n: number): number => {
    if (!Number.isFinite(n)) return n;
    return Math.round(n * 1e10) / 1e10;
};

// 安全にカッコ内の単一数式（例: "(128*2)"）を評価して数値文字列にするヘルパー
const evalExpr = (expr: string): number => {
    // カッコを取り除く
    const inner = expr.replace(/^\((.*)\)$/, '$1');
    // 数学演算のみ実行
    return fixFloat(new Function(`"use strict"; return (${inner});`)());
};

const dice = (exp: string): IDiceResult => {
    if (!/^[\d\+\-\*\/\(\)\.D\s]+$/i.test(exp)) {
        return { sum: NaN, rolled: [], exp };
    }

    let val: IDiceResult = { sum: NaN, rolled: [], exp };

    try {
        const diceRegex = /(\d+|\([\d\+\-\*\/\.\s]+\))?D(\d+|\([\d\+\-\*\/\.\s]+\))/ig;

        // 1. 返却用の exp 文字列を整形（カッコ計算式を数値に置換）
        // 例: "(2+1)D(3*2)" -> "3D6"
        const cleanedExp = exp.replace(diceRegex, (_, c, f) => {
            const count = c ? (c.startsWith('(') ? evalExpr(c) : c) : 1;
            const face = f.startsWith('(') ? evalExpr(f) : f;
            return `${count}D${face}`;
        });

        // 2. 実際に計算・実行するための JavaScript コードを生成
        const parsedExp = exp.replace(diceRegex, (_, c, f) => {
            const countExpr = c ? c : '1';
            return `roll(${countExpr}, ${f}, rolled)`;
        });

        const fn = new Function(
            'roll',
            `"use strict";
       const rolled = [];
       const sum = ${parsedExp};
       return { sum, rolled, exp: "${cleanedExp}" };`
        );

        val = fn(roll);

        if (typeof val.sum === 'number' && !isNaN(val.sum)) {
            val.sum = fixFloat(val.sum);
        }
    } catch (e) {
        return { sum: NaN, rolled: [], exp };
    }

    return val;
};

export default dice;