import {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  type VoiceConnection,
} from "@discordjs/voice";
import { MessageFlags } from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  VoiceBasedChannel,
} from "discord.js";

class VoiceService {
  private readonly connections = new Map<string, VoiceConnection>();

  async join(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = await guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    const voiceChannel = member?.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({
        content: "You must be in a voice channel to use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existingConnection = this.connections.get(guild.id);
    if (
      existingConnection &&
      existingConnection.joinConfig.channelId === voiceChannel.id &&
      existingConnection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      await interaction.reply({
        content: `I'm already haunting **${voiceChannel.name}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    // Clean up any existing connection before joining a new channel
    existingConnection?.destroy();
    this.connections.delete(guild.id);

    let connection: VoiceConnection | undefined;

    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: true,
      });

      this.connections.set(guild.id, connection);
      this.setupAutoRejoin(connection, voiceChannel, guild);

      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      await interaction.editReply({
        content: `👻 Ghostseat is now haunting **${voiceChannel.name}**. Use \`/leave\` to make it vanish.`,
      });
    } catch (error) {
      console.error(
        `[VoiceService] Failed to join channel in guild ${guild.id}:`,
        error,
      );

      connection?.destroy();
      this.connections.delete(guild.id);

      await interaction.editReply({
        content: "Failed to join the voice channel. Please try again.",
      });
    }
  }

  async leave(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const connection = this.connections.get(guild.id);
    if (!connection) {
      await interaction.reply({
        content: "I am not currently in a voice channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    connection.destroy();
    this.connections.delete(guild.id);

    await interaction.reply({
      content: "👋 Ghostseat has left the building. Boo!",
    });
  }

  destroyAll(): void {
    for (const connection of this.connections.values()) {
      connection.destroy();
    }

    this.connections.clear();
  }

  private setupAutoRejoin(
    connection: VoiceConnection,
    channel: VoiceBasedChannel,
    guild: Guild,
  ): void {
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // If it transitions to Signalling or Connecting within 5s, it's self-healing — leave it
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        // Still disconnected — force rejoin if still tracked
        if (this.connections.has(guild.id)) {
          try {
            connection.rejoin({
              channelId: channel.id,
              selfDeaf: true,
              selfMute: true,
            });
          } catch {
            connection.destroy();
            this.connections.delete(guild.id);
          }
        }
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      this.connections.delete(guild.id);
    });

    connection.on("error", (error) => {
      console.error(
        `[VoiceService] Connection error in guild ${guild.id}:`,
        error,
      );
    });
  }
}

export const voiceService = new VoiceService();
