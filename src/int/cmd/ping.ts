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
        "name": "ping",
        "description": "ping/生死確認",
    },
    async exec(int, client) {
        if (!int.isChatInputCommand()) return;
        const sent = await int.reply({
            "embeds": [{
                "title": "Pinging...",
                "color": 0x777777
            }],
        });
        const apiPing = Math.abs(sent.createdTimestamp - Date.now());
        const wsPing = client.ws.ping;
        int.editReply({
            "embeds": [{
                "title": "Pong!",
                "color": 0x71f26d,
                "fields": [
                    {
                        "name": "WebSocket Ping",
                        "value": `${wsPing}ms`,
                        "inline": true
                    },
                    {
                        "name": "API Endpoint Ping",
                        "value": `${apiPing}ms`,
                        "inline": true
                    }
                ]
            }]
        })
    }
}

export default data;