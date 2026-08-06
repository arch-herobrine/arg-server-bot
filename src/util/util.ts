// util.ts
import {GuildMember, Message, PermissionsBitField, TextChannel} from "discord.js";
import dice, { IDiceResult } from "./dice"; // 既存の dice.ts から読み込み

// ==========================================
// 1. 型定義
// ==========================================
export type RollResultType = "success" | "failed" | "critical" | "fumble";

// ==========================================
// 2. Discord表示・判定用ヘルパー関数
// ==========================================

/** ユーザー情報取得（DM安全対策：memberがnullでもauthorへフォールバック） */
export const getUserInfo = (msg: Message) => ({
    name: msg.member?.displayName ?? msg.author.displayName,
    icon_url: msg.member?.avatarURL() ?? msg.author.avatarURL() ?? undefined,
});

/** 文字列サニタイズ・長制限（マークダウンエスケープ等） */
export const sanitizeExp = (exp: string, maxLength: number = 255): string => {
    let cleaned = exp.replaceAll("**", "^").replaceAll("*", "\\*");
    if (cleaned.length > maxLength) {
        cleaned = cleaned.substring(0, maxLength - 1) + "…";
    }
    return cleaned;
};

/** CoC (CC/CCB) 判定ロジック */
export const evaluateCoC = (roll: number, target: number, isCCB: boolean): RollResultType => {
    if (roll === 100) return "fumble";

    if (roll <= target) {
        if (isCCB && roll <= 5) return "critical";
        if (!isCCB && roll === 1) return "critical";
        return "success";
    } else {
        if (isCCB && roll >= 96) return "fumble";
        return "failed";
    }
};

/** 競合させたくないBotのIDリスト */
const COMPETING_BOT_IDS = [
    "1016794326115823708", // Sasa Botの実際のクライアントID（分かっていればID指定が確実です）
];

/** チャンネル内に指定した競合Botが存在するか判定する */
export const hasCompetingBot = async (msg: Message): Promise<boolean> => {
    if (!msg.guild) return false;

    // 1. キャッシュからチャンネルメンバーを取得（TextChannel など GuildChannel の場合）
    const channel = msg.channel;
    let members: Map<string, GuildMember> | undefined;

    if ('members' in channel && channel.members) {
        // guild.channels 内のキャッシュされたメンバーコレクション (Collection<string, GuildMember>)
        members = channel.members as any;
    }

    // 2. キャッシュの中に競合 Bot が存在するかチェック
    for (const botId of COMPETING_BOT_IDS) {
        // A. キャッシュ内に Bot が存在する場合
        if (members && members.has(botId)) {
            const member = members.get(botId);
            // オンライン状態かつチャンネルの閲覧・送信権限があるか確認
            if (member && isBotActiveAndViewable(member, channel as TextChannel)) {
                return true;
            }
        }
    }

    // 3. キャッシュにメンバー情報が全くない・または不安な場合のみ API から fetch (フォールバック)
    try {
        // Guild 全体のキャッシュまたは fetch
        for (const botId of COMPETING_BOT_IDS) {
            // guild.members.cache にあるか
            let member = msg.guild.members.cache.get(botId);

            // なければ API から取得
            if (!member) {
                member = await msg.guild.members.fetch(botId).catch(() => undefined);
            }

            if (member && isBotActiveAndViewable(member, channel as TextChannel)) {
                return true;
            }
        }
    } catch (error) {
        // 取得失敗時は競合なしとして扱う
        return false;
    }

    return false;
};

// ヘルパー関数: Bot がアクティブでチャンネルを見られるか判定
const isBotActiveAndViewable = (member: GuildMember, channel: TextChannel): boolean => {
    // チャンネルでの権限確認（見えない・喋れない Bot は競合とみなさない）
    const permissions = channel.permissionsFor(member);
    if (!permissions || !permissions.has(['ViewChannel', 'SendMessages'])) {
        return false;
    }

    // ステータス（オフライン以外か）チェック
    // ※ Gateway Intent で GuildPresences を有効にしている場合のみ正確に取れます
    const status = member.presence?.status;
    if (status && status === 'offline') {
        return false;
    }

    return true;
};



/** 判定結果の日本語表示用ラベル */
export const RESULT_LABELS: Record<RollResultType, string> = {
    success: "成功",
    failed: "失敗",
    critical: "クリティカル",
    fumble: "ファンブル",
};