const rollSingle = (face: number, rolled: number[]): number => {
    const r = Math.ceil(Math.random() * face)
    rolled.push(r)
    return r
}

const roll = (count: number, face: number, rolled: number[]): number => [...Array(count)].reduce(r => r + rollSingle(face, rolled), 0)

globalThis.roll = roll

const dice = (exp: string): IDiceResult => {
    if (!exp.match(/^[\d\+\-\*\/\(\)D]+$/i)) {
        return {sum: NaN, rolled: []}
    }
    let val: IDiceResult = {sum: NaN, rolled: []};
    try {
        const fn = new Function('"use strict"; const rolled = []; const sum = ' + exp
            .replace(/(\d+)?D(\d+)/ig, (code, c, f) => `roll(${c || '1'},${f}, rolled)`) + '; return { sum, rolled, exp: "' + exp + '" }');
        val = fn();
    } catch (e) {

    }
    return val;
}

export default dice;