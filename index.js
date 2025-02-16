require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes,
  AttachmentBuilder
} = require("discord.js");

const { createTranscript } = require("discord-html-transcripts");
const config = require("./config.js"); // Your config file (categories, IDs, etc.)

// Load environment variables
const {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  SUPORTE_ROLE_ID
} = process.env;

/**
 * Main structure:
 *
 * ticketInfo: channelID -> {
 *   userId: string,
 *   protocol: string,
 *   categoryId: string,
 *   openTimestamp: number,
 *   lastInteraction: number,
 *   lastInteractionBy: string,
 *   inactivityWarned: boolean,
 *   inactivityWarnedAt: number,
 *   pingCooldowns: {
 *     support: number,
 *     author: number
 *   }
 * }
 *
 * userTicketChannel: userID -> channelID
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const ticketInfo = new Map();
const userTicketChannel = new Map();

// Inactivity and cooldown parameters
const INACTIVITY_THRESHOLD = 20 * 60_000; // 20 minutes
const AUTO_CLOSE_THRESHOLD = 30 * 60_000; // 30 more minutes after warning
const CHECK_INTERVAL = 60_000;            // checks every 1 minute
const PING_COOLDOWN = 5 * 60_000;         // 5 minutes
const WAIT_MESSAGE = 10;                  // "wait 10 minutes" text

// ---------------------------------------------------------------------
// Check if a member has the support role
// ---------------------------------------------------------------------
function isStaff(member) {
  // If in your config you have "suporteRoleID", you can use config.suporteRoleID;
  // otherwise, use SUPORTE_ROLE_ID directly.
  return member.roles.cache.has(SUPORTE_ROLE_ID);
}

// Generate a unique ticket protocol
function generateProtocol() {
  const now = Date.now().toString();
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `${now}-${rand}`;
}

// ---------------------------------------------------------------------
// 1) Register slash commands
// ---------------------------------------------------------------------
async function registerSlashCommands() {
  const cmds = [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Creates the ticket panel in the current channel."),

    new SlashCommandBuilder()
      .setName("reopen")
      .setDescription("Reopens a ticket previously closed (archived).")
      .addChannelOption(option =>
        option
          .setName("channel")
          .setDescription("Select the archived channel you want to reopen.")
          .setRequired(true)
      )
  ];

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: cmds.map(cmd => cmd.toJSON()) }
    );
    console.log("✅ Slash commands (setup/reopen) registered LOCALLY!");
  } catch (err) {
    console.error("Error registering slash commands:", err);
  }
}

// ---------------------------------------------------------------------
// 2) Auto-close tickets due to inactivity
// ---------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();

  ticketInfo.forEach((data, channelId) => {
    const {
      userId,
      lastInteraction,
      lastInteractionBy,
      inactivityWarned,
      inactivityWarnedAt
    } = data;

    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    const timeSinceLast = now - lastInteraction;

    // If not warned yet and past the threshold, warn now
    if (!inactivityWarned && timeSinceLast >= INACTIVITY_THRESHOLD) {
      if (lastInteractionBy === userId) {
        // User was the last to speak -> staff might be busy
        const embedStaffBusy = new EmbedBuilder()
          .setTitle("🔔 Our team may be busy")
          .setDescription(
            "A long interval has passed without a response. " +
            "Our staff might be under heavy load, but someone will help you soon!\n\n" +
            `*(Time: Today at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })})*`
          )
          .setColor("#ffa500");

        channel.send({ embeds: [embedStaffBusy] });
      } else {
        // Staff or someone else was last -> ping the ticket author
        const embedUserAbsent = new EmbedBuilder()
          .setTitle("🔔 Are you still there?")
          .setDescription(
            "We need your response to continue with your request.\n\n" +
            `*(Time: Today at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })})*`
          )
          .setColor("#ffd100");

        channel.send({
          content: `<@${userId}>`,
          embeds: [embedUserAbsent]
        });
      }

      data.inactivityWarned = true;
      data.inactivityWarnedAt = now;
      ticketInfo.set(channelId, data);
      return;
    }

    // If already warned, check if it exceeded AUTO_CLOSE_THRESHOLD
    if (inactivityWarned && now - inactivityWarnedAt >= AUTO_CLOSE_THRESHOLD) {
      archiveTicket(channelId, "Closed due to prolonged inactivity.");
    }
  });
}, CHECK_INTERVAL);

// ---------------------------------------------------------------------
// 3) Update "who spoke last" on incoming messages
// ---------------------------------------------------------------------
client.on("messageCreate", (message) => {
  if (!message.guild || message.author.bot) return;

  const data = ticketInfo.get(message.channel.id);
  if (!data) return;

  data.lastInteraction = Date.now();
  data.lastInteractionBy = message.author.id;
  ticketInfo.set(message.channel.id, data);
});

// ---------------------------------------------------------------------
// 4) Function to archive (close) a ticket
// ---------------------------------------------------------------------
async function archiveTicket(channelId, reason = "No specific reason") {
  const data = ticketInfo.get(channelId);
  if (!data) return;

  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const guild = channel.guild;
  const logChan = guild.channels.cache.get(config.logChannelID);

  try {
    // 1) Generate transcript
    const messages = await channel.messages.fetch({ limit: 100 });
    const messageCount = messages.size;
    const transcriptHtml = await createTranscript(channel, {
      limit: -1,
      returnType: "string",
      saveImages: true,
      poweredBy: false
    });

    const customFooter = `<div style="text-align:center;width:100%;background-color:#36393e;color:white;padding:10px;">
      Exported ${messageCount} message(s) from the server: ${guild.name}
    </div></discord-messages></body></html>`;

    const finalHtml = transcriptHtml.replace("</body></html>", customFooter);

    const attachment = new AttachmentBuilder(
      Buffer.from(finalHtml, "utf-8"),
      { name: `transcript-${channel.name}.html` }
    );

    // 2) Duration
    const openedAt = data.openTimestamp || Date.now();
    const durationMs = Date.now() - openedAt;
    const durationMin = Math.floor(durationMs / 60000);

    // 3) Summary embed
    const summaryEmbed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle("🛑 Ticket Archived")
      .setDescription(`Reason: **${reason}**`)
      .addFields(
        { name: "Ticket Author:", value: `<@${data.userId}>`, inline: true },
        { name: "Protocol:", value: `\`${data.protocol}\``, inline: true },
        { name: "Ticket Duration:", value: `${durationMin} min`, inline: false },
        { name: "Channel:", value: `\`${channel.name}\``, inline: true }
      )
      .setTimestamp();

    // 4) Send in the ticket channel
    await channel.send({
      embeds: [summaryEmbed],
      files: [attachment]
    });

    // 5) Send in the log channel
    if (logChan) {
      await logChan.send({
        embeds: [summaryEmbed],
        files: [attachment]
      });
    }

    // 6) Move to closed category
    await channel.setParent(config.closedCategoryID).catch(() => null);

    // 7) Rename and remove the author's perms
    await channel.edit({ name: `closed-${channel.name}` }).catch(() => null);

    const authorId = data.userId;
    await channel.permissionOverwrites.edit(authorId, {
      ViewChannel: false,
      SendMessages: false
    }).catch(() => null);

    ticketInfo.delete(channelId);
    userTicketChannel.delete(authorId);

  } catch (err) {
    console.error("Error archiving ticket:", err);
  }
}

// ---------------------------------------------------------------------
// 5) If the user leaves the server, archive their ticket
// ---------------------------------------------------------------------
client.on("guildMemberRemove", (member) => {
  const channel = userTicketChannel.get(member.id);
  if (!channel) return;

  console.log(`User ${member.user.tag} has left the server. Archiving their ticket...`);
  archiveTicket(channel, "Ticket author left the server.");
});

// ---------------------------------------------------------------------
// 6) Bot initialization
// ---------------------------------------------------------------------
client.once("ready", async () => {
  console.log(`🤖 Bot is online as ${client.user.tag}`);
  await registerSlashCommands();
});

// ---------------------------------------------------------------------
// 7) Handle interactions (slash commands, menus, buttons, modals)
// ---------------------------------------------------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.guild) return;

  // ============= SLASH COMMANDS =============
  if (interaction.isChatInputCommand()) {
    // -----------------------------------------
    // /setup
    // -----------------------------------------
    if (interaction.commandName === "setup") {
      // Check if user is staff
      if (!isStaff(interaction.member)) {
        const denyEmbed = new EmbedBuilder()
          .setTitle("❌ Access Denied")
          .setDescription("You do not have permission to use this command.")
          .setColor("Red");
        return interaction.reply({ embeds: [denyEmbed], ephemeral: true });
      }

      const { guild } = interaction;
      const icon = guild.iconURL({ dynamic: true, size: 1024 }) || "";

      // Panel embed
      const panelEmbed = new EmbedBuilder()
        .setAuthor({ name: `Support Center - ${guild.name}`, iconURL: icon })
        .setTitle("📩 How can we help?")
        .setDescription(
          "🛠️ **Welcome to the Support Center!**\n" +
          "We are here to help you with any doubts, problems, or requests.\n\n" +
          "📝 **How to open a ticket?**\n" +
          "🔹 Choose one of the categories below that best matches your request.\n" +
          "🔹 Click on the desired category and wait for the ticket to be created.\n" +
          "🔹 Our team will be notified and respond as soon as possible! ⏳\n\n" +
          "💬 **Need urgent help?**\n" +
          "> Provide as many important details as possible to speed up our assistance.\n\n" +
          "⚠️ **Notes:**\n" +
          "> - Do not spam or open unnecessary tickets.\n" +
          "> - All tickets are recorded and monitored.\n" +
          "> - Courtesy and respect are fundamental.\n\n" +
          "Thank you for using our **Support System**! 💎"
        )
        .setColor("#00ff20")
        .setThumbnail(icon)
        .setFooter({
          text: "Support System • We are here to help you!",
          iconURL: icon
        });

      // Build menu from config.categories
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_category")
        .setPlaceholder("Select a category...")
        .addOptions(
          config.categories.map(cat => ({
            label: cat.label,
            description: cat.description,
            emoji: cat.emoji,
            value: cat.id
          }))
        );

      const menuRow = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.channel.send({
        embeds: [panelEmbed],
        components: [menuRow]
      });

      const setupOk = new EmbedBuilder()
        .setDescription("✅ Ticket panel created successfully!")
        .setColor("Green");
      return interaction.reply({ embeds: [setupOk], ephemeral: true });
    }

    // -----------------------------------------
    // /reopen
    // -----------------------------------------
    if (interaction.commandName === "reopen") {
      // Check if user is staff
      if (!isStaff(interaction.member)) {
        const denyEmbed = new EmbedBuilder()
          .setTitle("❌ Access Denied")
          .setDescription("You do not have permission to reopen tickets.")
          .setColor("Red");
        return interaction.reply({ embeds: [denyEmbed], ephemeral: true });
      }

      const channel = interaction.options.getChannel("channel");
      if (!channel) {
        const noChan = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("Invalid or unselected channel.")
          .setColor("Red");
        return interaction.reply({ embeds: [noChan], ephemeral: true });
      }

      // Check if the channel is in the closed category
      if (channel.parentId !== config.closedCategoryID) {
        const notClosed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("This channel is not under the closed tickets category.")
          .setColor("Red");
        return interaction.reply({ embeds: [notClosed], ephemeral: true });
      }

      try {
        // Move the channel back and rename
        await channel.setParent(config.ticketCategoryID);
        await channel.edit({ name: channel.name.replace(/^closed-/, "reopened-") });

        const reopened = new EmbedBuilder()
          .setTitle("✅ Ticket Reopened")
          .setDescription(`Channel <#${channel.id}> has been moved back to open tickets.`)
          .setColor("Green");

        return interaction.reply({ embeds: [reopened], ephemeral: true });

      } catch (err) {
        console.error("Error reopening ticket:", err);
        const failReopen = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("Failed to reopen the ticket. Check the bot's permissions.")
          .setColor("Red");
        return interaction.reply({ embeds: [failReopen], ephemeral: true });
      }
    }
  }

  // ============= SELECT MENU =============
  if (interaction.isStringSelectMenu() && interaction.customId === "select_category") {
    const { guild, member } = interaction;
    const cat = config.categories.find(c => c.id === interaction.values[0]);

    if (!cat) {
      const invalidCat = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("Invalid or unrecognized category.")
        .setColor("Red");
      return interaction.reply({ embeds: [invalidCat], ephemeral: true });
    }

    // Check if the user already has an open ticket
    if (userTicketChannel.has(member.id)) {
      const alreadyOpen = userTicketChannel.get(member.id);
      const embed = new EmbedBuilder()
        .setTitle("❌ You already have an open ticket")
        .setDescription(`Please close your current ticket (<#${alreadyOpen}>) before opening another.`)
        .setColor("Red");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const proto = generateProtocol();
    try {
      const ticketChannel = await guild.channels.create({
        name: `${cat.emoji}・${member.user.username}`,
        parent: config.ticketCategoryID,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.AttachFiles
            ]
          }
        ]
      });

      // Register ticket info
      ticketInfo.set(ticketChannel.id, {
        userId: member.id,
        protocol: proto,
        categoryId: cat.id,
        openTimestamp: Date.now(),
        lastInteraction: Date.now(),
        lastInteractionBy: member.id,
        inactivityWarned: false,
        inactivityWarnedAt: 0,
        pingCooldowns: {
          support: 0,
          author: 0
        }
      });

      userTicketChannel.set(member.id, ticketChannel.id);

      // Ticket welcome embed
      const tickEmbed = new EmbedBuilder()
        .setColor(cat.color || "#09ff00")
        .setTitle(":wave: Welcome to the Support System!")
        .setDescription(
          `Hello, <@${member.id}>! 👋\n\n` +
          `🔖 **Ticket / Protocol:** \`${proto}\`\n` +
          `🗂️ **Category:** ${cat.emoji} - ${cat.label}\n\n` +
          `📜 **Description:** This channel was created to provide personalized support.\n` +
          `Please provide **as many details as possible** to speed up assistance.\n\n` +
          `⏱️ **Estimated Response Time:** up to 15 minutes during business hours.\n\n` +
          `⚠️ **Notes:**\n` +
          `- Maintain respect and courtesy.\n` +
          `- Avoid repeatedly pinging the team.\n` +
          `- The channel will be closed at the end, generating a history.\n\n` +
          `💎 **Thank you for using our support system!**`
        )
        .setFooter({
          text: "Support System • Please wait, we will assist you soon!"
        });

      // Ticket control buttons
      const controlsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Close Ticket")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("add_member")
          .setLabel("Add Member")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("remove_member")
          .setLabel("Remove Member")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("ping_support")
          .setLabel("Call Support")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ping_author")
          .setLabel("Call Author")
          .setStyle(ButtonStyle.Secondary)
      );

      await ticketChannel.send({
        content: `<@${member.id}>`,
        embeds: [tickEmbed],
        components: [controlsRow]
      });

      const successEmbed = new EmbedBuilder()
        .setDescription(`✅ Your ticket has been successfully created: <#${ticketChannel.id}>`)
        .setColor("Green");
      return interaction.reply({ embeds: [successEmbed], ephemeral: true });

    } catch (err) {
      console.error("Error creating ticket channel:", err);
      const failEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("Failed to create the ticket channel. Check the bot permissions.")
        .setColor("Red");
      return interaction.reply({ embeds: [failEmbed], ephemeral: true });
    }
  }

  // ================ BUTTONS ================
  if (interaction.isButton()) {
    const { customId, channel, user } = interaction;
    const data = ticketInfo.get(channel.id);

    if (!data) {
      const notTicket = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("This channel is not recognized as a valid ticket.")
        .setColor("Red");
      return interaction.reply({ embeds: [notTicket], ephemeral: true });
    }

    // Update last interaction
    data.lastInteraction = Date.now();
    data.lastInteractionBy = user.id;
    ticketInfo.set(channel.id, data);

    // Button: "Call Support"
    if (customId === "ping_support") {
      await interaction.deferReply({ ephemeral: true });

      const now = Date.now();
      if (now - data.pingCooldowns.support < PING_COOLDOWN) {
        const cooldownEmbed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription(
            `Wait **${WAIT_MESSAGE} minutes** before calling support again.\n` +
            `*(Current time: Today at ${new Date().toLocaleTimeString("en-US",{ hour: "2-digit", minute: "2-digit" })})*`
          )
          .setColor("Red");
        return interaction.editReply({ embeds: [cooldownEmbed] });
      }

      try {
        const embedNotify = new EmbedBuilder()
          .setTitle("👀 Support Team Notified")
          .setDescription("Please wait. Our team will arrive soon to assist you.")
          .setColor("#FFFF00");

        await channel.send({ embeds: [embedNotify] });

        data.pingCooldowns.support = now;
        ticketInfo.set(channel.id, data);

        const successPing = new EmbedBuilder()
          .setDescription("✅ Support called successfully!")
          .setColor("Green");
        return interaction.editReply({ embeds: [successPing] });

      } catch (err) {
        console.error("Error calling support:", err);
        const failEmbed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("Failed to notify the support team. Check the bot permissions.")
          .setColor("Red");
        return interaction.editReply({ embeds: [failEmbed] });
      }
    }

    // Button: "Call Author"
    if (customId === "ping_author") {
      await interaction.deferReply({ ephemeral: true });

      const now = Date.now();
      if (now - data.pingCooldowns.author < PING_COOLDOWN) {
        const cooldownEmbed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription(
            `Wait **${WAIT_MESSAGE} minutes** before calling the author again.\n` +
            `*(Current time: Today at ${new Date().toLocaleTimeString("en-US",{ hour: "2-digit", minute: "2-digit" })})*`
          )
          .setColor("Red");
        return interaction.editReply({ embeds: [cooldownEmbed] });
      }

      try {
        const embedNotify = new EmbedBuilder()
          .setTitle("📢 Calling the Author")
          .setDescription("We hope they respond soon so we can proceed.")
          .setColor("#FFFF00");

        await channel.send({
          content: `<@${data.userId}>`,
          embeds: [embedNotify]
        });

        data.pingCooldowns.author = now;
        ticketInfo.set(channel.id, data);

        const successPing = new EmbedBuilder()
          .setDescription("✅ Author notified successfully!")
          .setColor("Green");
        return interaction.editReply({ embeds: [successPing] });

      } catch (err) {
        console.error("Error calling author:", err);
        const failEmbed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("Failed to mention the author. Check the bot permissions.")
          .setColor("Red");
        return interaction.editReply({ embeds: [failEmbed] });
      }
    }

    // Buttons: "Add/Remove Member"
    if (customId === "add_member" || customId === "remove_member") {
      try {
        const modal = new ModalBuilder()
          .setCustomId(customId === "add_member" ? "modal_add" : "modal_rem")
          .setTitle(
            customId === "add_member"
              ? "Add Member to Ticket"
              : "Remove Member from Ticket"
          );

        const input = new TextInputBuilder()
          .setCustomId("member_id")
          .setLabel("User ID:")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const rowModal = new ActionRowBuilder().addComponents(input);
        modal.addComponents(rowModal);

        await interaction.showModal(modal);
      } catch (e) {
        console.error("Error displaying modal:", e);
        const modalError = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("There was an issue displaying the modal. Try again.")
          .setColor("Red");
        return interaction.reply({ embeds: [modalError], ephemeral: true });
      }
    }

    // Button: "Close Ticket"
    if (customId === "close_ticket") {
      await interaction.deferReply({ ephemeral: true });
      archiveTicket(channel.id, `Manually closed by <@${user.id}>.`);

      const closing = new EmbedBuilder()
        .setDescription("✅ This ticket will be archived shortly.")
        .setColor("Green");
      return interaction.editReply({ embeds: [closing] });
    }
  }

  // =============== MODALS ===============
  if (interaction.isModalSubmit()) {
    const { customId, channel, guild } = interaction;
    const data = ticketInfo.get(channel.id);

    if (!data) {
      const invalidTicket = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("This channel is not recognized as a valid ticket.")
        .setColor("Red");
      return interaction.reply({ embeds: [invalidTicket], ephemeral: true });
    }

    data.lastInteraction = Date.now();
    data.lastInteractionBy = interaction.user.id;
    ticketInfo.set(channel.id, data);

    if (customId === "modal_add" || customId === "modal_rem") {
      await interaction.deferReply({ ephemeral: true });

      const memId = interaction.fields.getTextInputValue("member_id")?.trim();
      if (!memId) {
        const noId = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("No user ID was provided.")
          .setColor("Red");
        return interaction.editReply({ embeds: [noId] });
      }

      const member = await guild.members.fetch(memId).catch(() => null);
      if (!member) {
        const invalidId = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("User not found or invalid ID.")
          .setColor("Red");
        return interaction.editReply({ embeds: [invalidId] });
      }

      if (customId === "modal_add") {
        try {
          await channel.permissionOverwrites.edit(member.id, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true
          });
          const addEmbed = new EmbedBuilder()
            .setDescription(`✅ User **${member.user.username}** has been added to the ticket!`)
            .setColor("Green");
          return interaction.editReply({ embeds: [addEmbed] });

        } catch (err) {
          console.error("Error adding member:", err);
          const failAdd = new EmbedBuilder()
            .setTitle("❌ Error")
            .setDescription("Could not add the member to the ticket. Check the bot permissions.")
            .setColor("Red");
          return interaction.editReply({ embeds: [failAdd] });
        }
      } else {
        // Remove member
        try {
          await channel.permissionOverwrites.delete(member.id);
          const removeEmbed = new EmbedBuilder()
            .setDescription(`❌ User **${member.user.username}** has been removed from the ticket.`)
            .setColor("Red");
          return interaction.editReply({ embeds: [removeEmbed] });

        } catch (err) {
          console.error("Error removing member:", err);
          const failRem = new EmbedBuilder()
            .setTitle("❌ Error")
            .setDescription("Could not remove the member from the ticket. Check the bot permissions.")
            .setColor("Red");
          return interaction.editReply({ embeds: [failRem] });
        }
      }
    }
  }
});

client.login(TOKEN);
