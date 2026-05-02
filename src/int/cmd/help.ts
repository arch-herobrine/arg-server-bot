import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    CmdContent,
    ComponentType
} from "discord.js";
import config from "../../config.js";

const data: CmdContent = {
    "data": {
        "name": "help",
        "description": "helpを表示",
    },
    async exec(int, client) {
        if (!int.isChatInputCommand()) return;
        int.reply({
            "embeds": [{
                "title": "使い方とかいろいろ",
                "color": 0x71f26d,
                "fields": [
                    {
                        "name": "CCB/CC",
                        "value": "`CCB<=(計算式)`、`CC<=(計算式)`とすることでココフォリアみたいにダイスが振れます。後ろに余計な文字列があっても振れます。計算式には整数と\"+\",\"-\",\"\\*\",\"/\",\"()\"が使えます。\n先頭に`x(整数)`と付けると一気に指定した回数振れます\n"
                            +"例: `CCB<=10`, `CCB<=75/2`, `CCB<=12*5`, `CCB<=50+((16-8)*5)`, `x5 CCB<=80`",
                    },
                    {
                        "name": "その他ダイス",
                        "value": "`dice (ダイスコード)[=/<>/<=/>=/</>][計算式]`とすることでココフォリアみたいにダイスが振れます。後ろに余計な文字列があっても振れます。計算式には整数と\"+\",\"-\",\"\\*\",\"/\",\"()\"が使えます。\nこっちは`x(整数)`ってやって反復することは**できません**。\n"
                            + "例: `dice1d6<>1`, `dice2d6+5>=10`, `dice(2d6+1d4)*2`, `dice(1d6-1d4)/2`",
                    }
                ]
            }]
        })
    }
}

export default data;