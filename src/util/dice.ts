const rollSingle = (face: number, rolled: number[]): number => {
    const r = Math.ceil(Math.random() * face)
    rolled.push(r)
    return r
}

const roll = (count: number, face: number, rolled: number[]): number => [...Array(count)].reduce(r => r + rollSingle(Math.floor(face), rolled), 0)

globalThis.roll = roll

const dice = (exp: string): IDiceResult => {
    if (!exp.match(/^[\d\+\-\*\/\(\)\.D]+$/i)) {
        return {sum: NaN, rolled: []}
    }
    let val: IDiceResult = {sum: NaN, rolled: []};
    try {
        const fn = new Function('"use strict"; const rolled = []; const sum = ' + exp
            .replace(/(\d+)?D(\d+)/ig, (code, c, f) => {
                if (Number(c) > 99999) {
                    throw new Error("ダイス数上限");
                }
                return `roll(${c || '1'},${f}, rolled)`
            }) + '; return { sum, rolled, exp: "' + exp + '" }');
        val = fn();
        if (typeof val.sum === 'number' && !isNaN(val.sum)) {
            val.sum = parseFloat(val.sum.toPrecision(12));
        }
    } catch (e) {

    }
    return val;
}

export default dice;