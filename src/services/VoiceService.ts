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

const voiceConnectionsByGuild = new Map<string, VoiceConnection>();

export async function joinVoice(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
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

  const existingConnection = voiceConnectionsByGuild.get(guild.id);
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

  existingConnection?.destroy();
  voiceConnectionsByGuild.delete(guild.id);

  let connection: VoiceConnection | undefined;

  try {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });

    voiceConnectionsByGuild.set(guild.id, connection);
    setupAutoRejoin(connection, voiceChannel, guild);

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
    voiceConnectionsByGuild.delete(guild.id);

    await interaction.editReply({
      content: "Failed to join the voice channel. Please try again.",
    });
  }
}

export async function leaveVoice(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const connection = voiceConnectionsByGuild.get(guild.id);
  if (!connection) {
    await interaction.reply({
      content: "I am not currently in a voice channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  connection.destroy();
  voiceConnectionsByGuild.delete(guild.id);

  await interaction.reply({
    content: "👋 Ghostseat has left the building. Boo!",
  });
}

export function destroyAllVoiceConnections(): void {
  for (const connection of voiceConnectionsByGuild.values()) {
    connection.destroy();
  }

  voiceConnectionsByGuild.clear();
}

function setupAutoRejoin(
  connection: VoiceConnection,
  channel: VoiceBasedChannel,
  guild: Guild,
): void {
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      if (voiceConnectionsByGuild.has(guild.id)) {
        try {
          connection.rejoin({
            channelId: channel.id,
            selfDeaf: true,
            selfMute: true,
          });
        } catch {
          connection.destroy();
          voiceConnectionsByGuild.delete(guild.id);
        }
      }
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    voiceConnectionsByGuild.delete(guild.id);
  });

  connection.on("error", (error) => {
    console.error(
      `[VoiceService] Connection error in guild ${guild.id}:`,
      error,
    );
  });
}
