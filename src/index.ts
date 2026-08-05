import {
    Client,
    GatewayIntentBits,
    Collection,
    CmdContent,
    BtnContent,
    ChatInputCommandInteraction,
    ApplicationCommandData, Partials, TextChannel, EmbedBuilder, AttachmentBuilder
} from "discord.js";
import fetch from "node-fetch";
import path from "node:path";
import URL from "node:url";
import fs from "node:fs";
import Logger from "@arch-herobrine/logger.js";
import botConfig from "./config.js";
import style from "./util/ansi.js";
import {handleDiceCommand} from "./util/messageParser.js";
import {getUserInfo} from "./util/util.js";

const __dirname = path.dirname(URL.fileURLToPath(import.meta.url));

let client: Client<boolean>;
client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
    ],
    partials: [
        Partials.User,
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
    ],
});
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
    if (msg.partial) await msg.fetch();
    if (msg.channel.partial) await msg.channel.fetch();
    logger.log(msg.content);
    if (msg.author.bot) return;
    await handleDiceCommand(msg, logger);
});

client.on("messageUpdate", async (oldMsg, newMsg) => {
    if (newMsg.partial) await newMsg.fetch();
    if (newMsg.channel.partial) await newMsg.channel.fetch();
    if (newMsg.author?.bot) return;
    if (newMsg.channel.isDMBased()) return;
    if (newMsg.guildId == "1451413207070539971") {
        const loggingCh = (await client.channels.fetch("1534465219487858688")) as TextChannel;
        loggingCh.send({
            content: `\`${oldMsg.author?.username}\`の<#${oldMsg.channel.id}>内のメッセージが編集されました: `,
            embeds: [
                {
                    description: oldMsg.content ?? "-# (なし)",
                    author: getUserInfo(newMsg),
                    footer: {
                        text: "編集前"
                    },
                    color: 0xffff00,
                },
                {
                    description: newMsg.content ?? "-# (なし)",
                    footer: {
                        text: "編集後"
                    },
                    color: 0xffff00,
                }
            ]
        })
    }
});

client.on("messageDelete", async (msg) => {
    if (msg.partial) return;
    if (msg.channel.partial) await msg.channel.fetch();
    if (msg.author.bot) return;
    if (msg.channel.isDMBased()) return;
    if (msg.guildId == "1451413207070539971") {
        const loggingCh = (await client.channels.fetch("1534465219487858688")) as TextChannel;

        // 1. 添付ファイルをバイナリ（Buffer）として再取得して AttachmentBuilder 化
        const attachments = Array.from(msg.attachments.values());
        const files: AttachmentBuilder[] = await Promise.all(
            attachments.map(async (att, index) => {
                const res = await fetch(att.url);
                const buffer = Buffer.from(await res.arrayBuffer());
                // 元のファイル名を保持（取得できない場合はフォールバック）
                const fileName = att.name || `file_${index}`;
                return new AttachmentBuilder(buffer, { name: fileName });
            })
        );

        // 2. 画像ファイルとその他のファイルを分類
        const imageEmbeds: any[] = [];

        // 元の添付ファイル情報から contentType を確認
        attachments.forEach((att, index) => {
            const isImage = att.contentType?.startsWith('image/');

            if (isImage) {
                const fileName = files[index].name;
                if (imageEmbeds.length === 0) {
                    // 1枚目の画像：メインの削除ログ Embed にセット
                    imageEmbeds.push({
                        description: msg.content ?? "-# (なし)",
                        author: getUserInfo(msg),
                        color: 0xff0000,
                        image: { url: `attachment://${fileName}` },
                    });
                } else {
                    // 2枚目以降の画像：画像表示用 Embed
                    imageEmbeds.push({
                        image: { url: `attachment://${fileName}` },
                    });
                }
            }
        });

        // 画像が1枚もなかった場合は、通常のログ Embed を1つだけ用意
        const embeds = imageEmbeds.length > 0 ? imageEmbeds : [
            {
                description: msg.content ?? "-# (なし)",
                author: getUserInfo(msg),
                color: 0xff0000,
            }
        ];

        // 3. 送信
        await loggingCh.send({
            content: `\`${msg.author.username}\`の<#${msg.channel.id}>内のメッセージが削除されました:`,
            embeds,
            files,
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