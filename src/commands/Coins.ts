import { Command, CommandMessage, Guard, Infos, Rule } from "@typeit/discord";
import { MessageEmbed, NewsChannel, TextChannel, User } from "discord.js";
import { MystBot } from "../MystBot";
import UserModel from "../database/models/User";
import { FieldsEmbed } from "discord-paginationembed";
import { Database } from "../database/Database";
import UserService from "../services/UserService";
import { Inject } from "typescript-ioc";
import * as console from "console";
import {
  InGuildOnly,
  NotBot,
  NotBotMentionInArgs,
  ThrottleMessage,
  WithoutSubCommands,
} from "../guards";
import { Utils } from "../Utils";

const COINS_TOP =
  "https://cdn4.iconfinder.com/data/icons/popular-3/512/best-512.png";
const COINS_EMOJI = "<:coin:742364602662125648>";
const SUB_COMMANDS = ["top", "give"];

export abstract class Coins {
  @Inject
  private userService!: UserService;

  @Command("coins :member")
  @Infos<CommandInfo>({
    description:
      "Shows your coins. Use the user mention to get guild member coins",
    usages: "coins [@member | top | give]",
    category: "Economy",
    coreCommand: true,
  })
  @Guard(
    NotBot(),
    InGuildOnly(),
    WithoutSubCommands(SUB_COMMANDS),
    ThrottleMessage(),
    NotBotMentionInArgs()
  )
  async runCoins(command: CommandMessage) {
    const messageEmbed = new MessageEmbed();
    const author = command.author;
    const contextGuildId = command.guild?.id ?? "";

    const guildMember = command.mentions.members?.first() ?? command.member;

    const userId = guildMember?.user.id ?? author.id;
    try {
      const memberModelInstance = await this.userService.findOneOrCreate(
        userId,
        contextGuildId
      );

      messageEmbed
        .setAuthor(
          `${guildMember?.displayName ?? author.username}'s currency info`,
          guildMember?.user.avatarURL() || author?.avatarURL() || undefined
        )
        .setDescription(
          `__Coins:__ ${memberModelInstance.coins} ${COINS_EMOJI}`
        )
        .setColor("YELLOW");

      return await command.channel.send({ embed: messageEmbed });
    } catch (e) {
      console.error(e);
    }
  }

  @Command(Rule("coins").space("top").end())
  @Infos<CommandInfo>({
    description: "Top members filtered by amount of coins",
    usages: "coins top",
    category: "Economy",
  })
  @Guard(NotBot(), InGuildOnly(), ThrottleMessage())
  async coinsTop(command: CommandMessage) {
    const contextGuildId = command.guild?.id ?? "";
    const memberModels = await this.userService.getAllPositiveCoins(
      contextGuildId
    );

    try {
      const coinsTopEmbed = new FieldsEmbed<UserModel>();

      coinsTopEmbed.embed
        .setAuthor("Coins leaderboard", COINS_TOP)
        .setColor("#FFFFFF");

      return await coinsTopEmbed
        .setAuthorizedUsers([command.author.id])
        .setChannel(
          command.channel as Exclude<typeof command.channel, NewsChannel>
        )
        .setClientAssets({ prompt: "Yo, {{user}}, pick number of page!" })
        .setArray(memberModels)
        .setElementsPerPage(10)
        .setPageIndicator(false)
        .formatField(
          "#",
          (el) => 1 + memberModels.findIndex((v) => el.id === v.id)
        )
        .formatField("User", (el) => `<@${el.userId}>`)
        .formatField("Coins", (el) => el.coins)
        .setPage(1)
        .setTimeout(60000)
        .setNavigationEmojis({
          back: "◀",
          jump: "↗",
          forward: "▶",
          delete: "🗑",
        })
        .build();
    } catch (e) {
      console.error(e.message);
      return await Utils.sendPublicError(
        command.channel as TextChannel,
        "I'm not enough permitted in this guild to perform that action :("
      );
    }
  }

  // @Command("coins award :member")
  // async adminAddCoins(command: CommandMessage) {}

  @Command("coins give :mention :coins")
  @Infos<CommandInfo>({
    description: "Allows you to give some coins to mentioned member",
    usages: "coins give <@member> <amount>",
    category: "Economy",
  })
  @Guard(NotBot(), InGuildOnly(), ThrottleMessage(), NotBotMentionInArgs())
  async giveCoins(command: CommandMessage) {
    const { coins }: { coins: string } = command.args;
    const target = command.guild?.member(command.mentions.users.first() ?? "");
    const targetId = target?.id || target?.user.id;
    const amount = parseInt(coins);
    const contextGuildId = command.member?.guild?.id;

    if (!target || !targetId)
      return Utils.sendPublicNote(command, "target user not found!");

    let targetModelInstance;
    try {
      if (!contextGuildId) throw new Error("Guild id cannot be null");
      targetModelInstance = await this.userService.findOneOrCreate(
        targetId,
        contextGuildId
      );
    } catch (e) {
      console.error(e);
      return (
        command.member &&
        (await Utils.sendSystemErrorDM(command.member, [
          {
            name: "Command",
            value: `${command.commandName} ${command.commandContent}`,
          },
        ]))
      );
    }

    if (!amount || amount <= 0)
      return Utils.sendPublicNote(
        command,
        "amount of icons specified not properly"
      );

    const authorModelInstance = await this.userService.findOne(
      command.author.id,
      contextGuildId
    );

    if (!authorModelInstance || authorModelInstance.coins < amount)
      return command.channel.send(
        `**${command.author.username}**, you are not rich enough to give so many coins`
      );

    if (command.author.id === targetId)
      return command.channel.send(
        `**${command.author.username}**, transferring coins to yourself will not work. It would be so simple...`
      );

    try {
      await Database.instance.transaction(async (t) =>
        Promise.all([
          this.userService.update(
            authorModelInstance.userId,
            contextGuildId,
            { coins: authorModelInstance.coins - amount },
            t
          ),
          this.userService.update(
            targetModelInstance.userId,
            contextGuildId,
            { coins: targetModelInstance.coins + amount },
            t
          ),
        ])
      );
    } catch (e) {
      console.error(e);
      return (
        command.member &&
        (await Utils.sendSystemErrorDM(command.member, [
          {
            name: "Command",
            value: `${command.commandName} ${command.commandContent}`,
          },
        ]))
      );
    }

    return command.channel.send(
      `**${command.author.username}** sends to **${target.user.username}** ${amount} Coins ${COINS_EMOJI}`
    );
  }
}
