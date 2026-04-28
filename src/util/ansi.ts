export default class style {
    static ansi(str:string):string {
        return `\x1b[${str}`;
    }
    static readonly reset = "\x1b[0m";
}