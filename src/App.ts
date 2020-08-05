import { Client } from "@typeit/discord";
import { Container } from "typescript-ioc";
import Throttle from "./logic/Throttle";

export default class App {
  private static _client: Client;

  static get Client(): Client {
    return this._client;
  }

  static async start(): Promise<void> {
    this._client = new Client();

    Container.bind(Throttle);

    try {
      // In the login method, you must specify the glob string to load your classes (for the framework).
      // In this case that's not necessary because the entry point of your application is this file.
      await this._client.login(
        process.env.DISCORD_TOKEN ?? "",
        `${__dirname}/ThunderBot.ts`, // glob string to load the classes
        `${__dirname}/ThunderBot.js` // If you compile your bot, the file extension will be .js
      );
    } catch (e) {
      console.error("Login failed!");
    }
  }
}
