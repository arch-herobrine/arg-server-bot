import { Client, Collection, Interaction, CommandInteractionOption, ApplicationCommandDataResolvable, BaseInteraction, ChatInputCommandInteraction } from "discord.js";
import Logger from "@arch-herobrine/logger.js";
export type InteractionFunc = (int: Interaction, client: Client, logger: Logger) => void;
declare module "discord.js" {
    interface Client {
        btns: Collection<string, BtnContent>
        cmds: Collection<string, CmdContent>;
    }
    interface CmdContent {
        "data": ApplicationCommandData;
        "exec": InteractionFunc;
    }
    interface BtnContent {
        "data": string;
        "exec": InteractionFunc;
    }
}
