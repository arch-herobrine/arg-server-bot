// util.ts
import {Message, PermissionsBitField} from "discord.js";
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
const TARGET_BOT_IDS = [
    "1016794326115823708", // Sasa Botの実際のクライアントID（分かっていればID指定が確実です）
];

/** チャンネル内に指定した競合Botが存在するか判定する */
export const hasCompetingBot = async (msg: Message): Promise<boolean> => {
    // 1. DMなどのサーバー外メッセージの場合は競合ボットなし判定
    if (!msg.guild || !msg.channel) {
        return false;
    }
    if (!msg.inGuild()) return false;

    // 2. メンバーの未キャッシュによる判定ミスを防ぐため、最新のメンバー情報をフェッチ
    //    (規模が大きいサーバー対策。必要に応じて omit も可能)
    try {
        await msg.guild.members.fetch();
    } catch (error) {
        console.error('Failed to fetch guild members:', error);
    }

    // 3. サーバー内の全メンバーから、このチャンネルの「ViewChannel (閲覧・表示)」権限を持つメンバーを抽出
    const accessibleMembers = msg.guild.members.cache.filter((member) => {
        // permissionsFor はロール設定やチャンネル個別の権限オーバーライドを自動で計算してくれる
        return member.permissionsIn(msg.channel).has(PermissionsBitField.Flags.ViewChannel);
    });

    // 4. 自分以外の Bot がアクセス可能かどうかを判定
    return accessibleMembers.some((member) => {
        // member に完全な GuildMember 型が付くため、キャストなしで型補完が効く
        return TARGET_BOT_IDS.includes(member.id);
    });
};



/** 判定結果の日本語表示用ラベル */
export const RESULT_LABELS: Record<RollResultType, string> = {
    success: "成功",
    failed: "失敗",
    critical: "クリティカル",
    fumble: "ファンブル",
};