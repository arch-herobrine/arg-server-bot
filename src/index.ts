import {
    Client,
    GatewayIntentBits,
    Collection,
    CmdContent,
    BtnContent,
    ChatInputCommandInteraction,
    ApplicationCommandData
} from "discord.js";
import fetch from "node-fetch";
import path from "node:path";
import URL from "node:url";
import fs from "node:fs";
import Logger from "@arch-herobrine/logger.js";
import botConfig from "./config.js";
import style from "./util/ansi.js";
import dice from "./util/dice.js";

const __dirname = path.dirname(URL.fileURLToPath(import.meta.url));

const client = new Client({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]});
const logger = new Logger({timeZone: "Asia/Tokyo"});
client.token = botConfig.bot_token;
client.cmds = new Collection();
client.btns = new Collection();

const basePath = path.join(__dirname, "int");
const btnPath = path.join(basePath, "btn");
logger.info(`Button Interactionをディレクトリ${style.ansi("92m")}"${btnPath}"${style.reset}から読み込み中`);
try {
    const btns = fs.readdirSync(btnPath).filter(f => f.endsWith(".js"));
    logger.log(btns);
    for (const f of btns) {
        const filePath = path.join(btnPath, f);
        const btn: BtnContent = (await import(URL.pathToFileURL(filePath).toString()))?.default ?? {};
        logger.log(btn);
        if ("data" in btn && "exec" in btn) {
            client.btns.set(btn.data, btn);
        } else {
            throw new Error(`必要なプロパティ"data"もしくは"exec"が欠落しています。`);
        }
    }
} catch (e: any) {
    logger.error("Button Interactionの読み込み中にエラーが発生しました:", `\n${style.ansi("41m") + e + style.ansi(`0;38;5;${0xf5}m`) + e.stack?.replace(`${e}`, "") + style.reset}`);
    //process.exit(1);
}
logger.info("Button Interactionの読み込みが完了しました");
const cmdPath = path.join(basePath, "cmd");
logger.info(`Slash Commandをディレクトリ${style.ansi("92m")}"${cmdPath}"${style.reset}から読み込み中`);
try {
    const cmds = fs.readdirSync(cmdPath).filter(f => f.endsWith(".js"));
    logger.log(cmds);
    for (const f of cmds) {
        const filePath = path.join(cmdPath, f);
        const cmd: CmdContent = (await import(URL.pathToFileURL(filePath).toString()))?.default ?? {};
        logger.log(cmd);
        if ("data" in cmd && "exec" in cmd) {
            client.cmds.set(cmd.data.name, cmd);
        } else {
            throw new Error(`必要なプロパティ"data"もしくは"exec"が欠落しています。`);
        }
    }
} catch (e: any) {
    logger.error("Slash Commandの読み込み中にエラーが発生しました:", `\n${style.ansi("41m") + e + style.ansi(`0;38;5;${0xf5}m`) + e.stack?.replace(`${e}`, "") + style.reset}`);
    process.exit(1);
}
logger.info("Slash Commandの読み込みが完了しました");

process.on("uncaughtException", (e) => {
    logger.error(`${style.ansi("41m") + e + style.ansi(`0;38;5;${0xf5}m`) + e.stack?.replace(`${e}`, "") + style.reset}`);
});

client.once("clientReady", async () => {
    let appCmd: ApplicationCommandData[] = [];
    client.cmds.each((v) => {
        appCmd.push(v.data);
    });
    await client.application?.commands.set(appCmd);
    logger.info(`Ready to as ${client.user?.tag}`);
});

