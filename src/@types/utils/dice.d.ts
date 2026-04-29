declare var roll: (count: number, face: number, rolled: number[]) => number

interface IDiceResult {
    rolled: number[]
    sum: number
    exp?: string
}