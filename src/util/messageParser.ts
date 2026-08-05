import {Message} from "discord.js";
import dice, {IDiceResult} from "./dice.js";
import {
    getUserInfo,
    sanitizeExp,
    evaluateCoC,
    hasCompetingBot,
    RESULT_LABELS,
} from "./util.js";
import Logger from "@arch-herobrine/logger.js";

/**
 * ダイスコマンドのメインハンドラー
 * messageCreate イベントから呼び出してください
 */
export const handleDiceCommand = async (msg: Message, logger: Logger): Promise<any> => {
    // botの発言は無視
    if (msg.author.bot) return;

    const content = msg.content.replaceAll("\\*", "*");

    // -----------------------------------------------------------------
    // ヘルパー関数: 通常ダイスとシークレットダイスの送信を分岐
    // -----------------------------------------------------------------
    const sendDiceResponse = async (
        embedPayload: any,
        isSecret: boolean,
        logger: Logger
    ) => {
        if (isSecret) {
            try {
                // 1. 実行ユーザーの DM へダイス結果（Embed）を送信
                await msg.author.send({ embeds: [embedPayload] });

                // 2. チャンネルには「振った事実」のみを通知（メッセージがDM内でない場合）
                if (!msg.channel.isDMBased()) {
                    await msg.channel.send({
                        embeds: [{
                            title: `🔒 シークレットダイス`,
                            color: 0x9b59b6, // 紫色などシークレットっぽい色
                            author: getUserInfo(msg),
                        }],
                    });
                    msg.delete().catch(logger.error);
                }
            } catch (error) {
                // DMが拒否されている場合のエラーメッセージ
                return msg.reply({
                    content: "DM送れなかったので振れませんでした",
                    allowedMentions: { repliedUser: false },
                });
            }
        } else {
            // 通常時は普通に Reply
            return msg.reply({
                embeds: [embedPayload],
                allowedMentions: { repliedUser: false },
            });
        }
    };

    // =================================================================
    // 1. CC / CCB 判定 (SCC / SCCB にも対応)
    // =================================================================
    // 先頭に (S)? を追加
    const cocMatch = content.match(/^(S)?(?:x(\d+)\s+)?(CCB?)<=([\d\+\-\*\/\(\)\.\^]+)/i);

    if (cocMatch) {
        const isSecret = Boolean(cocMatch[1]);
        const repeat = cocMatch[2] ? parseInt(cocMatch[2], 10) : 1;
        const isCCB = cocMatch[3].toUpperCase() === "CCB";
        const expr = cocMatch[4].replaceAll("^", "**");

        if (repeat > 50) {
            return msg.reply({
                content: "反復回数が多すぎます",
                allowedMentions: { repliedUser: false },
            });
        }

        const targetCalc = dice(expr);
        if (!targetCalc.exp) {
            return msg.reply({
                content: "不正な入力",
                allowedMentions: { repliedUser: false },
            });
        }

        const target = Math.floor(targetCalc.sum);
        if (target <= 0) {
            return msg.reply({
                content: "自動失敗",
                allowedMentions: { repliedUser: false },
            });
        }

        // d100 ダイス実行
        const d100Results = dice(`${repeat}d100`).rolled;
        const counts = { success: 0, failed: 0, critical: 0, fumble: 0 };
        const rolledStrArr: string[] = [];

        for (const roll of d100Results) {
            const res = evaluateCoC(roll, target, isCCB);
            counts[res]++;
            rolledStrArr.push(`${roll} ${RESULT_LABELS[res]}`);
        }

        // 表示メッセージとカラーの設定
        let description = "";
        let color = 0x71f26d;

        if (repeat === 1) {
            const singleRes = evaluateCoC(d100Results[0], target, isCCB);
            description = `${d100Results[0]} ${RESULT_LABELS[singleRes]}(目標値: ${target})`;
            color = (singleRes === "success" || singleRes === "critical") ? 0x41d2f2 : 0xeb4034;
        } else {
            const details = repeat > 10
                ? "(10行超えたのでレシート化防ぐために省略)"
                : rolledStrArr.join("\n").replaceAll("*", "\\*");
            description = `${details}\n成功: ${counts.success}, 失敗: ${counts.failed}, クリティカル: ${counts.critical}, ファンブル: ${counts.fumble}`;
        }

        const commandTitle = `${isCCB ? "CCB" : "CC"}<=${target}`;

        return sendDiceResponse({
            title: commandTitle,
            description,
            color,
            author: getUserInfo(msg),
        }, isSecret, logger);
    }

    // =================================================================
    // 2. 通常ダイスロール (例: 1d100, S1d100, S x3 1d100 等)
    // =================================================================
    // 先頭に (S)? を追加
    const diceMatch = content.match(
        /^(S(?:D|ICE)?)?\s*(?:x(\d+)\s+)?(?:(dice)\s*)?([\d\+\-\*\/\(\)\.D]+)(?:(<[=>]?|>[=]?|=)([\d\+\-\*\/\(\)\.]+))?/i
    );

    if (diceMatch) {
        const isSecret = Boolean(diceMatch[1]);
        const repeat = diceMatch[2] ? parseInt(diceMatch[2], 10) : 1;
        const hasDicePrefix = Boolean(diceMatch[3]) || (diceMatch[1] && /dice/i.test(diceMatch[1]));
        let rawDiceExpr = diceMatch[4];
        const operator = diceMatch[5];
        const targetExpr = diceMatch[6];
        if (!rawDiceExpr) return;

        // "d10" や "10" (sd10など) のように数値単体・または個数省略で指定された場合、1d10 に補正
        if (/^d?\d+$/i.test(rawDiceExpr)) {
            const faces = rawDiceExpr.replace(/^d/i, "");
            rawDiceExpr = `1d${faces}`;
        } else if (!/[\dD]/i.test(rawDiceExpr)) {
            // 数字も D も含まれていない場合 (例: 単に 's' や 'sd' だけ打たれた時) は無視
            return;
        }
        // -------------------------------------------------------------
        // Sasa等 競合Bot回避ロジック
        // ※シークレットダイス(isSecret)の場合は自分のBotのみ処理したいため、
        // 競合Botがいてもスルーさせないように判定から外す
        // -------------------------------------------------------------
        const isBareRoll = repeat === 1 && !hasDicePrefix && !isSecret;
        if (isBareRoll) {
            const isBotPresent = await hasCompetingBot(msg);
            if (isBotPresent) {
                return;
            }
        }

        if (repeat > 50) {
            return msg.reply({
                content: "反復回数が多すぎます",
                allowedMentions: { repliedUser: false },
            });
        }

        // リピート回数分ダイスを実行
        const results: IDiceResult[] = [];
        for (let i = 0; i < repeat; i++) {
            const rolled = dice(rawDiceExpr);
            if (!rolled.exp) {
                return msg.reply({
                    content: "不正な入力",
                    allowedMentions: { repliedUser: false },
                });
            }
            results.push(rolled);
        }

        // 目標値（比較対象）がある場合の計算
        let targetCalc: IDiceResult | null = null;
        if (operator && targetExpr) {
            targetCalc = dice(targetExpr);
            if (!targetCalc.exp) {
                return msg.reply({
                    content: "不正な入力",
                    allowedMentions: { repliedUser: false },
                });
            }
        }

        // 1回分のダイス結果テキストを作る内部関数
        const buildSingleRollStr = (rolled: IDiceResult) => {
            let pointer = 0;
            const parts = rolled.exp.replaceAll("**", "^").split(/([\+\-\*\/\(\)\^])/);
            const lengthFlag = (rolled.rolled.join(",").length + rolled.exp.length) >= 1500;

            const formatted = parts.map((part) => {
                const match = part.match(/([\d\.]+)d([\d\.]+)/i);
                if (match) {
                    const count = parseInt(match[1], 10);
                    const current = rolled.rolled.slice(pointer, pointer + count);
                    pointer += count;
                    const chunkSum = current.reduce((a, b) => a + b, 0);
                    return (count <= 1 || lengthFlag) ? `${chunkSum}` : `${chunkSum}[${current.join(",")}]`;
                }
                return part;
            }).join("");

            let success = false;
            if (targetCalc) {
                const rollSum = Math.floor(rolled.sum);
                const targetVal = Math.floor(targetCalc.sum);
                const opMap: Record<string, boolean> = {
                    "=": rollSum === targetVal,
                    "<>": rollSum !== targetVal,
                    "<=": rollSum <= targetVal,
                    ">=": rollSum >= targetVal,
                    ">": rollSum > targetVal,
                    "<": rollSum < targetVal,
                };
                success = opMap[operator] ?? false;
            }

            const targetMsg = targetCalc ? `${success ? "成功" : "失敗"}${repeat > 1 ? "" : `(目標値${Math.floor(targetCalc.sum)})`} ` : "";
            const sumStr = Math.floor(rolled.sum) === rolled.sum ? `${rolled.sum}` : `${Math.floor(rolled.sum)} [${rolled.sum}]`;
            const diceDetail = parts.length === 1 ? (lengthFlag ? "長すぎるため省略" : rolled.rolled.join(",")) : formatted;

            return {
                text: `${sumStr} ${targetMsg}(${diceDetail})`,
                success,
            };
        };

        // 結果の組み上げ
        const rollDataList = results.map((r) => buildSingleRollStr(r));
        let description = "";
        let successCount = 0;

        if (repeat === 1) {
            description = rollDataList[0].text;
        } else {
            if (targetCalc) {
                successCount = rollDataList.filter((d) => d.success).length;
            }
            const details = repeat > 10
                ? "(10行超えたのでレシート化防ぐために省略)"
                : rollDataList.map((d) => d.text).join("\n").replaceAll("*", "\\*");

            description = targetCalc
                ? `${details}\n成功: ${successCount}, 失敗: ${repeat - successCount}`
                : details;
        }

        const firstExp = results[0].exp;
        const titleText = sanitizeExp(firstExp);

        return sendDiceResponse({
            title: titleText,
            description,
            color: (targetCalc && repeat === 1)
                ? (rollDataList[0].success ? 0x41d2f2 : 0xeb4034)
                : 0x71f26d,
            author: getUserInfo(msg),
        }, isSecret, logger);
    }
};