client.on("messageCreate", async (msg) => {
    logger.log(msg.content);
    if (msg.author.bot) return;
    if (/^CC(B)?\<\=([\d\+\-\*\/\(\)]+)/i.test(msg.content)) {
        const parsed = msg.content.replace(/CCB?\<\=/i, "")
            .match(/([\d\+\-\*\/\(\)]+)/i);
        if (!parsed) {
            return msg.reply({
                "content": "不正な入力",
                "allowedMentions": {repliedUser: false}
            });
        }
        const targetCalc = dice(parsed[0]);
        const d100Result = dice("1d100").sum;
        let result: null | "success" | "failed" | "critical" | "fumble" = null;
        if (!targetCalc.exp) {
            return msg.reply({
                "content": "不正な入力",
                "allowedMentions": {repliedUser: false}
            });
        }
        const target = Math.floor(targetCalc.sum);
        if (target <= 0) {
            return msg.reply({
                "content": "自動失敗",
                "allowedMentions": {repliedUser: false}
            });
        }
        const isCCB = /^ccb/i.test(msg.content);
        if (isCCB) {
            if (d100Result == 100) {
                result = "fumble";
            } else if (d100Result <= Math.floor(targetCalc.sum)) {
                result = "success";
                if (d100Result <= 5) {
                    result = "critical";
                }
            } else {
                result = "failed";
                if (d100Result >= 96) {
                    result = "fumble";
                }
            }
        } else {
            if (d100Result == 100) {
                result = "fumble";
            } else if (d100Result <= Math.floor(targetCalc.sum)) {
                result = "success";
                if (d100Result == 1) {
                    result = "critical";
                }
            } else {
                result = "failed";
            }
        }
        const rolledStr = `${d100Result} ${result == "success" ? "成功" : result == "failed" ? "失敗" : result == "critical" ? "クリティカル" : "ファンブル"}(目標値: ${target})`
        return msg.reply({
            "embeds": [{
                "title": `${isCCB ? "CCB" : "CC"}<=${target}`,
                "description": rolledStr,
                "color": result == "success" || result == "critical" ? 0x41d2f2 : 0xeb4034,
                "author": {
                    "name": msg.member?.displayName ?? msg.author.displayName,
                    "icon_url": msg.member?.avatarURL() ?? msg.author.avatarURL() ?? undefined
                }
            }],
            "allowedMentions": {repliedUser: false}
        });
    } else if (/^dice/.test(msg.content)) {
        const parsed = msg.content.replace(/^dice([ 　]*)?/, "")
            .match(/([\d\+\-\*\/\(\)D]+)(?:(<[=>]?|>[=]?|=)([\d\+\-\*\/\(\)]+))?/i);
        if (parsed?.length) {
            const rolled = dice(parsed[1]);
            if (rolled.exp == undefined) {
                return msg.reply({
                    "content": "不正な入力",
                    "allowedMentions": {repliedUser: false}
                });
            }
            logger.log(rolled.exp.split(/([\+\-\*\/])/));
            let pointer = 0;
            const parts = rolled.exp.split(/([\+\-\*\/\(\)])/);
            const lengthFlag = 1500 <= (rolled.rolled.join(",").length + rolled.exp.length);
            const formatted = [...parts].map(part => {
                const diceMatch = part.match(/(\d+)d(\d+)/i);
                if (diceMatch) {
                    const count = parseInt(diceMatch[1], 10);
                    const current = rolled.rolled.slice(pointer, pointer + count);
                    pointer += count;
                    const chunkSum = current.reduce((a, b) => a + b, 0);
                    return ((count <= 1) || lengthFlag) ? `${chunkSum}` : `${chunkSum}[${current.join(",")}]`;
                }
                return part;
            }).join('');
            let targetCalc: IDiceResult | null = null;
            let success = false;
            if (parsed[2]) {
                targetCalc = dice(parsed[3]);
                if (!targetCalc.exp) {
                    return msg.reply({
                        "content": "不正な入力",
                        "allowedMentions": {repliedUser: false}
                    });
                }

                switch (parsed[2]) {
                    case "=": {
                        success = Math.floor(rolled.sum) == Math.floor(targetCalc.sum);
                        break;
                    }
                    case "<>": {
                        success = Math.floor(rolled.sum) != Math.floor(targetCalc.sum);
                        break;
                    }
                    case "<=": {
                        success = Math.floor(rolled.sum) <= Math.floor(targetCalc.sum);
                        break;
                    }
                    case ">=": {
                        success = Math.floor(rolled.sum) >= Math.floor(targetCalc.sum);
                        break;
                    }
                    case ">": {
                        success = Math.floor(rolled.sum) > Math.floor(targetCalc.sum);
                        break;
                    }
                    case "<": {
                        success = Math.floor(rolled.sum) < Math.floor(targetCalc.sum);
                        break;
                    }
                    default: {
                        break;
                    }
                }
            }
            const rolledStr = parts.length == 1 ? `${rolled.sum} ${targetCalc != null ? success ? `成功(目標値${Math.floor(targetCalc.sum)}) ` : `失敗(目標値${Math.floor(targetCalc.sum)}) ` : ""}(${lengthFlag ? "長すぎるため省略" : rolled.rolled.join(",")})` : `${Math.floor(rolled.sum) ? rolled.sum : `${Math.floor(rolled.sum)} [${rolled.sum}]`} ${targetCalc != null ? success ? `成功(目標値${Math.floor(targetCalc.sum)}) ` : `失敗(目標値${Math.floor(targetCalc.sum)}) ` : ""}(${formatted})`;
            logger.log(rolledStr);
            msg.reply({
                "embeds": [{
                    "title": rolled.exp.replaceAll("*", "\\*"),
                    "description": rolledStr.replaceAll("*", "\\*"),
                    "color": targetCalc != null ? success ? 0x41d2f2 : 0xeb4034 : 0x71f26d,
                    "author": {
                        "name": msg.member?.displayName ?? msg.author.displayName,
                        "icon_url": msg.member?.avatarURL() ?? msg.author.avatarURL() ?? undefined
                    }
                }],
                "allowedMentions": {repliedUser: false}
            });
        }
    } else if (/^x(\d+) CC(B)?\<\=([\d\+\-\*\/\(\)]+)/i.test(msg.content)) {
        const parsed = msg.content.replace(/^x(\d+) CCB?\<\=/i, "")
            .match(/([\d\+\-\*\/\(\)]+)/i);
        const repeat = msg.content.match(/^x(\d+)/i);
        if (!parsed || !repeat) {
            return msg.reply({
                "content": "不正な入力",
                "allowedMentions": {repliedUser: false}
            });
        }
        if (parseInt(repeat[1]) > 50) {
            return msg.reply({
                "content": "反復回数が多すぎます",
                "allowedMentions": {repliedUser: false}
            });
        }
        const targetCalc = dice(parsed[0]);
        const d100Results = dice(`${parseInt(repeat[1])}d100`).rolled;
        let result: null | "success" | "failed" | "critical" | "fumble" = null;
        let resultCount: { success: number; failed: number; critical: number; fumble: number } = {
            "success": 0,
            "failed": 0,
            "critical": 0,
            "fumble": 0
        }
        if (!targetCalc.exp) {
            return msg.reply({
                "content": "不正な入力",
                "allowedMentions": {repliedUser: false}
            });
        }
        const target = Math.floor(targetCalc.sum);
        if (target <= 0) {
            return msg.reply({
                "content": "自動失敗",
                "allowedMentions": {repliedUser: false}
            });
        }
        const isCCB = /^ccb/i.test(msg.content.replace(/^x(\d+) /i, ""));
        const rolledStrArr: string[] = [];
        for (const roll of d100Results) {
            if (isCCB) {
                if (roll == 100) {
                    result = "fumble";
                } else if (roll <= Math.floor(targetCalc.sum)) {
                    result = "success";
                    if (roll <= 5) {
                        result = "critical";
                    }
                } else {
                    result = "failed";
                    if (roll >= 96) {
                        result = "fumble";
                    }
                }
            } else {
                if (roll == 100) {
                    result = "fumble";
                } else if (roll <= Math.floor(targetCalc.sum)) {
                    result = "success";
                    if (roll == 1) {
                        result = "critical";
                    }
                } else {
                    result = "failed";
                }
            }
            resultCount[result]++;
            rolledStrArr.push(`${roll} ${result == "success" ? "成功" : result == "failed" ? "失敗" : result == "critical" ? "クリティカル" : "ファンブル"}`)
        }
        return msg.reply({
            "embeds": [{
                "title": `${isCCB ? "CCB" : "CC"}<=${target}`,
                "description": (parseInt(repeat[1]) > 10 ? "(10行超えたのでレシート化防ぐために省略)" : rolledStrArr.join("\n").replaceAll("*", "\\*")) + "\n"
                    + `成功: ${resultCount["success"]}, 失敗: ${resultCount["failed"]}, \n`
                    + `クリティカル: ${resultCount["critical"]}, ファンブル: ${resultCount["fumble"]}`,
                "color": 0x71f26d,
                "author": {
                    "name": msg.member?.displayName ?? msg.author.displayName,
                    "icon_url": msg.member?.avatarURL() ?? msg.author.avatarURL() ?? undefined
                }
            }],
            "allowedMentions": {repliedUser: false}
        });
    }
});

client.on("interactionCreate", async (int) => {
    if (int.isChatInputCommand()) {
        const cmd = int.client.cmds.get(int.commandName);
        if (!cmd) {
            logger.error(`不明なコマンド: ${int.commandName}`);
            return;
        }
        try {
            cmd.exec(int, client, logger);
        } catch (error) {
            logger.error(error);
            if (int.replied || int.deferred) {
                await int.followUp({content: "コマンドの実行中にエラーが発生しました", ephemeral: true});
            } else {
                await int.reply({content: "コマンドの実行中にエラーが発生しました", ephemeral: true});
            }
        }
    } else if (int.isButton()) {
        const btn = int.client.btns.get(int.customId);
        if (!btn) {
            logger.error(`不明なボタン: ${int.customId}`);
            return;
        }
        try {
            btn.exec(int, client, logger);
        } catch (error) {
            logger.error(error);
            if (int.replied || int.deferred) {
                await int.followUp({content: "ボタンの処理中にエラーが発生しました", ephemeral: true});
            } else {
                await int.reply({content: "ボタンの処理中にエラーが発生しました", ephemeral: true});
            }
        }
    }
});

client.login();